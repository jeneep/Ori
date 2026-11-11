"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateSettings, type SettingsState } from "@/lib/actions/settings";
import type { ProactivityFrequency, Profile } from "@/types/database";

const initialState: SettingsState = { error: null, success: null };

const FREQUENCY_OPTIONS: { value: ProactivityFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

export function SettingsForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useFormState(updateSettings, initialState);
  const goals = [...profile.goals, "", "", ""].slice(0, 3);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-zinc-900">
          Goals <span className="font-normal text-zinc-500">(1–3)</span>
        </legend>
        {[0, 1, 2].map((index) => (
          <input
            key={index}
            name={`goal${index + 1}`}
            type="text"
            required={index === 0}
            maxLength={200}
            defaultValue={goals[index] ?? ""}
            placeholder={index === 0 ? "Required goal" : `Optional goal ${index + 1}`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
          />
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="constraints" className="text-sm font-medium text-zinc-900">
          Key constraints
        </label>
        <textarea
          id="constraints"
          name="constraints"
          rows={4}
          maxLength={2000}
          defaultValue={profile.constraints}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-zinc-900">
          Proactivity frequency
        </legend>
        <p className="text-sm text-zinc-500">
          How often should Ori check in without you asking?
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          {FREQUENCY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800"
            >
              <input
                type="radio"
                name="proactivity_frequency"
                value={option.value}
                defaultChecked={profile.proactivity_frequency === option.value}
                className="accent-zinc-900"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          role="status"
        >
          {state.success}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
