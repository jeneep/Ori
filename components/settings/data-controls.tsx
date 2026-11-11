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
    <div className="flex max-w-xl flex-col gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-900">Your data</h2>
        <p className="mt-2 text-sm text-zinc-600">
          You own your Ori data. Goals, constraints, topics, captures, messages,
          and experiments belong to you. Export anytime, and delete when you
          want it gone.
        </p>
        <div className="mt-4">
          <ExportMenu scope="all" label="Export all data" />
        </div>
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50 p-5">
        <h2 className="text-sm font-medium text-red-900">Delete account</h2>
        <p className="mt-2 text-sm text-red-800">
          Permanently deletes your profile and all topics
          {accountEmail ? ` for ${accountEmail}` : ""}. This cannot be undone.
        </p>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
          >
            Delete account…
          </button>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-red-800">
              Type <span className="font-semibold">{expected}</span> to confirm.
            </p>
            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={expected}
              className="mt-2 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-red-300 focus:ring-2"
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
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700"
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
