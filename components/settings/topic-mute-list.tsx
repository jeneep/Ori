"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTopicMuted } from "@/lib/actions/settings";

export type MuteTopicRow = {
  id: string;
  title: string;
  status: string;
  muted: boolean;
};

export function TopicMuteList({ topics }: { topics: MuteTopicRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(topic: MuteTopicRow) {
    setError(null);
    setPendingId(topic.id);
    startTransition(async () => {
      const result = await setTopicMuted(topic.id, !topic.muted);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
      setPendingId(null);
    });
  }

  if (!topics.length) {
    return (
      <p className="text-sm text-zinc-500">
        No topics yet. Create one from onboarding or the dashboard.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800">
        {topics.map((topic) => {
          const busy = isPending && pendingId === topic.id;
          return (
            <li
              key={topic.id}
              className="flex items-center justify-between gap-3 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {topic.title}
                </p>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {topic.status}
                  {topic.muted ? " · muted" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(topic)}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  topic.muted
                    ? "border-zinc-600 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                }`}
              >
                {busy ? "Saving…" : topic.muted ? "Unmute" : "Mute"}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-zinc-500">
        Muted topics stay in Ori — they just skip digests and the dashboard
        check-in.
      </p>
    </div>
  );
}
