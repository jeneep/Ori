import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: { topicId: string };
};

export async function PATCH(request: Request, context: RouteContext) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    currentView?: string;
  } | null;

  const currentView = body?.currentView?.trim();
  if (!currentView) {
    return NextResponse.json(
      { error: "currentView is required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("topics")
    .update({ current_view: currentView })
    .eq("id", context.params.topicId)
    .eq("user_id", user.id)
    .select("id, current_view, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  return NextResponse.json({ topic: data });
}
