#!/usr/bin/env node
/**
 * Smoke test: create a confirmed user via service role (no email send),
 * complete onboarding data, call Grok/xAI-backed coach generation logic path.
 *
 * Requires in env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GROK_API_KEY, XAI_API_KEY, or Grok_key
 */
import { createClient } from "@supabase/supabase-js";
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const grokKey =
  process.env.GROK_API_KEY?.trim() ||
  process.env.XAI_API_KEY?.trim() ||
  process.env.Grok_key?.trim();

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!url) fail("NEXT_PUBLIC_SUPABASE_URL missing");
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY missing");
if (!grokKey) fail("GROK_API_KEY, XAI_API_KEY, or Grok_key missing");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `ori.coach.smoke.${Date.now()}@orismoke.local`;
const password = "CoachSmoke123!";

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Coach Smoke" },
});

if (createError || !created.user) {
  fail(`createUser: ${createError?.message ?? "unknown"}`);
}

const userId = created.user.id;
console.log(`created user ${userId}`);

const { error: profileError } = await admin.from("profiles").upsert({
  id: userId,
  email,
  full_name: "Coach Smoke",
  goals: ["Improve difficult conversations"],
  constraints: "Keep advice practical and kind",
  proactivity_frequency: "off",
  onboarding_completed: true,
});

if (profileError) fail(`profile upsert: ${profileError.message}`);

const { data: topic, error: topicError } = await admin
  .from("topics")
  .insert({
    user_id: userId,
    title: "Manager 1:1 tension",
    current_view: "",
    status: "active",
  })
  .select("id, title, current_view")
  .single();

if (topicError || !topic) fail(`topic insert: ${topicError?.message ?? "unknown"}`);
console.log(`created topic ${topic.id}`);

const model =
  process.env.GROK_MODEL?.trim() ||
  process.env.XAI_MODEL?.trim() ||
  "grok-4";

const grokResponse = await fetch("https://api.x.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${grokKey}`,
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
          "You are Ori. Return JSON with keys reply, important, proposed_current_view, experiment.",
      },
      {
        role: "user",
        content:
          "Topic: Manager 1:1 tension\nUser goals: Improve difficult conversations\nMessage: I'm stuck deciding whether to raise the workload issue in our next 1:1. What should I consider?",
      },
    ],
  }),
});

if (!grokResponse.ok) {
  const body = await grokResponse.text();
  fail(`Grok/xAI HTTP ${grokResponse.status}: ${body.slice(0, 400)}`);
}

const grokJson = await grokResponse.json();
const raw = grokJson.choices?.[0]?.message?.content;
if (!raw) fail("Grok empty content");

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  fail(`Grok non-JSON: ${raw.slice(0, 200)}`);
}

if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
  fail("Grok JSON missing reply");
}

const { error: messageError } = await admin.from("messages").insert([
  {
    user_id: userId,
    topic_id: topic.id,
    role: "user",
    content:
      "I'm stuck deciding whether to raise the workload issue in our next 1:1. What should I consider?",
    metadata: { source: "smoke" },
  },
  {
    user_id: userId,
    topic_id: topic.id,
    role: "assistant",
    content: parsed.reply,
    metadata: {
      source: "smoke",
      provider: "grok",
      important: Boolean(parsed.important),
      proposed_current_view: parsed.proposed_current_view ?? null,
      experiment: parsed.experiment ?? null,
    },
  },
]);

if (messageError) fail(`message insert: ${messageError.message}`);

console.log("PASS: Grok coach reply generated and stored");
console.log(`topicId=${topic.id}`);
console.log(`email=${email}`);
console.log(`password=${password}`);
console.log(`model=${model}`);
console.log(`replyPreview=${parsed.reply.slice(0, 180).replace(/\s+/g, " ")}`);
