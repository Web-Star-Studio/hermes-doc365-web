/**
 * Auth.js v5 full configuration (Node runtime only).
 *
 * This module pulls in bcryptjs + pg + drizzle, which are NOT available in
 * the Edge runtime. `middleware.ts` MUST import `auth.config.ts` instead —
 * not this file — or it will fail with "The edge runtime does not support
 * Node.js 'crypto' module".
 *
 * Credentials provider only for MVP (email + password, bcrypt hashes).
 * Session strategy: JWT (default for credentials). No external OAuth
 * providers — portability mandate from PRD §23.2.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { organizations, users } from "@/db/schema";

import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const row = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            passwordHash: users.passwordHash,
            organizationId: users.organizationId,
            role: users.role,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        const user = row[0];
        if (!user) return null;

        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

        // Update last_login_at asynchronously (fire-and-forget).
        db.update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id))
          .catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          role: user.role,
        };
      },
    }),
  ],
});

/** Convenience type for route handlers. */
export type AppSession = Awaited<ReturnType<typeof auth>>;

/** Guard used inside server components / route handlers. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session.user;
}

/** Like `requireUser`, but also enforces operator role. */
export async function requireOperator() {
  const user = await requireUser();
  if (user.role !== "operator") {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

// Keep references so `await import()` side-effects don't purge them during
// dead-code elimination in some bundler passes.
void organizations;
