"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  completeOnboarding,
  type OnboardingState,
} from "@/lib/actions/onboarding";

const initialState: OnboardingState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Continue to dashboard"}
    </button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useFormState(completeOnboarding, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-zinc-900">
          Goals <span className="font-normal text-zinc-500">(1–3)</span>
        </legend>
        <p className="text-sm text-zinc-500">
          What do you want Ori to help you move forward on?
        </p>
        {[1, 2, 3].map((n) => (
          <input
            key={n}
            name={`goal${n}`}
            type="text"
            required={n === 1}
            maxLength={200}
            placeholder={n === 1 ? "Required goal" : `Optional goal ${n}`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
          />
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="constraints" className="text-sm font-medium text-zinc-900">
          Key constraints
        </label>
        <p className="text-sm text-zinc-500">
          Time, energy, people, or other limits Ori should respect.
        </p>
        <textarea
          id="constraints"
          name="constraints"
          rows={4}
          maxLength={2000}
          placeholder="e.g. Weeknights only, keep conversations constructive, no advice that requires travel"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="topicName" className="text-sm font-medium text-zinc-900">
          First topic name
        </label>
        <p className="text-sm text-zinc-500">
          Name the first situation or focus area you want to work on.
        </p>
        <input
          id="topicName"
          name="topicName"
          type="text"
          required
          maxLength={120}
          placeholder="e.g. Workload with my manager"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
        />
      </div>

      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
