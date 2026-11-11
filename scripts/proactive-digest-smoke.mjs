/**
 * Offline smoke for proactive digest helpers (no network / no Supabase).
 * Run: node scripts/proactive-digest-smoke.mjs
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const MS_DAY = 24 * 60 * 60 * 1000;

function digestIntervalMs(frequency) {
  if (frequency === "daily") return MS_DAY;
  if (frequency === "weekly") return 7 * MS_DAY;
  return null;
}

function isDigestDue(frequency, lastDigestAt, now = new Date()) {
  if (frequency === "off") return false;
  const interval = digestIntervalMs(frequency);
  if (!interval) return false;
  if (!lastDigestAt) return true;
  return now.getTime() - new Date(lastDigestAt).getTime() >= interval;
}

function selectDigestSignals({ topics, experiments, now = new Date() }) {
  const recentCutoff = now.getTime() - 14 * MS_DAY;
  const mutedTopicCount = topics.filter((t) => t.muted).length;
  const activeTopics = topics.filter((t) => !t.muted && t.status === "active");
  const activeIds = new Set(activeTopics.map((t) => t.id));
  const openExperiments = experiments.filter(
    (e) => activeIds.has(e.topic_id) && (e.status === "draft" || e.status === "running")
  );
  const recentViewUpdates = activeTopics.filter(
    (t) =>
      t.current_view.trim() &&
      new Date(t.updated_at).getTime() >= recentCutoff
  );
  return { mutedTopicCount, openExperiments, recentViewUpdates };
}

const now = new Date("2026-11-11T12:00:00.000Z");

assert(!isDigestDue("off", null, now), "off should never be due");
assert(isDigestDue("daily", null, now), "daily with no prior digest is due");
assert(
  !isDigestDue("daily", "2026-11-11T08:00:00.000Z", now),
  "daily within same day should not be due"
);
assert(
  isDigestDue("weekly", "2026-11-01T12:00:00.000Z", now),
  "weekly after 7+ days is due"
);

const signals = selectDigestSignals({
  now,
  topics: [
    {
      id: "a",
      title: "Career",
      status: "active",
      muted: false,
      current_view: "Slow down hiring.",
      updated_at: "2026-11-10T10:00:00.000Z",
    },
    {
      id: "b",
      title: "Noise",
      status: "active",
      muted: true,
      current_view: "Should be ignored.",
      updated_at: "2026-11-10T10:00:00.000Z",
    },
  ],
  experiments: [
    {
      id: "e1",
      topic_id: "a",
      name: "Ask for feedback",
      status: "running",
      hypothesis: "A short ask clarifies stakes.",
      updated_at: "2026-11-10T11:00:00.000Z",
    },
    {
      id: "e2",
      topic_id: "b",
      name: "Muted experiment",
      status: "running",
      hypothesis: null,
      updated_at: "2026-11-10T11:00:00.000Z",
    },
  ],
});

assert(signals.mutedTopicCount === 1, "counts muted topics");
assert(signals.openExperiments.length === 1, "excludes muted topic experiments");
assert(signals.openExperiments[0].id === "e1", "keeps unmuted experiment");
assert(signals.recentViewUpdates.length === 1, "excludes muted view updates");

console.log("proactive-digest-smoke: ok");
