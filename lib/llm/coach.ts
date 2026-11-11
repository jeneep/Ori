import type { PersonaTone, ProactivityFrequency } from "@/types/database";
import {
  callGrokChatCompletions,
  formatGrokProviderError,
  getGrokApiKey,
  getGrokModel,
  readChatCompletionContent,
} from "@/lib/llm/xai";
import {
  buildCoachSystemPrompt,
  buildPersonaFromUserModel,
  DEFAULT_PERSONA_SETTINGS,
  formatPersonaForPrompt,
  normalizePersonaSettings,
} from "@/lib/reasoning/persona";

export type UserModel = {
  goals: string[];
  constraints: string;
  proactivity_frequency: ProactivityFrequency;
  full_name: string | null;
  ori_name: string;
  persona_tone: PersonaTone;
  persona_custom_tone: string;
  persona_guide_note: string;
};

export function toUserModel(
  profile: Partial<UserModel> & {
    goals?: string[] | null;
    constraints?: string | null;
    proactivity_frequency?: ProactivityFrequency | null;
    full_name?: string | null;
  }
): UserModel {
  const persona = normalizePersonaSettings(profile);
  return {
    goals: profile.goals ?? [],
    constraints: profile.constraints ?? "",
    proactivity_frequency: profile.proactivity_frequency ?? "off",
    full_name: profile.full_name ?? null,
    ...persona,
  };
}

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
  /** "grok" when xAI succeeded; "fallback" for offline template replies. */
  provider: "grok" | "fallback";
  providerError: string | null;
};

const MAX_CONTENT_SNIPPETS = 6;
const MAX_MESSAGES = 12;

export function getCoachModel(): string {
  return getGrokModel();
}

export function formatCoachProviderError(detail: string): string {
  return formatGrokProviderError(detail);
}

/** Lightweight chat-completions probe against the Grok / xAI API. */
export async function probeGrokCoachAccess(): Promise<{
  ok: boolean;
  grokConfigured: boolean;
  model: string;
  error: string | null;
}> {
  const model = getGrokModel();
  const apiKey = getGrokApiKey();

  if (!apiKey) {
    return {
      ok: false,
      grokConfigured: false,
      model,
      error:
        "GROK_API_KEY, XAI_API_KEY, or Grok_key is not set in this runtime.",
    };
  }

  const result = await callGrokChatCompletions({
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
        content: 'Health check. Reply with reply="ok".',
      },
    ],
  });

  if (!result.ok) {
    return {
      ok: false,
      grokConfigured: true,
      model,
      error: result.errorDetail,
    };
  }

  const raw = readChatCompletionContent(result.data);
  if (!raw) {
    return {
      ok: false,
      grokConfigured: true,
      model,
      error: "Grok returned an empty health-check response.",
    };
  }

  return {
    ok: true,
    grokConfigured: true,
    model,
    error: null,
  };
}

export function buildUserModelSummary(model: UserModel): string {
  const goals =
    model.goals.length > 0
      ? model.goals.map((goal, i) => `${i + 1}. ${goal}`).join("\n")
      : "(none set)";
  const constraints = model.constraints.trim() || "(none set)";
  const name = model.full_name?.trim() || "User";
  const persona = buildPersonaFromUserModel(model);

  return [
    `Name: ${name}`,
    `Goals:\n${goals}`,
    `Constraints: ${constraints}`,
    `Proactivity: ${model.proactivity_frequency}`,
    "",
    "Persona:",
    formatPersonaForPrompt(persona),
  ].join("\n");
}

export async function generateCoachReply(input: {
  topicTitle: string;
  userModel: UserModel;
  currentView: string;
  content: CoachContentSnippet[];
  messages: CoachMessage[];
  userMessage: string;
  /** Optional precomputed synthetic-reasoning context for richer replies. */
  reasoningContext?: string | null;
  experimentsSummary?: string | null;
}): Promise<CoachLlmResult> {
  const fallback = {
    ...buildFallbackReply(input),
    provider: "fallback" as const,
    providerError: null as string | null,
  };

  if (!getGrokApiKey()) {
    return {
      ...fallback,
      providerError:
        "GROK_API_KEY, XAI_API_KEY, or Grok_key is not set in this runtime.",
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

  const persona = buildPersonaFromUserModel({
    ...DEFAULT_PERSONA_SETTINGS,
    ...input.userModel,
  });

  try {
    const result = await callGrokChatCompletions({
      model: getGrokModel(),
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildCoachSystemPrompt(persona),
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
            input.reasoningContext?.trim() || null,
            input.experimentsSummary?.trim()
              ? `Experiments:\n${input.experimentsSummary.trim()}`
              : null,
            "",
            "Recent relevant content:",
            contentBlock || "(none)",
            "",
            "Recent messages:",
            history || "(none)",
            "",
            "New user message:",
            input.userMessage,
          ]
            .filter((line) => line !== null)
            .join("\n"),
        },
      ],
    });

    if (!result.ok) {
      return {
        ...fallback,
        providerError: result.errorDetail,
      };
    }

    const raw = readChatCompletionContent(result.data);
    if (!raw) {
      return {
        ...fallback,
        providerError: "Grok returned an empty response.",
      };
    }

    const normalized = normalizeCoachResult(JSON.parse(raw), fallback.reply);
    return {
      ...normalized,
      provider: "grok",
      providerError: null,
    };
  } catch (error) {
    return {
      ...fallback,
      providerError: formatGrokProviderError(
        error instanceof Error ? error.message : "Grok/xAI request failed."
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
