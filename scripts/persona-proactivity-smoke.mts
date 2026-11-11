#!/usr/bin/env npx tsx
/**
 * Integration smoke for persona injection + proactive digests.
 * Uses real TypeScript modules and Grok/xAI
 * (GROK_API_KEY / XAI_API_KEY / Grok_key). No Supabase required.
 *
 * Run: npm run smoke:persona-proactivity
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCoachSystemPrompt,
  buildPersonaFromUserModel,
  normalizePersonaSettings,
} from "../lib/reasoning/persona";
import {
  buildUserModelSummary,
  generateCoachReply,
  toUserModel,
} from "../lib/llm/coach";
import {
  buildCheckInCardModel,
  generateDigest,
  isDigestDue,
  selectDigestSignals,
} from "../lib/proactive/digest";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

loadEnvLocal();

const apiKey =
  process.env.GROK_API_KEY?.trim() ||
  process.env.XAI_API_KEY?.trim() ||
  process.env.Grok_key?.trim();

if (!apiKey) {
  console.error("FAIL: GROK_API_KEY, XAI_API_KEY, or Grok_key missing");
  process.exit(1);
}

const persona = normalizePersonaSettings({
  ori_name: "Sage",
  persona_tone: "direct_coach",
  persona_custom_tone: "",
  persona_guide_note: "Help me ship decisions without drama",
});

const userModel = toUserModel({
  ...persona,
  goals: ["Ship clearer decisions"],
  constraints: "Keep advice practical",
  proactivity_frequency: "daily",
  full_name: "Jenee",
});

const built = buildPersonaFromUserModel(userModel);
const systemPrompt = buildCoachSystemPrompt(built);
const summary = buildUserModelSummary(userModel);

assert(systemPrompt.includes("Sage"), "system prompt missing ori_name");
assert(systemPrompt.includes("Direct coach"), "system prompt missing tone");
assert(
  systemPrompt.includes("Help me ship decisions without drama"),
  "system prompt missing guide note"
);
assert(summary.includes("Coach name: Sage"), "user model summary missing persona");

const coach = await generateCoachReply({
  topicTitle: "Launch decision",
  userModel,
  currentView: "We are close to shipping but keep second-guessing the scope cut.",
  content: [],
  messages: [],
  userMessage:
    "I'm stuck deciding whether to cut scope before the Friday launch. What should I consider?",
});

assert(
  coach.provider === "grok",
  `coach provider=${coach.provider} err=${coach.providerError}`
);
assert(coach.reply.trim().length > 0, "empty coach reply");

const now = new Date("2026-11-11T18:00:00.000Z");
const topics = [
  {
    id: "career",
    title: "Career",
    status: "active" as const,
    muted: false,
    current_view: "Ask for a clearer growth path in the next review.",
    updated_at: "2026-11-10T10:00:00.000Z",
  },
  {
    id: "noise",
    title: "Social media noise",
    status: "active" as const,
    muted: true,
    current_view: "Should never appear in digests.",
    updated_at: "2026-11-10T12:00:00.000Z",
  },
  {
    id: "health",
    title: "Sleep",
    status: "active" as const,
    muted: false,
    current_view: "Protect a consistent bedtime during launch week.",
    updated_at: "2026-11-09T09:00:00.000Z",
  },
];

const experiments = [
  {
    id: "e1",
    topic_id: "career",
    name: "Ask for feedback",
    hypothesis: "A short ask clarifies stakes.",
    status: "running" as const,
    updated_at: "2026-11-10T11:00:00.000Z",
  },
  {
    id: "e2",
    topic_id: "noise",
    name: "Mute experiment",
    hypothesis: "This belongs to a muted topic.",
    status: "running" as const,
    updated_at: "2026-11-10T11:00:00.000Z",
  },
];

assert(!isDigestDue("off", null, now), "off must never be due");
assert(isDigestDue("daily", null, now), "daily with no prior digest is due");
assert(
  !isDigestDue("daily", "2026-11-11T08:00:00.000Z", now),
  "daily within same day should not be due"
);
assert(
  isDigestDue("weekly", "2026-11-01T12:00:00.000Z", now),
  "weekly after 7+ days is due"
);

const signals = selectDigestSignals({ topics, experiments, now });
assert(signals.mutedTopicCount === 1, "muted topic count");
assert(
  !signals.openExperiments.some((e) => e.topic_id === "noise"),
  "muted topic experiment leaked"
);
assert(
  !signals.recentViewUpdates.some((t) => t.id === "noise"),
  "muted topic view leaked"
);
assert(
  signals.openExperiments.some((e) => e.id === "e1"),
  "active experiment missing"
);

const digest = await generateDigest(
  {
    profile: {
      id: "user-1",
      full_name: "Jenee",
      goals: ["Ship clearer decisions"],
      constraints: "Keep advice practical",
      proactivity_frequency: "daily",
      ori_name: "Sage",
      persona_tone: "direct_coach",
      persona_custom_tone: "",
      persona_guide_note: "Help me ship decisions without drama",
      last_digest_at: null,
    },
    topics,
    experiments,
    force: true,
  },
  now
);

const blob = [
  digest.headline,
  digest.summary,
  JSON.stringify(digest.openExperiments),
  JSON.stringify(digest.recentViewUpdates),
].join("\n");

assert(
  !/social media noise|mute experiment|should never appear/i.test(blob),
  "muted topic content appeared in digest"
);
assert(digest.mutedTopicCount === 1, "digest mutedTopicCount");
assert(
  digest.openExperiments.length === 1 &&
    digest.openExperiments[0].name === "Ask for feedback",
  "unexpected open experiments"
);
assert(
  !digest.recentViewUpdates.some((v) => v.topicTitle === "Social media noise"),
  "muted topic in recent views"
);
assert(
  digest.provider === "grok",
  `digest provider=${digest.provider} err=${digest.providerError}`
);

const card = buildCheckInCardModel({
  profile: {
    proactivity_frequency: "daily",
    last_digest_at: null,
    ori_name: "Sage",
  },
  topics,
  experiments,
  now,
});

assert(card.coachName === "Sage", "check-in card missing coach name");
assert(
  !card.openExperiments.some((e) => e.topicId === "noise"),
  "muted topic in check-in card"
);
assert(card.statusLine.includes("Sage"), "check-in status should use persona name");

console.log(
  JSON.stringify(
    {
      ok: true,
      persona: {
        coachName: built.coachName,
        toneLabel: built.toneLabel,
        guideNote: built.guideNote,
        systemPromptInjected: true,
      },
      coach: {
        provider: coach.provider,
        replyPreview: coach.reply.slice(0, 220).replace(/\s+/g, " "),
      },
      digest: {
        title: digest.title,
        headline: digest.headline,
        summary: digest.summary,
        provider: digest.provider,
        mutedTopicCount: digest.mutedTopicCount,
        openExperimentNames: digest.openExperiments.map((e) => e.name),
        recentViewTitles: digest.recentViewUpdates.map((v) => v.topicTitle),
      },
      checkIn: {
        label: card.label,
        statusLine: card.statusLine,
        mutedTopicCount: card.mutedTopicCount,
      },
    },
    null,
    2
  )
);
console.log("PASS: persona + proactivity smoke");
