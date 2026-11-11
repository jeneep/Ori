import { NextResponse } from "next/server";
import {
  fetchLinkContent,
  isSafeHttpUrl,
  titleFromFilename,
} from "@/lib/ingest/extract";
import { generateShortSummary } from "@/lib/llm/summarize";
import type { UserModel } from "@/lib/llm/coach";
import {
  runSyntheticReasoning,
  type SyntheticReasoningResult,
} from "@/lib/reasoning/synthesize";
import { createClient } from "@/lib/supabase/server";
import type { ContentType } from "@/types/database";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 1_000_000;

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

  const formData = await request.formData();
  const topicId = String(formData.get("topicId") ?? "").trim();
  const providedTitle = String(formData.get("title") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const file = formData.get("file");

  if (!topicId) {
    return NextResponse.json(
      { error: "Select an existing topic." },
      { status: 400 }
    );
  }

  const [{ data: topic, error: topicError }, { data: profile }] =
    await Promise.all([
      supabase
        .from("topics")
        .select("id, title, current_view")
        .eq("id", topicId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("goals, constraints, proactivity_frequency, full_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  if (topicError || !topic) {
    return NextResponse.json(
      { error: "Topic not found." },
      { status: 404 }
    );
  }

  const hasFile = file instanceof File && file.size > 0;
  const hasUrl = Boolean(sourceUrl);

  if (hasFile === hasUrl) {
    return NextResponse.json(
      { error: "Provide either a link or a file, not both." },
      { status: 400 }
    );
  }

  let title = providedTitle;
  let rawText = "";
  let resolvedSourceUrl: string | null = null;
  let contentType: ContentType;

  if (hasUrl) {
    if (!isSafeHttpUrl(sourceUrl)) {
      return NextResponse.json(
        { error: "Enter a valid public http(s) URL." },
        { status: 400 }
      );
    }

    const fetched = await fetchLinkContent(sourceUrl);
    title = title || fetched.title;
    rawText = fetched.rawText;
    resolvedSourceUrl = sourceUrl;
    contentType = "link";
  } else {
    const upload = file as File;
    if (upload.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File is too large (max 1MB)." },
        { status: 400 }
      );
    }

    rawText = (await upload.text()).slice(0, 50_000);
    title = title || titleFromFilename(upload.name);
    contentType = "file";
  }

  if (!title) {
    title = "Untitled capture";
  }

  if (!rawText.trim()) {
    rawText = resolvedSourceUrl
      ? `Captured link: ${resolvedSourceUrl}`
      : "Empty file capture.";
  }

  const summary = await generateShortSummary({
    title,
    rawText,
    sourceUrl: resolvedSourceUrl,
  });

  const { data: content, error: insertError } = await supabase
    .from("content")
    .insert({
      user_id: user.id,
      topic_id: topicId,
      title,
      body: rawText,
      source_url: resolvedSourceUrl,
      summary,
      content_type: contentType,
      metadata: {
        ingest: {
          mode: contentType,
          captured_at: new Date().toISOString(),
        },
      },
    })
    .select(
      "id, title, body, source_url, summary, content_type, topic_id, created_at"
    )
    .single();

  if (insertError || !content) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to store content." },
      { status: 500 }
    );
  }

  const [{ data: existingContent }, { data: experiments }] = await Promise.all([
    supabase
      .from("content")
      .select("id, title, summary, content_type, source_url, body, created_at")
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

  const userModel: UserModel = {
    goals: profile?.goals ?? [],
    constraints: profile?.constraints ?? "",
    proactivity_frequency: profile?.proactivity_frequency ?? "off",
    full_name: profile?.full_name ?? null,
  };

  const reasoning = await runSyntheticReasoning({
    trigger: "content_ingest",
    topicTitle: topic.title,
    currentView: topic.current_view,
    userModel,
    content: existingContent ?? [],
    experiments: experiments ?? [],
    signal: {
      kind: "content",
      title: content.title,
      text: content.summary || content.body.slice(0, 2500),
    },
  });

  let currentView = topic.current_view;
  let currentViewUpdated = false;
  let offerUpdateCurrentView = false;
  let proposedCurrentView: string | null = null;

  if (reasoning.autoUpdate && reasoning.synthesizedView) {
    const { data: updatedTopic, error: updateError } = await supabase
      .from("topics")
      .update({ current_view: reasoning.synthesizedView })
      .eq("id", topicId)
      .eq("user_id", user.id)
      .select("current_view")
      .maybeSingle();

    if (!updateError && updatedTopic) {
      currentView = updatedTopic.current_view;
      currentViewUpdated = true;
    } else {
      proposedCurrentView = reasoning.synthesizedView;
      offerUpdateCurrentView = true;
    }
  } else if (reasoning.proposedCurrentView) {
    proposedCurrentView = reasoning.proposedCurrentView;
    offerUpdateCurrentView = true;
  }

  return NextResponse.json({
    content: {
      id: content.id,
      title: content.title,
      source_url: content.source_url,
      raw_text: content.body,
      type: content.content_type,
      summary: content.summary,
      topic_id: content.topic_id,
      created_at: content.created_at,
    },
    deeperReasoning: true,
    currentView,
    currentViewUpdated,
    offerUpdateCurrentView,
    proposedCurrentView,
    reasoning: reasoningPayload(
      currentViewUpdated
        ? { ...reasoning, autoUpdate: true, proposedCurrentView: null }
        : reasoning
    ),
  });
}
