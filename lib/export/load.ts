import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ExportAllBundle, ExportTopicBundle } from "@/lib/export/format";

type Client = SupabaseClient<Database>;

export async function loadTopicExportBundle(
  supabase: Client,
  userId: string,
  topicId: string
): Promise<ExportTopicBundle | null> {
  const { data: topic } = await supabase
    .from("topics")
    .select(
      "id, title, description, status, current_view, created_at, updated_at"
    )
    .eq("id", topicId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!topic) {
    return null;
  }

  const [
    { data: content },
    { data: messages },
    { data: experiments },
    { data: conflictChoices },
  ] = await Promise.all([
    supabase
      .from("content")
      .select(
        "id, title, body, source_url, summary, content_type, created_at"
      )
      .eq("topic_id", topicId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("messages")
      .select("id, role, content, created_at, metadata")
      .eq("topic_id", topicId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("experiments")
      .select("id, name, hypothesis, status, created_at")
      .eq("topic_id", topicId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("conflict_choices")
      .select(
        "id, prompt, choice_a, choice_b, selected, rationale, created_at"
      )
      .eq("topic_id", topicId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    topic,
    content: content ?? [],
    messages: messages ?? [],
    experiments: experiments ?? [],
    conflict_choices: conflictChoices ?? [],
  };
}

export async function loadAllExportBundle(
  supabase: Client,
  userId: string
): Promise<ExportAllBundle | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, goals, constraints, proactivity_frequency, onboarding_completed, ori_name, persona_tone, persona_custom_tone, persona_guide_note, created_at, updated_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const { data: topics } = await supabase
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const bundles: ExportTopicBundle[] = [];
  for (const topic of topics ?? []) {
    const bundle = await loadTopicExportBundle(supabase, userId, topic.id);
    if (bundle) {
      bundles.push(bundle);
    }
  }

  return {
    exported_at: new Date().toISOString(),
    profile,
    topics: bundles,
  };
}
