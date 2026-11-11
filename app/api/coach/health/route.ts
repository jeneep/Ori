import { NextResponse } from "next/server";
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

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      openaiConfigured: false,
      error: "OPENAI_API_KEY is not set in this runtime.",
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      let message = `OpenAI HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // keep status message
      }
      return NextResponse.json({
        ok: false,
        openaiConfigured: true,
        error: message,
      });
    }

    return NextResponse.json({
      ok: true,
      openaiConfigured: true,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      openaiConfigured: true,
      error: error instanceof Error ? error.message : "OpenAI request failed.",
    });
  }
}
