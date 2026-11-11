type RefiningIndicatorProps = {
  active: boolean;
  label?: string;
  className?: string;
};

/**
 * Calm, low-friction status line shown while Ori runs deeper synthesis.
 */
export function RefiningIndicator({
  active,
  label = "Refining current view…",
  className = "",
}: RefiningIndicatorProps) {
  if (!active) return null;

  return (
    <p
      className={`flex items-center gap-2 text-xs text-zinc-500 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400"
      />
      <span>{label}</span>
    </p>
  );
}
