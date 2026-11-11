import type { UserModel } from "@/lib/llm/coach";
import {
  callGrokChatCompletions,
  getGrokApiKey,
  getGrokModel,
  readChatCompletionContent,
} from "@/lib/llm/xai";
import {
  buildPersonaFromUserModel,
  formatPersonaForPrompt,
  type OriPersona,
} from "@/lib/reasoning/persona";

export type ReasoningTrigger = "content_ingest" | "coach_question";

export type ReasoningContentItem = {
  id: string;
  title: string | null;
  summary: string | null;
  content_type: string;
  source_url: string | null;
  body?: string | null;
};

export type ReasoningExperimentItem = {
  id: string;
  name: string;
  hypothesis: string | null;
  status: string;
};

export type ReasoningSignal = {
  kind: "content" | "message";
  title?: string | null;
  text: string;
};

export type ReasoningAnalysis = {
  reinforcements: string[];
  conflicts: string[];
  gaps: string[];
};

export type ChangeMagnitude = "none" | "small" | "substantial";

export type SyntheticReasoningResult = {
  ran: boolean;
  persona: OriPersona;
  retrievedContent: ReasoningContentItem[];
  analysis: ReasoningAnalysis;
  synthesizedView: string | null;
  changeMagnitude: ChangeMagnitude;
  aligned: boolean;
  autoUpdate: boolean;
  proposedCurrentView: string | null;
  notesForCoach: string;
  provider: "grok" | "fallback";
  providerError: string | null;
};

const MAX_RETRIEVED = 6;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

/** Lightweight retrieval: keyword overlap + mild recency preference (input order). */
export function retrieveRelevantContent(
  items: ReasoningContentItem[],
  signalText: string,
  limit = MAX_RETRIEVED
): ReasoningContentItem[] {
  if (items.length === 0) return [];

  const queryTokens = new Set(tokenize(signalText));
  if (queryTokens.size === 0) {
    return items.slice(0, limit);
  }

  const scored = items.map((item, index) => {
    const haystack = [
      item.title ?? "",
      item.summary ?? "",
      item.body?.slice(0, 800) ?? "",
      item.source_url ?? "",
    ].join(" ");
    const tokens = tokenize(haystack);
    let overlap = 0;
    for (const token of tokens) {
      if (queryTokens.has(token)) overlap += 1;
    }
    // Recency is only a tie-breaker among keyword matches.
    const recencyBonus = Math.max(0, (items.length - index) * 0.01);
    return { item, overlap, score: overlap + recencyBonus };
  });

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter((row) => row.overlap > 0).slice(0, limit);
  if (matched.length > 0) {
    return matched.map((row) => row.item);
  }
  return items.slice(0, limit);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function parseMagnitude(value: unknown): ChangeMagnitude {
  if (value === "small" || value === "substantial" || value === "none") {
    return value;
  }
  return "none";
}

function viewsDiffer(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, " ") !== b.trim().replace(/\s+/g, " ");
}

function buildFallbackReasoning(input: {
  currentView: string;
  signal: ReasoningSignal;
  persona: OriPersona;
  retrievedContent: ReasoningContentItem[];
}): SyntheticReasoningResult {
  const current = input.currentView.trim();
  const signalText = input.signal.text.trim().slice(0, 500);
  const contentHint = input.retrievedContent[0]?.summary
    || input.retrievedContent[0]?.title
    || null;

  const synthesized = [
    current || `Working view for ${input.persona.userName}.`,
    `Latest signal (${input.signal.kind}): ${signalText}`,
    contentHint ? `Related material: ${contentHint}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const hasConflictCue =
    /but|however|instead|conflict|contradict|vs\.?|versus/i.test(signalText);
  const changeMagnitude: ChangeMagnitude = !current
    ? "substantial"
    : hasConflictCue
      ? "substantial"
      : "small";

  const analysis: ReasoningAnalysis = {
    reinforcements: current
      ? ["New signal continues an active thread on this topic."]
      : [],
    conflicts: hasConflictCue
      ? ["New signal may tension with the existing current view."]
      : [],
    gaps: current
      ? []
      : ["No current view yet — synthesis starts from this signal."],
  };

  const aligned = analysis.conflicts.length === 0;
  const autoUpdate =
    aligned &&
    changeMagnitude === "small" &&
    viewsDiffer(current, synthesized);

  return {
    ran: true,
    persona: input.persona,
    retrievedContent: input.retrievedContent,
    analysis,
    synthesizedView: synthesized,
    changeMagnitude,
    aligned,
    autoUpdate,
    proposedCurrentView: autoUpdate ? null : synthesized,
    notesForCoach: [
      `Persona priorities: ${input.persona.priorities.slice(0, 2).join("; ") || "none"}`,
      analysis.conflicts[0] ? `Conflict note: ${analysis.conflicts[0]}` : null,
      analysis.gaps[0] ? `Gap: ${analysis.gaps[0]}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    provider: "fallback",
    providerError: getGrokApiKey()
      ? null
      : "GROK_API_KEY, XAI_API_KEY, or Grok_key is not set in this runtime.",
  };
}

export async function runSyntheticReasoning(input: {
  trigger: ReasoningTrigger;
  topicTitle: string;
  currentView: string;
  userModel: UserModel;
  content: ReasoningContentItem[];
  experiments: ReasoningExperimentItem[];
  signal: ReasoningSignal;
}): Promise<SyntheticReasoningResult> {
  const persona = buildPersonaFromUserModel(input.userModel);
  const retrievedContent = retrieveRelevantContent(
    input.content,
    `${input.signal.title ?? ""} ${input.signal.text} ${input.currentView}`
  );

  const fallback = buildFallbackReasoning({
    currentView: input.currentView,
    signal: input.signal,
    persona,
    retrievedContent,
  });

  if (!getGrokApiKey()) {
    return fallback;
  }

  const contentBlock = retrievedContent
    .map((item, index) => {
      const summary = item.summary || item.body?.slice(0, 280) || "(no summary)";
      return `${index + 1}. [${item.content_type}] ${item.title || "Untitled"}\n   ${summary}${
        item.source_url ? `\n   URL: ${item.source_url}` : ""
      }`;
    })
    .join("\n");

  const experimentBlock = input.experiments
    .slice(0, 8)
    .map(
      (exp, index) =>
        `${index + 1}. [${exp.status}] ${exp.name}${
          exp.hypothesis ? ` — ${exp.hypothesis}` : ""
        }`
    )
    .join("\n");

  try {
    const result = await callGrokChatCompletions({
      model: getGrokModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are the synthetic intelligence reasoning layer for a personal coach.",
            "Compare a new signal against the topic's current_view, retrieved content, experiments, and the user's chosen coach persona/model.",
            "Match the coach persona voice when drafting synthesized_view (name, tone, and guide note).",
            "Be precise and non-dramatic. Do not invent facts.",
            "Return JSON only with keys:",
            "reinforcements (string[]), conflicts (string[]), gaps (string[]),",
            "synthesized_view (string), change_magnitude ('none'|'small'|'substantial'),",
            "aligned (boolean), notes_for_coach (string).",
            "synthesized_view should be 2-5 sentences, respecting persona priorities, tone, and constraints.",
            "change_magnitude=small means a light refinement clearly aligned with the existing view.",
            "change_magnitude=substantial means stakes, conflicts, or a meaningfully new framing.",
            "aligned=true only when the synthesis does not fight the user model/persona.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Trigger: ${input.trigger}`,
            `Topic: ${input.topicTitle}`,
            "",
            "Persona:",
            formatPersonaForPrompt(persona),
            "",
            "Current view:",
            input.currentView.trim() || "(empty)",
            "",
            "Active experiments:",
            experimentBlock || "(none)",
            "",
            "Retrieved relevant content:",
            contentBlock || "(none)",
            "",
            "New signal:",
            `kind: ${input.signal.kind}`,
            input.signal.title ? `title: ${input.signal.title}` : null,
            `text: ${input.signal.text.slice(0, 4000)}`,
          ]
            .filter(Boolean)
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
        providerError: "Grok returned an empty reasoning response.",
      };
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const analysis: ReasoningAnalysis = {
      reinforcements: stringList(parsed.reinforcements),
      conflicts: stringList(parsed.conflicts),
      gaps: stringList(parsed.gaps),
    };
    const synthesizedView =
      typeof parsed.synthesized_view === "string" &&
      parsed.synthesized_view.trim()
        ? parsed.synthesized_view.trim()
        : fallback.synthesizedView;
    const changeMagnitude = parseMagnitude(parsed.change_magnitude);
    const aligned =
      typeof parsed.aligned === "boolean"
        ? parsed.aligned
        : analysis.conflicts.length === 0;
    const notesForCoach =
      typeof parsed.notes_for_coach === "string" && parsed.notes_for_coach.trim()
        ? parsed.notes_for_coach.trim()
        : fallback.notesForCoach;

    const differs = Boolean(
      synthesizedView && viewsDiffer(input.currentView, synthesizedView)
    );
    const autoUpdate =
      differs &&
      aligned &&
      analysis.conflicts.length === 0 &&
      changeMagnitude === "small";

    return {
      ran: true,
      persona,
      retrievedContent,
      analysis,
      synthesizedView,
      changeMagnitude,
      aligned,
      autoUpdate,
      proposedCurrentView:
        differs && !autoUpdate && changeMagnitude !== "none"
          ? synthesizedView
          : null,
      notesForCoach,
      provider: "grok",
      providerError: null,
    };
  } catch (error) {
    return {
      ...fallback,
      providerError:
        error instanceof Error ? error.message : "Reasoning request failed.",
    };
  }
}

export function formatReasoningForCoach(
  reasoning: SyntheticReasoningResult,
  workingView: string
): string {
  const lines = [
    "Synthetic reasoning context:",
    formatPersonaForPrompt(reasoning.persona),
    `Working current_view: ${workingView.trim() || "(empty)"}`,
    reasoning.analysis.reinforcements.length
      ? `Reinforcements: ${reasoning.analysis.reinforcements.join("; ")}`
      : null,
    reasoning.analysis.conflicts.length
      ? `Conflicts: ${reasoning.analysis.conflicts.join("; ")}`
      : null,
    reasoning.analysis.gaps.length
      ? `Gaps: ${reasoning.analysis.gaps.join("; ")}`
      : null,
    reasoning.notesForCoach
      ? `Notes: ${reasoning.notesForCoach}`
      : null,
    `Change magnitude: ${reasoning.changeMagnitude}; aligned=${reasoning.aligned}; autoUpdate=${reasoning.autoUpdate}`,
  ];
  return lines.filter(Boolean).join("\n");
}
