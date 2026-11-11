#!/usr/bin/env node
/**
 * Direct smoke test for the coach OpenAI path (mirrors lib/llm/coach.ts).
 * Requires OPENAI_API_KEY. No Supabase required.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

loadEnvLocal();

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error("FAIL: OPENAI_API_KEY missing");
  process.exit(1);
}

const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const userMessage =
  "I'm stuck deciding whether to raise the workload issue in our next 1:1. What should I consider?";

const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
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
          "reply (string), important (boolean), proposed_current_view (string|null), experiment ({name, hypothesis}|null).",
          "Set important=true when the exchange clarified stakes, decisions, conflicts, or new durable understanding.",
          "When important=true, proposed_current_view should be an updated 2-5 sentence synthesis of the topic.",
          "Include experiment when a concrete small test would help; otherwise null.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          "Topic: Manager 1:1 tension",
          "",
          "User model:",
          "Name: Coach Smoke",
          "Goals:\n1. Improve difficult conversations",
          "Constraints: Keep advice practical and kind",
          "Proactivity: off",
          "",
          "Current view:",
          "(empty — synthesize carefully from available context)",
          "",
          "Recent relevant content:",
          "(none)",
          "",
          "Recent messages:",
          "(none)",
          "",
          "New user message:",
          userMessage,
        ].join("\n"),
      },
    ],
  }),
});

if (!response.ok) {
  const body = await response.text();
  let detail = `OpenAI HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.message) detail = parsed.error.message;
    if (parsed?.error?.code) detail += ` (${parsed.error.code})`;
  } catch {
    // keep status
  }
  console.error(
    JSON.stringify(
      { provider: "fallback", providerError: detail, ok: false },
      null,
      2
    )
  );
  console.error("FAIL: OpenAI chat completions did not succeed");
  process.exit(1);
}

const data = await response.json();
const raw = data.choices?.[0]?.message?.content?.trim();
if (!raw) {
  console.error("FAIL: OpenAI returned empty content");
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error("FAIL: OpenAI returned non-JSON:", raw.slice(0, 200));
  process.exit(1);
}

if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
  console.error("FAIL: JSON missing reply");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      provider: "openai",
      providerError: null,
      model,
      replyPreview: parsed.reply.slice(0, 220).replace(/\s+/g, " "),
      important: Boolean(parsed.important),
      hasExperiment: Boolean(parsed.experiment),
    },
    null,
    2
  )
);
console.log("PASS: coach OpenAI reply generated");
