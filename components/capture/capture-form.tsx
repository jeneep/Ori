"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type CaptureTopicOption = {
  id: string;
  title: string;
};

type CaptureMode = "link" | "file";

type CaptureFormProps = {
  topics: CaptureTopicOption[];
  defaultTopicId?: string;
  onSuccess?: () => void;
};

export function CaptureForm({
  topics,
  defaultTopicId,
  onSuccess,
}: CaptureFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<CaptureMode>("link");
  const [topicId, setTopicId] = useState(defaultTopicId ?? topics[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    if (!topicId) return false;
    if (mode === "link") return Boolean(sourceUrl.trim());
    return Boolean(file);
  }, [topicId, mode, sourceUrl, file]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!topicId) {
      setError("Select an existing topic.");
      return;
    }

    const formData = new FormData();
    formData.set("topicId", topicId);
    if (title.trim()) {
      formData.set("title", title.trim());
    }

    if (mode === "link") {
      formData.set("sourceUrl", sourceUrl.trim());
    } else if (file) {
      formData.set("file", file);
    } else {
      setError("Choose a file to upload.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        content?: { title?: string | null };
      };

      if (!response.ok) {
        setError(payload.error ?? "Ingest failed.");
        return;
      }

      setSuccess(`Captured “${payload.content?.title ?? "content"}”.`);
      setTitle("");
      setSourceUrl("");
      setFile(null);
      onSuccess?.();
      router.refresh();
    } catch {
      setError("Something went wrong while capturing content.");
    } finally {
      setLoading(false);
    }
  }

  if (topics.length === 0) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Create a topic during onboarding before capturing content.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="topicId" className="text-sm font-medium text-zinc-900">
          Topic
        </label>
        <select
          id="topicId"
          name="topicId"
          required
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
        >
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        {(["link", "file"] as CaptureMode[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
              setSuccess(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === value
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {value === "link" ? "Paste link" : "Upload file"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium text-zinc-900">
          Title <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Override the detected title"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
        />
      </div>

      {mode === "link" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sourceUrl" className="text-sm font-medium text-zinc-900">
            Link
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            required
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="file" className="text-sm font-medium text-zinc-900">
            File
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".txt,.md,.markdown,.csv,.json,.html,.htm,text/plain,text/markdown,text/csv,application/json,text/html"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          />
          <p className="text-xs text-zinc-500">
            Text files up to 1MB (.txt, .md, .csv, .json, .html).
          </p>
        </div>
      )}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {success ? (
        <p
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit || loading}
        className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Capturing…" : "Capture content"}
      </button>
    </form>
  );
}
