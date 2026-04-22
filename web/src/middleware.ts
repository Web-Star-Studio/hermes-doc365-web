/**
 * Next.js middleware: gates protected routes behind auth.
 *
 * NOTE: Auth.js v5 middleware is lightweight — it only inspects the session
 * JWT cookie. It does NOT hit the DB. DB-backed checks live in the route
 * handlers / server components themselves.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Always allow these:
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/login") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Everything else requires a session.
  if (!req.auth?.user) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /admin requires operator role.
  if (pathname.startsWith("/admin") && req.auth.user.role !== "operator") {
    return NextResponse.redirect(new URL("/conversations", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
