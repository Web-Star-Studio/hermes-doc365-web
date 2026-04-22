/**
 * Edge-safe subset of the Auth.js configuration.
 *
 * This module MUST NOT import anything that reaches into Node-only APIs
 * (bcryptjs, pg, drizzle, fs, crypto, etc.) — it's loaded by `middleware.ts`
 * which runs in the Edge runtime. The Credentials provider and database
 * lookups live in `auth.ts`, which extends this config with an additional
 * `providers` array.
 *
 * This is the canonical next-auth v5 "split config" pattern:
 *   https://authjs.dev/guides/edge-compatibility
 */

import type { DefaultSession, NextAuthConfig } from "next-auth";

// Anchor import so `declare module "next-auth/jwt"` below resolves
// (next-auth/jwt re-exports from @auth/core/jwt; without a reference
// TS fails with TS2664).
import type {} from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: "user" | "operator";
      name: string;
      email: string;
    } & DefaultSession["user"];
  }

  interface User {
    // `id` must stay optional to match @auth/core's base `User` type
    // (TS2687: "All declarations of 'id' must have identical modifiers.").
    // At runtime `authorize()` always returns an `id`; the jwt callback
    // narrows before copying it onto the token.
    id?: string;
    organizationId: string;
    role: "user" | "operator";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    organizationId: string;
    role: "user" | "operator";
  }
}

export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h sessions
  pages: { signIn: "/login" },
  trustHost: true,
  // Providers are added in auth.ts (they pull in bcrypt + the DB).
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.organizationId = user.organizationId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
        session.user.organizationId = token.organizationId as string;
        session.user.role = token.role as "user" | "operator";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
