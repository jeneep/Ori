import { NextResponse } from "next/server";
import {
  generateCoachReply,
  type CoachMessage,
} from "@/lib/llm/coach";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    topicId?: string;
    message?: string;
  } | null;

  const topicId = body?.topicId?.trim();
  const message = body?.message?.trim();

  if (!topicId || !message) {
    return NextResponse.json(
      { error: "topicId and message are required." },
      { status: 400 }
    );
  }

  if (message.length > 4000) {
    return NextResponse.json(
      { error: "Message is too long." },
      { status: 400 }
    );
  }

  const [{ data: profile }, { data: topic }] = await Promise.all([
    supabase
      .from("profiles")
      .select("goals, constraints, proactivity_frequency, full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("topics")
      .select("id, title, current_view")
      .eq("id", topicId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!profile || !topic) {
    return NextResponse.json(
      { error: "Topic or profile not found." },
      { status: 404 }
    );
  }

  const [{ data: contentItems }, { data: recentMessages }] = await Promise.all([
    supabase
      .from("content")
      .select("id, title, summary, content_type, source_url, created_at")
      .eq("topic_id", topicId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("messages")
      .select("id, role, content, created_at, metadata")
      .eq("topic_id", topicId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const chronological = [...(recentMessages ?? [])].reverse();
  const history: CoachMessage[] = chronological.map((row) => ({
    role: row.role,
    content: row.content,
  }));

  const { data: userMessageRow, error: userMessageError } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      topic_id: topicId,
      role: "user",
      content: message,
      metadata: { source: "coach_chat" },
    })
    .select("id, role, content, created_at, metadata")
    .single();

  if (userMessageError || !userMessageRow) {
    return NextResponse.json(
      { error: userMessageError?.message ?? "Failed to store message." },
      { status: 500 }
    );
  }

  const coachResult = await generateCoachReply({
    topicTitle: topic.title,
    userModel: {
      goals: profile.goals,
      constraints: profile.constraints,
      proactivity_frequency: profile.proactivity_frequency,
      full_name: profile.full_name,
    },
    currentView: topic.current_view,
    content: contentItems ?? [],
    messages: history,
    userMessage: message,
  });

  const assistantMetadata = {
    source: "coach_chat",
    important: coachResult.important,
    proposed_current_view: coachResult.proposed_current_view,
    experiment: coachResult.experiment,
    provider: coachResult.provider,
    provider_error: coachResult.providerError,
  } satisfies Json;

  const { data: assistantMessageRow, error: assistantError } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      topic_id: topicId,
      role: "assistant",
      content: coachResult.reply,
      metadata: assistantMetadata,
    })
    .select("id, role, content, created_at, metadata")
    .single();

  if (assistantError || !assistantMessageRow) {
    return NextResponse.json(
      { error: assistantError?.message ?? "Failed to store coach reply." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    messages: [userMessageRow, assistantMessageRow],
    reply: coachResult.reply,
    provider: coachResult.provider,
    providerError: coachResult.providerError,
    offerUpdateCurrentView: Boolean(
      coachResult.important && coachResult.proposed_current_view
    ),
    proposedCurrentView: coachResult.proposed_current_view,
    experimentSuggestion: coachResult.experiment,
  });
}
