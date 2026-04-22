#!/usr/bin/env tsx
/**
 * Creates a dev user (and its default organization) so you can log in at /login
 * without manually poking SQL.
 *
 * Run from repo root:
 *     pnpm tsx scripts/seed-user.ts
 *
 * Reads defaults from env; override with flags:
 *     --email    dev@doc365.local
 *     --password doc365dev
 *     --org      "Doc365 Dev"
 *     --role     user | operator  (default: user)
 *
 * Safe to re-run: if the email already exists, we update the password hash
 * and role but keep the user's id stable.
 */

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { hash as bcryptHash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

import { organizations, users } from "../web/src/db/schema";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string", default: "dev@doc365.local" },
      password: { type: "string", default: "doc365dev" },
      org: { type: "string", default: "Doc365 Dev" },
      role: { type: "string", default: "user" },
      name: { type: "string", default: "Desenvolvedor Doc365" },
    },
  });

  const email = values.email!.toLowerCase();
  const password = values.password!;
  const orgName = values.org!;
  const role = (values.role === "operator" ? "operator" : "user") as
    | "user"
    | "operator";
  const name = values.name!;

  const dbUrl =
    process.env.DATABASE_URL ??
    "postgres://doc365:doc365dev@localhost:5432/doc365";

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const db = drizzle(client);

  try {
    // 1. Upsert organization by name.
    const existingOrgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, orgName))
      .limit(1);

    let orgId: string;
    if (existingOrgs[0]) {
      orgId = existingOrgs[0].id;
      console.log(`[seed-user] reusing org "${orgName}" (${orgId})`);
    } else {
      orgId = randomUUID();
      await db.insert(organizations).values({ id: orgId, name: orgName });
      console.log(`[seed-user] created org "${orgName}" (${orgId})`);
    }

    // 2. Hash password.
    const passwordHash = await bcryptHash(password, 10);

    // 3. Upsert user by email within org.
    const existingUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.organizationId, orgId)))
      .limit(1);

    if (existingUsers[0]) {
      const u = existingUsers[0];
      await db
        .update(users)
        .set({ passwordHash, role, name })
        .where(eq(users.id, u.id));
      console.log(`[seed-user] updated user ${email} (${u.id}) role=${role}`);
    } else {
      const id = randomUUID();
      await db.insert(users).values({
        id,
        organizationId: orgId,
        email,
        passwordHash,
        role,
        name,
      });
      console.log(`[seed-user] created user ${email} (${id}) role=${role}`);
    }

    console.log("");
    console.log(`  login with:  ${email} / ${password}`);
    console.log("");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[seed-user] failed:", err);
  process.exit(1);
});
