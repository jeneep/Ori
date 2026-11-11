import {
  callGrokChatCompletions,
  getGrokApiKey,
  getGrokModel,
  readChatCompletionContent,
} from "@/lib/llm/xai";
import { toUserModel, type UserModel } from "@/lib/llm/coach";
import {
  buildPersonaFromUserModel,
  formatPersonaForPrompt,
} from "@/lib/reasoning/persona";
import type {
  ExperimentStatus,
  ProactivityFrequency,
  Profile,
  Topic,
  TopicStatus,
} from "@/types/database";

export type DigestTopicSnapshot = {
  id: string;
  title: string;
  status: TopicStatus;
  current_view: string;
  updated_at: string;
  muted: boolean;
};

export type DigestExperimentSnapshot = {
  id: string;
  topic_id: string;
  name: string;
  hypothesis: string | null;
  status: ExperimentStatus;
  updated_at: string;
  topic_title?: string;
};

export type DigestPayload = {
  userId: string;
  frequency: ProactivityFrequency;
  due: boolean;
  skippedReason: string | null;
  title: string;
  headline: string;
  summary: string;
  openExperiments: Array<{
    id: string;
    name: string;
    status: ExperimentStatus;
    topicId: string;
    topicTitle: string;
    hypothesis: string | null;
  }>;
  recentViewUpdates: Array<{
    topicId: string;
    topicTitle: string;
    excerpt: string;
    updatedAt: string;
  }>;
  mutedTopicCount: number;
  nextDigestAt: string | null;
  lastDigestAt: string | null;
  generatedAt: string;
  provider: "grok" | "structured";
  providerError: string | null;
};

export type DigestSourceData = {
  profile: Pick<
    Profile,
    | "id"
    | "full_name"
    | "goals"
    | "constraints"
    | "proactivity_frequency"
    | "ori_name"
    | "persona_tone"
    | "persona_custom_tone"
    | "persona_guide_note"
    | "last_digest_at"
  >;
  topics: DigestTopicSnapshot[];
  experiments: DigestExperimentSnapshot[];
  /** When true, mark last_digest_at after a successful due digest. */
  markDelivered?: boolean;
  /** Force generation even when frequency is off or not yet due. */
  force?: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_VIEW_DAYS = 14;
const MAX_EXPERIMENTS = 5;
const MAX_VIEW_UPDATES = 4;

export function digestIntervalMs(frequency: ProactivityFrequency): number | null {
  if (frequency === "daily") return MS_PER_DAY;
  if (frequency === "weekly") return 7 * MS_PER_DAY;
  return null;
}

export function computeNextDigestAt(
  frequency: ProactivityFrequency,
  lastDigestAt: string | null,
  now = new Date()
): string | null {
  const interval = digestIntervalMs(frequency);
  if (!interval) return null;

  if (!lastDigestAt) {
    return now.toISOString();
  }

  const next = new Date(new Date(lastDigestAt).getTime() + interval);
  return next.toISOString();
}

export function isDigestDue(
  frequency: ProactivityFrequency,
  lastDigestAt: string | null,
  now = new Date()
): boolean {
  if (frequency === "off") return false;
  const next = computeNextDigestAt(frequency, lastDigestAt, now);
  if (!next) return false;
  return new Date(next).getTime() <= now.getTime();
}

function excerpt(text: string, max = 160): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

function openExperimentStatuses(): ExperimentStatus[] {
  return ["draft", "running"];
}

export function selectDigestSignals(input: {
  topics: DigestTopicSnapshot[];
  experiments: DigestExperimentSnapshot[];
  now?: Date;
}): {
  activeTopics: DigestTopicSnapshot[];
  mutedTopicCount: number;
  openExperiments: DigestExperimentSnapshot[];
  recentViewUpdates: DigestTopicSnapshot[];
} {
  const now = input.now ?? new Date();
  const recentCutoff = now.getTime() - RECENT_VIEW_DAYS * MS_PER_DAY;

  const mutedTopicCount = input.topics.filter((topic) => topic.muted).length;
  const activeTopics = input.topics.filter(
    (topic) => !topic.muted && topic.status === "active"
  );
  const activeIds = new Set(activeTopics.map((topic) => topic.id));

  const openStatuses = new Set(openExperimentStatuses());
  const openExperiments = input.experiments
    .filter(
      (exp) =>
        activeIds.has(exp.topic_id) && openStatuses.has(exp.status)
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, MAX_EXPERIMENTS);

  const recentViewUpdates = activeTopics
    .filter(
      (topic) =>
        topic.current_view.trim().length > 0 &&
        new Date(topic.updated_at).getTime() >= recentCutoff
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, MAX_VIEW_UPDATES);

  return { activeTopics, mutedTopicCount, openExperiments, recentViewUpdates };
}

function buildStructuredSummary(input: {
  userModel: UserModel;
  openExperiments: DigestExperimentSnapshot[];
  recentViewUpdates: DigestTopicSnapshot[];
  topicTitleById: Map<string, string>;
}): { title: string; headline: string; summary: string } {
  const coach = input.userModel.ori_name.trim() || "Ori";
  const openCount = input.openExperiments.length;
  const viewCount = input.recentViewUpdates.length;

  const title = "Check-in";
  let headline: string;
  if (openCount === 0 && viewCount === 0) {
    headline = `${coach} is quiet for now — nothing pressing on unmuted topics.`;
  } else if (openCount > 0 && viewCount > 0) {
    headline = `${openCount} open experiment${openCount === 1 ? "" : "s"} and ${viewCount} recent view update${viewCount === 1 ? "" : "s"}.`;
  } else if (openCount > 0) {
    headline = `${openCount} open experiment${openCount === 1 ? "" : "s"} waiting for a light touch.`;
  } else {
    headline = `${viewCount} current view${viewCount === 1 ? "" : "s"} shifted recently.`;
  }

  const parts: string[] = [];

  if (input.openExperiments.length) {
    const lines = input.openExperiments.map((exp) => {
      const topicTitle =
        exp.topic_title ||
        input.topicTitleById.get(exp.topic_id) ||
        "Topic";
      const hypo = exp.hypothesis?.trim()
        ? ` — ${excerpt(exp.hypothesis, 90)}`
        : "";
      return `• [${exp.status}] ${exp.name} (${topicTitle})${hypo}`;
    });
    parts.push(`Open experiments\n${lines.join("\n")}`);
  }

  if (input.recentViewUpdates.length) {
    const lines = input.recentViewUpdates.map((topic) => {
      return `• ${topic.title}: ${excerpt(topic.current_view, 120)}`;
    });
    parts.push(`Recent current-view updates\n${lines.join("\n")}`);
  }

  if (!parts.length) {
    parts.push(
      "No open experiments or recent view updates on unmuted topics. Come back when something feels ready."
    );
  }

  const goal = input.userModel.goals[0]?.trim();
  if (goal) {
    parts.push(`Keeping “${excerpt(goal, 80)}” in view.`);
  }

  return {
    title,
    headline,
    summary: parts.join("\n\n"),
  };
}

async function polishDigestWithPersona(input: {
  userModel: UserModel;
  structured: { title: string; headline: string; summary: string };
  openExperiments: DigestExperimentSnapshot[];
  recentViewUpdates: DigestTopicSnapshot[];
}): Promise<{
  title: string;
  headline: string;
  summary: string;
  provider: "grok" | "structured";
  providerError: string | null;
}> {
  if (!getGrokApiKey()) {
    return { ...input.structured, provider: "structured", providerError: null };
  }

  const persona = buildPersonaFromUserModel(input.userModel);

  const result = await callGrokChatCompletions({
    model: getGrokModel(),
    temperature: 0.35,
    max_tokens: 420,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          `You are ${persona.coachName}, writing a calm proactive digest.`,
          `Voice: ${persona.toneLabel} — ${persona.toneDescription}`,
          `Guide note: ${persona.guideNote}`,
          "Keep it low-friction. No urgency, no notification spam tone.",
          "2-4 short sentences max for summary. Headline under 120 chars.",
          "Return JSON only: {\"title\":\"Check-in\"|\"Next digest\",\"headline\":string,\"summary\":string}",
          "Do not invent experiments or topics that were not provided.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          "Persona:",
          formatPersonaForPrompt(persona),
          "",
          "Structured draft:",
          JSON.stringify(input.structured),
          "",
          "Open experiments:",
          JSON.stringify(
            input.openExperiments.map((exp) => ({
              name: exp.name,
              status: exp.status,
              hypothesis: exp.hypothesis,
              topic: exp.topic_title,
            }))
          ),
          "",
          "Recent current-view updates:",
          JSON.stringify(
            input.recentViewUpdates.map((topic) => ({
              title: topic.title,
              excerpt: excerpt(topic.current_view, 180),
            }))
          ),
        ].join("\n"),
      },
    ],
  });

  if (!result.ok) {
    return {
      ...input.structured,
      provider: "structured",
      providerError: result.errorDetail,
    };
  }

  const raw = readChatCompletionContent(result.data);
  if (!raw) {
    return {
      ...input.structured,
      provider: "structured",
      providerError: "Grok returned an empty digest response.",
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 40)
        : input.structured.title;
    const headline =
      typeof parsed.headline === "string" && parsed.headline.trim()
        ? parsed.headline.trim().slice(0, 160)
        : input.structured.headline;
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 1200)
        : input.structured.summary;

    return {
      title,
      headline,
      summary,
      provider: "grok",
      providerError: null,
    };
  } catch {
    return {
      ...input.structured,
      provider: "structured",
      providerError: "Could not parse Grok digest JSON.",
    };
  }
}

export async function generateDigest(
  source: DigestSourceData,
  now = new Date()
): Promise<DigestPayload> {
  const frequency = source.profile.proactivity_frequency ?? "off";
  const lastDigestAt = source.profile.last_digest_at;
  const due = isDigestDue(frequency, lastDigestAt, now);
  const nextDigestAt = computeNextDigestAt(frequency, lastDigestAt, now);

  const topicTitleById = new Map(
    source.topics.map((topic) => [topic.id, topic.title] as const)
  );

  const experiments = source.experiments.map((exp) => ({
    ...exp,
    topic_title: exp.topic_title || topicTitleById.get(exp.topic_id),
  }));

  const signals = selectDigestSignals({
    topics: source.topics,
    experiments,
    now,
  });

  const userModel = toUserModel(source.profile);
  const structured = buildStructuredSummary({
    userModel,
    openExperiments: signals.openExperiments,
    recentViewUpdates: signals.recentViewUpdates,
    topicTitleById,
  });

  let skippedReason: string | null = null;
  if (!source.force) {
    if (frequency === "off") {
      skippedReason = "Digest frequency is off.";
    } else if (!due) {
      skippedReason = "Digest is not due yet.";
    }
  }

  const shouldPolish = source.force || due || frequency !== "off";
  const polished = shouldPolish
    ? await polishDigestWithPersona({
        userModel,
        structured,
        openExperiments: signals.openExperiments,
        recentViewUpdates: signals.recentViewUpdates,
      })
    : { ...structured, provider: "structured" as const, providerError: null };

  const title =
    frequency === "off"
      ? "Check-in"
      : due || source.force
        ? polished.title || "Next digest"
        : "Next digest";

  return {
    userId: source.profile.id,
    frequency,
    due,
    skippedReason,
    title,
    headline: polished.headline,
    summary: polished.summary,
    openExperiments: signals.openExperiments.map((exp) => ({
      id: exp.id,
      name: exp.name,
      status: exp.status,
      topicId: exp.topic_id,
      topicTitle:
        exp.topic_title || topicTitleById.get(exp.topic_id) || "Topic",
      hypothesis: exp.hypothesis,
    })),
    recentViewUpdates: signals.recentViewUpdates.map((topic) => ({
      topicId: topic.id,
      topicTitle: topic.title,
      excerpt: excerpt(topic.current_view, 160),
      updatedAt: topic.updated_at,
    })),
    mutedTopicCount: signals.mutedTopicCount,
    nextDigestAt,
    lastDigestAt,
    generatedAt: now.toISOString(),
    provider: polished.provider,
    providerError: polished.providerError,
  };
}

/** Build a dashboard-ready check-in without calling the LLM. */
export function buildCheckInCardModel(input: {
  profile: Pick<Profile, "proactivity_frequency" | "last_digest_at" | "ori_name">;
  topics: Array<
    Pick<
      Topic,
      "id" | "title" | "status" | "current_view" | "updated_at" | "muted"
    >
  >;
  experiments: Array<{
    id: string;
    topic_id: string;
    name: string;
    hypothesis: string | null;
    status: ExperimentStatus;
    updated_at: string;
  }>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const frequency = input.profile.proactivity_frequency ?? "off";
  const lastDigestAt = input.profile.last_digest_at;
  const due = isDigestDue(frequency, lastDigestAt, now);
  const nextDigestAt = computeNextDigestAt(frequency, lastDigestAt, now);
  const coach = input.profile.ori_name?.trim() || "Ori";

  const signals = selectDigestSignals({
    topics: input.topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      status: topic.status,
      current_view: topic.current_view,
      updated_at: topic.updated_at,
      muted: topic.muted,
    })),
    experiments: input.experiments,
    now,
  });

  const topicTitleById = new Map(
    input.topics.map((topic) => [topic.id, topic.title] as const)
  );

  let label = "Check-in";
  let statusLine: string;

  if (frequency === "off") {
    label = "Check-in";
    statusLine = `Digests are off — ${coach} stays quiet unless you ask.`;
  } else if (due) {
    label = "Next digest";
    statusLine = `${coach} has a light digest ready when you are.`;
  } else if (nextDigestAt) {
    label = "Next digest";
    const next = new Date(nextDigestAt);
    statusLine = `Next check-in around ${next.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })}.`;
  } else {
    label = "Check-in";
    statusLine = "A quiet glance at what’s open.";
  }

  return {
    label,
    statusLine,
    coachName: coach,
    frequency,
    due,
    nextDigestAt,
    lastDigestAt,
    mutedTopicCount: signals.mutedTopicCount,
    openExperiments: signals.openExperiments.map((exp) => ({
      id: exp.id,
      name: exp.name,
      status: exp.status,
      topicId: exp.topic_id,
      topicTitle: topicTitleById.get(exp.topic_id) || "Topic",
      hypothesis: exp.hypothesis,
    })),
    recentViewUpdates: signals.recentViewUpdates.map((topic) => ({
      topicId: topic.id,
      topicTitle: topic.title,
      excerpt: excerpt(topic.current_view, 140),
      updatedAt: topic.updated_at,
    })),
  };
}
