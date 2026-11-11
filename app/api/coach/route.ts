import { NextResponse } from "next/server";
import {
  generateCoachReply,
  type CoachMessage,
  type UserModel,
} from "@/lib/llm/coach";
import { isSubstantialCoachQuestion } from "@/lib/reasoning/substantial";
import {
  formatReasoningForCoach,
  runSyntheticReasoning,
  type SyntheticReasoningResult,
} from "@/lib/reasoning/synthesize";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

function reasoningPayload(reasoning: SyntheticReasoningResult | null) {
  if (!reasoning) {
    return {
      ran: false,
      autoUpdated: false,
      changeMagnitude: null,
      analysis: null,
      proposedCurrentView: null,
    };
  }

  return {
    ran: reasoning.ran,
    autoUpdated: reasoning.autoUpdate,
    changeMagnitude: reasoning.changeMagnitude,
    analysis: reasoning.analysis,
    proposedCurrentView: reasoning.proposedCurrentView,
    provider: reasoning.provider,
    providerError: reasoning.providerError,
  };
}

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

  const [
    { data: contentItems },
    { data: recentMessages },
    { data: experiments },
  ] = await Promise.all([
    supabase
      .from("content")
      .select("id, title, summary, content_type, source_url, body, created_at")
      .eq("topic_id", topicId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("messages")
      .select("id, role, content, created_at, metadata")
      .eq("topic_id", topicId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("experiments")
      .select("id, name, hypothesis, status, created_at")
      .eq("topic_id", topicId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
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

  const userModel: UserModel = {
    goals: profile.goals,
    constraints: profile.constraints,
    proactivity_frequency: profile.proactivity_frequency,
    full_name: profile.full_name,
  };

  const deeperReasoning = isSubstantialCoachQuestion(message);
  let reasoning: SyntheticReasoningResult | null = null;
  let workingView = topic.current_view;
  let currentViewUpdated = false;

  if (deeperReasoning) {
    reasoning = await runSyntheticReasoning({
      trigger: "coach_question",
      topicTitle: topic.title,
      currentView: topic.current_view,
      userModel,
      content: contentItems ?? [],
      experiments: experiments ?? [],
      signal: { kind: "message", text: message },
    });

    if (reasoning.autoUpdate && reasoning.synthesizedView) {
      const { data: updatedTopic, error: updateError } = await supabase
        .from("topics")
        .update({ current_view: reasoning.synthesizedView })
        .eq("id", topicId)
        .eq("user_id", user.id)
        .select("current_view")
        .maybeSingle();

      if (!updateError && updatedTopic) {
        workingView = updatedTopic.current_view;
        currentViewUpdated = true;
      }
    } else if (reasoning.synthesizedView && reasoning.changeMagnitude !== "none") {
      // Prefer the refined synthesis as the working view for this reply
      // without persisting unless auto-update or user accepts.
      workingView = reasoning.synthesizedView;
    }
  }

  const experimentsSummary = (experiments ?? [])
    .map(
      (exp) =>
        `- [${exp.status}] ${exp.name}${
          exp.hypothesis ? `: ${exp.hypothesis}` : ""
        }`
    )
    .join("\n");

  const coachResult = await generateCoachReply({
    topicTitle: topic.title,
    userModel,
    currentView: workingView,
    content: (contentItems ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      content_type: item.content_type,
      source_url: item.source_url,
    })),
    messages: history,
    userMessage: message,
    reasoningContext: reasoning
      ? formatReasoningForCoach(reasoning, workingView)
      : null,
    experimentsSummary: experimentsSummary || null,
  });

  const proposedFromReasoning =
    !currentViewUpdated && reasoning?.proposedCurrentView
      ? reasoning.proposedCurrentView
      : null;
  const proposedCurrentView =
    proposedFromReasoning || coachResult.proposed_current_view;
  const offerUpdateCurrentView = Boolean(
    !currentViewUpdated && proposedCurrentView
  );

  const assistantMetadata = {
    source: "coach_chat",
    important: coachResult.important || Boolean(proposedCurrentView),
    proposed_current_view: offerUpdateCurrentView ? proposedCurrentView : null,
    experiment: coachResult.experiment,
    provider: coachResult.provider,
    provider_error: coachResult.providerError,
    reasoning: reasoning
      ? {
          ran: true,
          auto_updated: currentViewUpdated,
          change_magnitude: reasoning.changeMagnitude,
          aligned: reasoning.aligned,
          reinforcements: reasoning.analysis.reinforcements,
          conflicts: reasoning.analysis.conflicts,
          gaps: reasoning.analysis.gaps,
        }
      : { ran: false },
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
    deeperReasoning,
    // Only surface a new current_view when it was persisted (auto-update).
    currentView: currentViewUpdated ? workingView : topic.current_view,
    currentViewUpdated,
    offerUpdateCurrentView,
    proposedCurrentView: offerUpdateCurrentView ? proposedCurrentView : null,
    experimentSuggestion: coachResult.experiment,
    reasoning: reasoningPayload(reasoning),
  });
}
