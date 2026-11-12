import { NextResponse, type NextRequest } from "next/server";

/**
 * Keep middleware free of Supabase imports. Pulling `@supabase/ssr` into the
 * Edge middleware bundle caused MIDDLEWARE_INVOCATION_FAILED on Vercel and made
 * /login and /signup unreachable. Auth gating lives in route layouts/pages.
 */
export function middleware(request: NextRequest) {
  // Unauthenticated root redirect is handled by app/page.tsx after the request
  // reaches the App Router. Pass through so login/signup stay reachable.
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
