"use client";

import { useState } from "react";

type ExportMenuProps = {
  scope: "topic" | "all";
  topicId?: string;
  label?: string;
};

export function ExportMenu({
  scope,
  topicId,
  label = "Export",
}: ExportMenuProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"json" | "markdown" | null>(null);

  async function download(format: "json" | "markdown") {
    setError(null);
    setLoading(format);

    try {
      const params = new URLSearchParams({
        scope,
        format,
      });
      if (scope === "topic") {
        if (!topicId) {
          setError("Missing topic id.");
          return;
        }
        params.set("topicId", topicId);
      }

      const response = await fetch(`/api/export?${params.toString()}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Export failed.");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ??
        (format === "json" ? "ori-export.json" : "ori-export.md");

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-800">{label}</span>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => download("markdown")}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60"
        >
          {loading === "markdown" ? "Preparing…" : "Markdown"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => download("json")}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60"
        >
          {loading === "json" ? "Preparing…" : "JSON"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
