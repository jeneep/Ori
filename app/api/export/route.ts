import { NextResponse } from "next/server";
import {
  allDataToMarkdown,
  slugifyFilename,
  topicToMarkdown,
} from "@/lib/export/format";
import {
  loadAllExportBundle,
  loadTopicExportBundle,
} from "@/lib/export/load";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "json").toLowerCase();
  const scope = (searchParams.get("scope") ?? "all").toLowerCase();
  const topicId = searchParams.get("topicId");

  if (format !== "json" && format !== "markdown" && format !== "md") {
    return NextResponse.json(
      { error: "format must be json or markdown." },
      { status: 400 }
    );
  }

  if (scope === "topic") {
    if (!topicId) {
      return NextResponse.json(
        { error: "topicId is required for topic export." },
        { status: 400 }
      );
    }

    const bundle = await loadTopicExportBundle(supabase, user.id, topicId);
    if (!bundle) {
      return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    }

    const base = slugifyFilename(bundle.topic.title);
    if (format === "json") {
      return fileResponse(
        JSON.stringify(bundle, null, 2),
        `ori-topic-${base}.json`,
        "application/json; charset=utf-8"
      );
    }

    return fileResponse(
      topicToMarkdown(bundle),
      `ori-topic-${base}.md`,
      "text/markdown; charset=utf-8"
    );
  }

  const bundle = await loadAllExportBundle(supabase, user.id);
  if (!bundle) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if (format === "json") {
    return fileResponse(
      JSON.stringify(bundle, null, 2),
      "ori-export.json",
      "application/json; charset=utf-8"
    );
  }

  return fileResponse(
    allDataToMarkdown(bundle),
    "ori-export.md",
    "text/markdown; charset=utf-8"
  );
}

function fileResponse(body: string, filename: string, contentType: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
