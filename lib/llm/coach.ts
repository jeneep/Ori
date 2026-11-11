import type { ProactivityFrequency } from "@/types/database";

export type UserModel = {
  goals: string[];
  constraints: string;
  proactivity_frequency: ProactivityFrequency;
  full_name: string | null;
};

export type CoachContentSnippet = {
  id: string;
  title: string | null;
  summary: string | null;
  content_type: string;
  source_url: string | null;
};

export type CoachMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type CoachExperimentSuggestion = {
  name: string;
  hypothesis: string;
};

export type CoachLlmResult = {
  reply: string;
  important: boolean;
  proposed_current_view: string | null;
  experiment: CoachExperimentSuggestion | null;
  provider: "openai" | "fallback";
  providerError: string | null;
};

const MAX_CONTENT_SNIPPETS = 6;
const MAX_MESSAGES = 12;

export function getOpenAICoachModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export function formatOpenAIProviderError(detail: string): string {
  const lower = detail.toLowerCase();
  if (
    lower.includes("credit_balance_exhausted") ||
    lower.includes("no credits remaining") ||
    lower.includes("insufficient_quota")
  ) {
    return "OpenAI has no credits remaining. Add billing credits at platform.openai.com, then retry.";
  }
  if (lower.includes("incorrect api key") || lower.includes("invalid_api_key")) {
    return "OPENAI_API_KEY is invalid. Update the secret and retry.";
  }
  return detail;
}

/** Lightweight chat-completions probe — models list can succeed even with zero credits. */
export async function probeOpenAICoachAccess(): Promise<{
  ok: boolean;
  openaiConfigured: boolean;
  model: string;
  error: string | null;
}> {
  const model = getOpenAICoachModel();
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      ok: false,
      openaiConfigured: false,
      model,
      error: "OPENAI_API_KEY is not set in this runtime.",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 40,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Return JSON only: {"reply":"ok","important":false,"proposed_current_view":null,"experiment":null}',
          },
          {
            role: "user",
            content: "Health check. Reply with reply=\"ok\".",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      let detail = `OpenAI HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errorBody) as {
          error?: { message?: string; code?: string };
        };
        if (parsed.error?.message) {
          detail = parsed.error.message;
          if (parsed.error.code) detail += ` (${parsed.error.code})`;
        }
      } catch {
        if (errorBody) detail = errorBody.slice(0, 300);
      }
      return {
        ok: false,
        openaiConfigured: true,
        model,
        error: formatOpenAIProviderError(detail),
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return {
        ok: false,
        openaiConfigured: true,
        model,
        error: "OpenAI returned an empty health-check response.",
      };
    }

    return {
      ok: true,
      openaiConfigured: true,
      model,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      openaiConfigured: true,
      model,
      error: formatOpenAIProviderError(
        error instanceof Error ? error.message : "OpenAI request failed."
      ),
    };
  }
}

export function buildUserModelSummary(model: UserModel): string {
  const goals =
    model.goals.length > 0
      ? model.goals.map((goal, i) => `${i + 1}. ${goal}`).join("\n")
      : "(none set)";
  const constraints = model.constraints.trim() || "(none set)";
  const name = model.full_name?.trim() || "User";

  return [
    `Name: ${name}`,
    `Goals:\n${goals}`,
    `Constraints: ${constraints}`,
    `Proactivity: ${model.proactivity_frequency}`,
  ].join("\n");
}

export async function generateCoachReply(input: {
  topicTitle: string;
  userModel: UserModel;
  currentView: string;
  content: CoachContentSnippet[];
  messages: CoachMessage[];
  userMessage: string;
}): Promise<CoachLlmResult> {
  const fallback = {
    ...buildFallbackReply(input),
    provider: "fallback" as const,
    providerError: null as string | null,
  };
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      ...fallback,
      providerError: "OPENAI_API_KEY is not set in this runtime.",
    };
  }

  const contentBlock = input.content
    .slice(0, MAX_CONTENT_SNIPPETS)
    .map((item, index) => {
      const summary = item.summary || "(no summary)";
      return `${index + 1}. [${item.content_type}] ${item.title || "Untitled"}\n   ${summary}${
        item.source_url ? `\n   URL: ${item.source_url}` : ""
      }`;
    })
    .join("\n");

  const history = input.messages
    .slice(-MAX_MESSAGES)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAICoachModel(),
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are Ori, a thoughtful coaching partner.",
              "Stay consistent with the user's synthesized model (goals/constraints) and the topic's current_view.",
              "Do not invent facts that contradict the current_view; if new info conflicts, note the tension and propose an updated current_view.",
              "Keep replies concise (2-5 short paragraphs max).",
              "Return JSON only with keys:",
              'reply (string), important (boolean), proposed_current_view (string|null), experiment ({name, hypothesis}|null).',
              "Set important=true when the exchange clarified stakes, decisions, conflicts, or new durable understanding.",
              "When important=true, proposed_current_view should be an updated 2-5 sentence synthesis of the topic.",
              "Include experiment when a concrete small test would help; otherwise null.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Topic: ${input.topicTitle}`,
              "",
              "User model:",
              buildUserModelSummary(input.userModel),
              "",
              "Current view:",
              input.currentView.trim() ||
                "(empty — synthesize carefully from available context)",
              "",
              "Recent relevant content:",
              contentBlock || "(none)",
              "",
              "Recent messages:",
              history || "(none)",
              "",
              "New user message:",
              input.userMessage,
            ].join("\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      let detail = `OpenAI HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errorBody) as {
          error?: { message?: string; code?: string };
        };
        if (parsed.error?.message) {
          detail = parsed.error.message;
          if (parsed.error.code) detail += ` (${parsed.error.code})`;
        }
      } catch {
        if (errorBody) detail = errorBody.slice(0, 300);
      }
      return {
        ...fallback,
        providerError: formatOpenAIProviderError(detail),
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return {
        ...fallback,
        providerError: "OpenAI returned an empty response.",
      };
    }

    const normalized = normalizeCoachResult(JSON.parse(raw), fallback.reply);
    return {
      ...normalized,
      provider: "openai",
      providerError: null,
    };
  } catch (error) {
    return {
      ...fallback,
      providerError: formatOpenAIProviderError(
        error instanceof Error ? error.message : "OpenAI request failed."
      ),
    };
  }
}

function normalizeCoachResult(
  value: unknown,
  fallbackReply: string
): Omit<CoachLlmResult, "provider" | "providerError"> {
  const record = (value ?? {}) as Record<string, unknown>;
  const reply =
    typeof record.reply === "string" && record.reply.trim()
      ? record.reply.trim()
      : fallbackReply;
  const important = Boolean(record.important);
  const proposed =
    typeof record.proposed_current_view === "string" &&
    record.proposed_current_view.trim()
      ? record.proposed_current_view.trim()
      : null;

  let experiment: CoachExperimentSuggestion | null = null;
  if (record.experiment && typeof record.experiment === "object") {
    const exp = record.experiment as Record<string, unknown>;
    if (
      typeof exp.name === "string" &&
      exp.name.trim() &&
      typeof exp.hypothesis === "string" &&
      exp.hypothesis.trim()
    ) {
      experiment = {
        name: exp.name.trim(),
        hypothesis: exp.hypothesis.trim(),
      };
    }
  }

  return {
    reply,
    important,
    proposed_current_view: important ? proposed : null,
    experiment,
  };
}

function buildFallbackReply(input: {
  topicTitle: string;
  userModel: UserModel;
  currentView: string;
  content: CoachContentSnippet[];
  userMessage: string;
}): Omit<CoachLlmResult, "provider" | "providerError"> {
  const goalHint = input.userModel.goals[0]
    ? ` Keeping your goal “${input.userModel.goals[0]}” in mind`
    : "";
  const viewHint = input.currentView.trim()
    ? ` Based on the current view, we should stay anchored to: ${input.currentView.trim().slice(0, 220)}`
    : " We do not have a current view yet, so let's clarify what feels most true about this topic.";
  const contentHint =
    input.content[0]?.summary || input.content[0]?.title
      ? ` Recent material worth weighing: ${input.content[0].summary || input.content[0].title}.`
      : "";

  const reply = `Thanks for sharing that about “${input.topicTitle}”.${goalHint}.${viewHint}${contentHint} What feels like the next smallest useful move?`;

  const important =
    input.userMessage.length > 160 ||
    /decide|conflict|afraid|stuck|should i|update/i.test(input.userMessage);

  return {
    reply,
    important,
    proposed_current_view: important
      ? [
          input.currentView.trim() || `Working view for ${input.topicTitle}.`,
          `Latest signal from you: ${input.userMessage.trim().slice(0, 280)}`,
        ].join(" ")
      : null,
    experiment: important
      ? {
          name: "Small reality check",
          hypothesis:
            "A low-stakes next action will reveal whether the current view still holds.",
        }
      : null,
  };
}
