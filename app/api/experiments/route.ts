import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    name?: string;
    hypothesis?: string;
    messageId?: string;
  } | null;

  const topicId = body?.topicId?.trim();
  const name = body?.name?.trim();
  const hypothesis = body?.hypothesis?.trim() || null;

  if (!topicId || !name) {
    return NextResponse.json(
      { error: "topicId and name are required." },
      { status: 400 }
    );
  }

  const { data: topic } = await supabase
    .from("topics")
    .select("id")
    .eq("id", topicId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("experiments")
    .insert({
      user_id: user.id,
      topic_id: topicId,
      name,
      hypothesis,
      status: "draft",
      config: {
        source: "coach_chat",
        message_id: body?.messageId ?? null,
      },
    })
    .select("id, name, hypothesis, status, created_at, topic_id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create experiment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ experiment: data });
}
