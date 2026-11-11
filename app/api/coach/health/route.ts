import { NextResponse } from "next/server";
import { probeOpenAICoachAccess } from "@/lib/llm/coach";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const probe = await probeOpenAICoachAccess();
  return NextResponse.json(probe);
}
