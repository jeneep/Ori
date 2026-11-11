"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteTopicButton({
  topicId,
  topicTitle,
}: {
  topicId: string;
  topicTitle: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/topics/${topicId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not delete topic.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not delete topic.");
    } finally {
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
      >
        Delete topic
      </button>
    );
  }

  const matches = confirmationText.trim() === topicTitle.trim();

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">Delete this topic?</p>
      <p className="mt-1 text-sm text-red-700">
        This permanently removes the topic, captured content, messages,
        experiments, and conflict choices. Type{" "}
        <span className="font-semibold">{topicTitle}</span> to confirm.
      </p>
      <input
        type="text"
        value={confirmationText}
        onChange={(e) => setConfirmationText(e.target.value)}
        placeholder={topicTitle}
        className="mt-3 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-red-300 focus:ring-2"
      />
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!matches || loading}
          onClick={handleDelete}
          className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setConfirming(false);
            setConfirmationText("");
            setError(null);
          }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
