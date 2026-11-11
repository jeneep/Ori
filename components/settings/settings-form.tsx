"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateSettings, type SettingsState } from "@/lib/actions/settings";
import {
  buildPersonaPreview,
  normalizePersonaSettings,
  PERSONA_TONE_OPTIONS,
} from "@/lib/reasoning/persona";
import type {
  PersonaTone,
  ProactivityFrequency,
  Profile,
} from "@/types/database";

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
      className="rounded-md bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

function fieldClassName() {
  return "rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-zinc-500 placeholder:text-zinc-500 focus:ring-2";
}

export function SettingsForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useFormState(updateSettings, initialState);
  const goals = [...profile.goals, "", "", ""].slice(0, 3);
  const initialPersona = normalizePersonaSettings(profile);

  const [oriName, setOriName] = useState(initialPersona.ori_name);
  const [tone, setTone] = useState<PersonaTone>(initialPersona.persona_tone);
  const [customTone, setCustomTone] = useState(
    initialPersona.persona_custom_tone
  );
  const [guideNote, setGuideNote] = useState(
    initialPersona.persona_guide_note
  );

  const preview = useMemo(
    () =>
      buildPersonaPreview({
        ori_name: oriName,
        persona_tone: tone,
        persona_custom_tone: customTone,
        persona_guide_note: guideNote,
      }),
    [oriName, tone, customTone, guideNote]
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-8">
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium tracking-tight">Persona</h2>
          <p className="text-sm text-zinc-400">
            Shape how Ori sounds in coach chat and current-view updates.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ori_name" className="text-sm font-medium text-zinc-200">
              Ori’s name
            </label>
            <input
              id="ori_name"
              name="ori_name"
              type="text"
              required
              maxLength={40}
              value={oriName}
              onChange={(e) => setOriName(e.target.value)}
              placeholder="Ori"
              className={fieldClassName()}
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-zinc-200">Tone</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PERSONA_TONE_OPTIONS.map((option) => {
                const selected = tone === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-3 transition ${
                      selected
                        ? "border-zinc-400 bg-zinc-900"
                        : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm text-zinc-100">
                      <input
                        type="radio"
                        name="persona_tone"
                        value={option.value}
                        checked={selected}
                        onChange={() => setTone(option.value)}
                        className="accent-zinc-200"
                      />
                      {option.label}
                    </span>
                    <span className="pl-5 text-xs text-zinc-500">
                      {option.description}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {tone === "custom" ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="persona_custom_tone"
                className="text-sm font-medium text-zinc-200"
              >
                Custom tone
              </label>
              <input
                id="persona_custom_tone"
                name="persona_custom_tone"
                type="text"
                maxLength={200}
                value={customTone}
                onChange={(e) => setCustomTone(e.target.value)}
                placeholder="e.g. Quiet strategist with dry humor"
                className={fieldClassName()}
              />
            </div>
          ) : (
            <input type="hidden" name="persona_custom_tone" value={customTone} />
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="persona_guide_note"
              className="text-sm font-medium text-zinc-200"
            >
              Guide note
            </label>
            <textarea
              id="persona_guide_note"
              name="persona_guide_note"
              rows={3}
              maxLength={500}
              value={guideNote}
              onChange={(e) => setGuideNote(e.target.value)}
              placeholder="What kind of guide do you want, or what are you aspiring toward?"
              className={fieldClassName()}
            />
            <p className="text-xs text-zinc-500">
              A short note Ori will keep in mind across replies and view updates.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Preview
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-200">{preview}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium tracking-tight">Your model</h2>
          <p className="text-sm text-zinc-400">
            Goals, constraints, and how often Ori reaches out.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-zinc-200">
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
                placeholder={
                  index === 0 ? "Required goal" : `Optional goal ${index + 1}`
                }
                className={fieldClassName()}
              />
            ))}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="constraints"
              className="text-sm font-medium text-zinc-200"
            >
              Key constraints
            </label>
            <textarea
              id="constraints"
              name="constraints"
              rows={4}
              maxLength={2000}
              defaultValue={profile.constraints}
              className={fieldClassName()}
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-zinc-200">
              Proactivity frequency
            </legend>
            <p className="text-sm text-zinc-500">
              How often should Ori check in without you asking?
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              {FREQUENCY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200"
                >
                  <input
                    type="radio"
                    name="proactivity_frequency"
                    value={option.value}
                    defaultChecked={
                      profile.proactivity_frequency === option.value
                    }
                    className="accent-zinc-200"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      {state.error ? (
        <p
          className="rounded-md border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p
          className="rounded-md border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200"
          role="status"
        >
          {state.success}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
