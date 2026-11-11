import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: { topicId: string };
};

export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title")
    .eq("id", context.params.topicId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("topics")
    .delete()
    .eq("id", topic.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedTopicId: topic.id });
}
