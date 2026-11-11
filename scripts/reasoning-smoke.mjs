#!/usr/bin/env node
/**
 * Smoke test for synthetic reasoning (substantial heuristic + Grok synthesize).
 * Requires GROK_API_KEY, XAI_API_KEY, or Grok_key.
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

const TRIVIAL =
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it|cool|k)\b[.!?]*$/i;
const SUBSTANTIVE =
  /\b(decide|decision|conflict|afraid|stuck|should i|unsure|uncertain|update|tension|trade[- ]?off|priorit|worried|confused|what if|how (do|should|can) i|why (am|do|is)|help me (think|figure|understand))\b/i;

function isSubstantialCoachQuestion(message) {
  const text = message.trim();
  if (!text) return false;
  if (TRIVIAL.test(text)) return false;
  if (text.length >= 120) return true;
  if (SUBSTANTIVE.test(text)) return true;
  if (text.includes("?") && text.length >= 40) return true;
  return false;
}

const cases = [
  ["hi", false],
  ["thanks!", false],
  [
    "I'm stuck deciding whether to raise the workload issue in our next 1:1. What should I consider?",
    true,
  ],
  ["ok", false],
];

for (const [message, expected] of cases) {
  const got = isSubstantialCoachQuestion(message);
  if (got !== expected) {
    console.error(`FAIL substantial("${message}") expected ${expected} got ${got}`);
    process.exit(1);
  }
}

const apiKey =
  process.env.GROK_API_KEY?.trim() ||
  process.env.XAI_API_KEY?.trim() ||
  process.env.Grok_key?.trim();
if (!apiKey) {
  console.error("FAIL: GROK_API_KEY, XAI_API_KEY, or Grok_key missing");
  process.exit(1);
}

const model =
  process.env.GROK_MODEL?.trim() ||
  process.env.XAI_MODEL?.trim() ||
  "grok-4";

const response = await fetch("https://api.x.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Return JSON with keys reinforcements, conflicts, gaps, synthesized_view, change_magnitude, aligned, notes_for_coach.",
      },
      {
        role: "user",
        content: [
          "Trigger: coach_question",
          "Topic: Manager 1:1 tension",
          "Persona: Calm coaching partner prioritizing difficult conversations; keep advice practical and kind.",
          "Current view: Workload feels uneven; user wants a constructive 1:1.",
          "New signal: I'm stuck deciding whether to raise the workload issue in our next 1:1. What should I consider?",
        ].join("\n"),
      },
    ],
  }),
});

if (!response.ok) {
  console.error("FAIL: reasoning completions", await response.text());
  process.exit(1);
}

const data = await response.json();
const raw = data.choices?.[0]?.message?.content?.trim();
const parsed = JSON.parse(raw);
if (!parsed.synthesized_view || typeof parsed.synthesized_view !== "string") {
  console.error("FAIL: missing synthesized_view", parsed);
  process.exit(1);
}

const listLen = (value) => (Array.isArray(value) ? value.length : 0);

console.log(
  JSON.stringify(
    {
      ok: true,
      model,
      change_magnitude: parsed.change_magnitude,
      aligned: parsed.aligned,
      synthesizedPreview: String(parsed.synthesized_view)
        .slice(0, 220)
        .replace(/\s+/g, " "),
      reinforcements: listLen(parsed.reinforcements),
      conflicts: listLen(parsed.conflicts),
      gaps: listLen(parsed.gaps),
    },
    null,
    2
  )
);
console.log("PASS: synthetic reasoning smoke");
