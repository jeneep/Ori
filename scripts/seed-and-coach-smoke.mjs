#!/usr/bin/env node
/**
 * Smoke test: create a confirmed user via service role (no email send),
 * complete onboarding data, call OpenAI-backed coach generation logic path.
 *
 * Requires in env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
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
const openaiKey = process.env.OPENAI_API_KEY;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!url) fail("NEXT_PUBLIC_SUPABASE_URL missing");
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY missing");
if (!openaiKey) fail("OPENAI_API_KEY missing");

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

const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${openaiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
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

if (!openaiResponse.ok) {
  const body = await openaiResponse.text();
  fail(`OpenAI HTTP ${openaiResponse.status}: ${body.slice(0, 400)}`);
}

const openaiJson = await openaiResponse.json();
const raw = openaiJson.choices?.[0]?.message?.content;
if (!raw) fail("OpenAI empty content");

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  fail(`OpenAI non-JSON: ${raw.slice(0, 200)}`);
}

if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
  fail("OpenAI JSON missing reply");
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
      provider: "openai",
      important: Boolean(parsed.important),
      proposed_current_view: parsed.proposed_current_view ?? null,
      experiment: parsed.experiment ?? null,
    },
  },
]);

if (messageError) fail(`message insert: ${messageError.message}`);

console.log("PASS: OpenAI coach reply generated and stored");
console.log(`topicId=${topic.id}`);
console.log(`email=${email}`);
console.log(`password=${password}`);
console.log(`replyPreview=${parsed.reply.slice(0, 180).replace(/\s+/g, " ")}`);
