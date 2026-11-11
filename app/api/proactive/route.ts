import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateDigest,
  isDigestDue,
  type DigestExperimentSnapshot,
  type DigestPayload,
  type DigestSourceData,
  type DigestTopicSnapshot,
} from "@/lib/proactive/digest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Profile } from "@/types/database";

export const runtime = "nodejs";

type DbClient = SupabaseClient<Database>;

type ProfileDigestFields = Pick<
  Profile,
  | "id"
  | "full_name"
  | "goals"
  | "constraints"
  | "proactivity_frequency"
  | "ori_name"
  | "persona_tone"
  | "persona_custom_tone"
  | "persona_guide_note"
  | "last_digest_at"
>;

const PROFILE_SELECT =
  "id, full_name, goals, constraints, proactivity_frequency, ori_name, persona_tone, persona_custom_tone, persona_guide_note, last_digest_at";

function getCronSecret(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}

function isCronAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;

  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === secret;
}

async function loadDigestSource(
  supabase: DbClient,
  userId: string
): Promise<DigestSourceData | null> {
  const [{ data: profile }, { data: topics }, { data: experiments }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("topics")
        .select("id, title, status, current_view, updated_at, muted")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("experiments")
        .select("id, topic_id, name, hypothesis, status, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

  if (!profile) return null;

  return {
    profile: profile as ProfileDigestFields,
    topics: (topics ?? []) as DigestTopicSnapshot[],
    experiments: (experiments ?? []) as DigestExperimentSnapshot[],
  };
}

async function markDigestDelivered(
  supabase: DbClient,
  userId: string,
  at: string
) {
  await supabase
    .from("profiles")
    .update({ last_digest_at: at })
    .eq("id", userId);
}

/**
 * GET /api/proactive
 * Preview the current user's digest (auth session required).
 * Does not advance last_digest_at.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = await loadDigestSource(supabase, user.id);
  if (!source) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  const digest = await generateDigest({ ...source, force: true });
  return NextResponse.json({ digest });
}

/**
 * POST /api/proactive
 *
 * Authenticated user:
 *   { force?: boolean, markDelivered?: boolean }
 *
 * Cron / scheduled job (Authorization: Bearer CRON_SECRET):
 *   { mode: "due" | "user", userId?: string, force?: boolean, limit?: number }
 *
 * Cron "due" walks users with daily/weekly cadence whose digest is due.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: "due" | "user";
    userId?: string;
    force?: boolean;
    markDelivered?: boolean;
    limit?: number;
  };

  if (isCronAuthorized(request)) {
    return handleCron(body);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = await loadDigestSource(supabase, user.id);
  if (!source) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  const force = Boolean(body.force);
  const digest = await generateDigest({ ...source, force });

  const shouldMark =
    Boolean(body.markDelivered) &&
    (force || digest.due) &&
    digest.frequency !== "off";

  if (shouldMark) {
    await markDigestDelivered(supabase, user.id, digest.generatedAt);
    digest.lastDigestAt = digest.generatedAt;
    digest.nextDigestAt =
      digest.frequency === "daily" || digest.frequency === "weekly"
        ? new Date(
            new Date(digest.generatedAt).getTime() +
              (digest.frequency === "daily"
                ? 24 * 60 * 60 * 1000
                : 7 * 24 * 60 * 60 * 1000)
          ).toISOString()
        : null;
    digest.due = false;
    digest.skippedReason = null;
  }

  return NextResponse.json({ digest });
}

async function handleCron(body: {
  mode?: "due" | "user";
  userId?: string;
  force?: boolean;
  limit?: number;
}) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is required for cron digest generation.",
      },
      { status: 500 }
    );
  }

  const mode = body.mode ?? (body.userId ? "user" : "due");
  const force = Boolean(body.force);
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);

  if (mode === "user") {
    const userId = body.userId?.trim();
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required when mode=user." },
        { status: 400 }
      );
    }

    const source = await loadDigestSource(admin, userId);
    if (!source) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    const digest = await generateDigest({ ...source, force });
    if ((force || digest.due) && digest.frequency !== "off") {
      await markDigestDelivered(admin, userId, digest.generatedAt);
    }

    return NextResponse.json({
      mode: "user",
      generated: 1,
      digests: [digest],
    });
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("proactivity_frequency", ["daily", "weekly"])
    .eq("onboarding_completed", true)
    .limit(limit * 4);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueProfiles = ((profiles ?? []) as ProfileDigestFields[])
    .filter((profile) =>
      force
        ? true
        : isDigestDue(profile.proactivity_frequency, profile.last_digest_at)
    )
    .slice(0, limit);

  const digests: DigestPayload[] = [];

  for (const profile of dueProfiles) {
    const source = await loadDigestSource(admin, profile.id);
    if (!source) continue;

    const digest = await generateDigest({ ...source, force: true });
    await markDigestDelivered(admin, profile.id, digest.generatedAt);
    digests.push(digest);
  }

  return NextResponse.json({
    mode: "due",
    scanned: (profiles ?? []).length,
    generated: digests.length,
    digests,
  });
}
