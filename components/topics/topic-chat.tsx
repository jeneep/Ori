"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefiningIndicator } from "@/components/reasoning/refining-indicator";
import { isSubstantialCoachQuestion } from "@/lib/reasoning/substantial";
import type { Json } from "@/types/database";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata: Json;
};

type ExperimentSuggestion = {
  name: string;
  hypothesis: string;
};

type TopicChatProps = {
  topicId: string;
  initialMessages: ChatMessage[];
  initialCurrentView: string;
};

function readMetadata(metadata: Json): {
  proposedCurrentView: string | null;
  experiment: ExperimentSuggestion | null;
  important: boolean;
  autoUpdated: boolean;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      proposedCurrentView: null,
      experiment: null,
      important: false,
      autoUpdated: false,
    };
  }

  const record = metadata as Record<string, unknown>;
  const proposed =
    typeof record.proposed_current_view === "string"
      ? record.proposed_current_view
      : null;

  let experiment: ExperimentSuggestion | null = null;
  if (record.experiment && typeof record.experiment === "object") {
    const exp = record.experiment as Record<string, unknown>;
    if (
      typeof exp.name === "string" &&
      typeof exp.hypothesis === "string" &&
      exp.name.trim() &&
      exp.hypothesis.trim()
    ) {
      experiment = { name: exp.name, hypothesis: exp.hypothesis };
    }
  }

  let autoUpdated = false;
  if (record.reasoning && typeof record.reasoning === "object") {
    const reasoning = record.reasoning as Record<string, unknown>;
    autoUpdated = Boolean(reasoning.auto_updated);
  }

  return {
    proposedCurrentView: proposed,
    experiment,
    important: Boolean(record.important),
    autoUpdated,
  };
}

export function TopicChat({
  topicId,
  initialMessages,
  initialCurrentView,
}: TopicChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [currentView, setCurrentView] = useState(initialCurrentView);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [providerNote, setProviderNote] = useState<string | null>(null);
  const [grokReady, setGrokReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [updatingViewFor, setUpdatingViewFor] = useState<string | null>(null);
  const [creatingExperimentFor, setCreatingExperimentFor] = useState<
    string | null
  >(null);
  const [statusByMessage, setStatusByMessage] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    setCurrentView(initialCurrentView);
  }, [initialCurrentView]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    let cancelled = false;

    async function checkGrok() {
      try {
        const response = await fetch("/api/coach/health");
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setGrokReady(false);
          setProviderNote(
            payload.error ?? "Could not verify Grok coach access."
          );
          return;
        }
        setGrokReady(Boolean(payload.ok));
        if (payload.ok) {
          setProviderNote("Grok coach is ready.");
        } else if (payload.error) {
          setProviderNote(payload.error);
        } else {
          setProviderNote("Grok coach is not ready.");
        }
      } catch {
        if (!cancelled) {
          setGrokReady(false);
          setProviderNote("Could not verify Grok coach access.");
        }
      }
    }

    void checkGrok();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [messages]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;

    const needsDeeperReasoning = isSubstantialCoachQuestion(message);
    setError(null);
    setLoading(true);
    setRefining(needsDeeperReasoning);
    setDraft("");

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, message }),
      });
      const payload = (await response.json()) as {
        error?: string;
        messages?: ChatMessage[];
        provider?: "grok" | "fallback";
        providerError?: string | null;
        currentView?: string;
        currentViewUpdated?: boolean;
        deeperReasoning?: boolean;
      };

      if (!response.ok || !payload.messages) {
        setError(payload.error ?? "Coach request failed.");
        setDraft(message);
        return;
      }

      if (payload.provider === "grok") {
        setGrokReady(true);
        if (payload.currentViewUpdated) {
          setProviderNote("Reply generated with Grok. Current view refined.");
        } else if (payload.deeperReasoning) {
          setProviderNote("Reply generated with Grok after deeper reasoning.");
        } else {
          setProviderNote("Reply generated with Grok.");
        }
      } else if (payload.providerError) {
        setGrokReady(false);
        setProviderNote(`Used offline fallback — ${payload.providerError}`);
      } else {
        setGrokReady(false);
        setProviderNote("Used offline fallback.");
      }

      if (typeof payload.currentView === "string") {
        setCurrentView(payload.currentView);
      }

      setMessages((prev) => [...prev, ...payload.messages!]);
      router.refresh();
    } catch {
      setError("Something went wrong talking to Ori.");
      setDraft(message);
    } finally {
      setLoading(false);
      setRefining(false);
    }
  }

  async function acceptCurrentView(messageId: string, proposed: string) {
    setUpdatingViewFor(messageId);
    setError(null);
    try {
      const response = await fetch(`/api/topics/${topicId}/current-view`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentView: proposed }),
      });
      const payload = (await response.json()) as {
        error?: string;
        topic?: { current_view: string };
      };

      if (!response.ok || !payload.topic) {
        setError(payload.error ?? "Could not update current view.");
        return;
      }

      setCurrentView(payload.topic.current_view);
      setStatusByMessage((prev) => ({
        ...prev,
        [messageId]: "Current view updated.",
      }));
      router.refresh();
    } catch {
      setError("Could not update current view.");
    } finally {
      setUpdatingViewFor(null);
    }
  }

  async function createExperiment(
    messageId: string,
    suggestion: ExperimentSuggestion
  ) {
    setCreatingExperimentFor(messageId);
    setError(null);
    try {
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          name: suggestion.name,
          hypothesis: suggestion.hypothesis,
          messageId,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not create experiment.");
        return;
      }

      setStatusByMessage((prev) => ({
        ...prev,
        [messageId]: "Experiment card created.",
      }));
      router.refresh();
    } catch {
      setError("Could not create experiment.");
    } finally {
      setCreatingExperimentFor(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Current view
          </p>
          <RefiningIndicator active={refining} />
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
          {currentView.trim() ||
            "No current view yet. Chat with Ori to synthesize one."}
        </p>
      </div>

      <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto rounded-md border border-zinc-200 bg-white p-4">
        {sortedMessages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No messages yet. Ask Ori about this topic to get started.
          </p>
        ) : (
          sortedMessages.map((message) => {
            const meta = readMetadata(message.metadata);
            const isAssistant = message.role === "assistant";
            const status = statusByMessage[message.id];

            return (
              <div
                key={message.id}
                className={`flex flex-col gap-2 rounded-md px-3 py-2 text-sm ${
                  isAssistant
                    ? "bg-zinc-50 text-zinc-800"
                    : "bg-zinc-900 text-white"
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide opacity-70">
                  {message.role}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>

                {isAssistant && meta.autoUpdated ? (
                  <p className="text-xs text-zinc-500">
                    Current view was lightly refined to stay aligned.
                  </p>
                ) : null}

                {isAssistant && meta.proposedCurrentView ? (
                  <div className="rounded-md border border-zinc-200 bg-white p-3 text-zinc-800">
                    <p className="text-xs font-medium text-zinc-500">
                      Update current view?
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {meta.proposedCurrentView}
                    </p>
                    <button
                      type="button"
                      disabled={updatingViewFor === message.id}
                      onClick={() =>
                        acceptCurrentView(message.id, meta.proposedCurrentView!)
                      }
                      className="mt-2 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {updatingViewFor === message.id
                        ? "Updating…"
                        : "Accept updated view"}
                    </button>
                  </div>
                ) : null}

                {isAssistant && meta.experiment ? (
                  <div className="rounded-md border border-dashed border-zinc-300 bg-white p-3 text-zinc-800">
                    <p className="text-xs font-medium text-zinc-500">
                      Experiment idea
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {meta.experiment.name}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {meta.experiment.hypothesis}
                    </p>
                    <button
                      type="button"
                      disabled={creatingExperimentFor === message.id}
                      onClick={() =>
                        createExperiment(message.id, meta.experiment!)
                      }
                      className="mt-2 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {creatingExperimentFor === message.id
                        ? "Creating…"
                        : "Create experiment card"}
                    </button>
                  </div>
                ) : null}

                {status ? (
                  <p className="text-xs text-emerald-700">{status}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="coach-message" className="sr-only">
          Message Ori
        </label>
        <textarea
          id="coach-message"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Talk with Ori about this topic…"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
        />
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <RefiningIndicator
          active={refining}
          label="Refining current view…"
        />
        {providerNote ? (
          <p
            className={`text-xs ${
              grokReady === false ? "text-amber-700" : "text-zinc-500"
            }`}
            role="status"
          >
            {providerNote}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="self-start rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (refining ? "Refining…" : "Thinking…") : "Send"}
        </button>
      </form>
    </div>
  );
}
