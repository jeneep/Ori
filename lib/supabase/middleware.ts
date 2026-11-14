import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !anonKey) {
    return passThroughOrLoginRedirect(request, supabaseResponse);
  }

  const url = normalizeSupabaseUrl(rawUrl);

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;
    const isAuthRoute =
      pathname.startsWith("/login") || pathname.startsWith("/signup");
    const isOnboardingRoute = pathname.startsWith("/onboarding");
    const isProtectedRoute =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/topics");

    if (!user && (isProtectedRoute || isOnboardingRoute || pathname === "/")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      return NextResponse.redirect(redirectUrl);
    }

    if (
      user &&
      (isAuthRoute || isProtectedRoute || isOnboardingRoute || pathname === "/")
    ) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      const onboarded = Boolean(profile?.onboarding_completed);

      if (isAuthRoute) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = onboarded ? "/dashboard" : "/onboarding";
        return NextResponse.redirect(redirectUrl);
      }

      if (!onboarded && isProtectedRoute) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/onboarding";
        return NextResponse.redirect(redirectUrl);
      }

      if (onboarded && isOnboardingRoute) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }

      if (pathname === "/") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        return NextResponse.redirect(redirectUrl);
      }
    }

    return supabaseResponse;
  } catch {
    // Never fail closed on middleware errors — keep login/signup reachable.
    return passThroughOrLoginRedirect(request, supabaseResponse);
  }
}

function passThroughOrLoginRedirect(
  request: NextRequest,
  fallback: NextResponse
) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }
  return fallback;
}
