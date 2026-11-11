import { NextResponse } from "next/server";
import {
  fetchLinkContent,
  isSafeHttpUrl,
  titleFromFilename,
} from "@/lib/ingest/extract";
import { generateShortSummary } from "@/lib/llm/summarize";
import { createClient } from "@/lib/supabase/server";
import type { ContentType } from "@/types/database";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 1_000_000;

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

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id, title")
    .eq("id", topicId)
    .eq("user_id", user.id)
    .maybeSingle();

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
  });
}
