type ExperimentCard = {
  id: string;
  name: string;
  hypothesis: string | null;
  status: string;
  created_at: string;
};

export function ExperimentCards({
  experiments,
}: {
  experiments: ExperimentCard[];
}) {
  if (experiments.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No experiments yet. Create one from chat when Ori suggests a test.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {experiments.map((experiment) => (
        <li
          key={experiment.id}
          className="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-zinc-900">{experiment.name}</p>
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
              {experiment.status}
            </span>
          </div>
          {experiment.hypothesis ? (
            <p className="mt-2 text-sm text-zinc-600">{experiment.hypothesis}</p>
          ) : null}
          <p className="mt-3 text-xs text-zinc-400">
            {new Date(experiment.created_at).toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
