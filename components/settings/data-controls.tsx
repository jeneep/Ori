"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExportMenu } from "@/components/export/export-menu";
import { createClient } from "@/lib/supabase/client";

export function DataControls({ accountEmail }: { accountEmail: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const expected = "DELETE MY ACCOUNT";
  const matches = confirmationText.trim() === expected;

  async function handleDeleteAccount() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not delete account.");
        return;
      }

      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not delete account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-50">
        <h2 className="text-lg font-medium tracking-tight">Your data</h2>
        <p className="mt-2 text-sm text-zinc-400">
          You own your Ori data. Goals, constraints, topics, captures, messages,
          and experiments belong to you. Export anytime, and delete when you
          want it gone.
        </p>
        <div className="mt-4">
          <ExportMenu scope="all" label="Export all data" />
        </div>
      </section>

      <section className="rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-red-50">
        <h2 className="text-lg font-medium tracking-tight text-red-100">
          Delete account
        </h2>
        <p className="mt-2 text-sm text-red-200/80">
          Permanently deletes your profile and all topics
          {accountEmail ? ` for ${accountEmail}` : ""}. This cannot be undone.
        </p>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 rounded-md border border-red-800/80 bg-zinc-950 px-3 py-1.5 text-sm font-medium text-red-200 transition hover:bg-red-950/60"
          >
            Delete account…
          </button>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-red-200/80">
              Type <span className="font-semibold text-red-100">{expected}</span>{" "}
              to confirm.
            </p>
            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={expected}
              className="mt-2 w-full rounded-md border border-red-900/60 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-red-700 focus:ring-2"
            />
            {error ? (
              <p className="mt-2 text-sm text-red-200" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!matches || loading}
                onClick={handleDeleteAccount}
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Deleting…" : "Confirm account deletion"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setConfirming(false);
                  setConfirmationText("");
                  setError(null);
                }}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm font-medium text-zinc-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
