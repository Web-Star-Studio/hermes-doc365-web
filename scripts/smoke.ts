#!/usr/bin/env tsx
/**
 * Post-bootstrap smoke test.
 *
 * Hits the three things we care about when validating a fresh stack:
 *   1. Next.js /api/health returns { ok: true }
 *   2. Adapter /healthz returns { ok: true }
 *   3. MinIO endpoint is reachable (HEAD /)
 *
 * Non-zero exit on any failure — good for CI and for `./scripts/bootstrap.sh`
 * post-checks. Use env vars to point at custom hosts.
 */

const WEB = process.env.SMOKE_WEB ?? "http://localhost:3000";
const ADAPTER = process.env.SMOKE_ADAPTER ?? "http://localhost:8000";
const MINIO = process.env.SMOKE_MINIO ?? "http://localhost:9000";

async function check(name: string, url: string, expectJson = true) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { accept: expectJson ? "application/json" : "*/*" },
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      console.error(`  ✗ ${name}  ${res.status} ${res.statusText}  (${ms}ms)`);
      return false;
    }
    if (expectJson) {
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
      } | null;
      const ok = body?.ok === true;
      console.log(`  ${ok ? "✓" : "✗"} ${name}  ${ms}ms  ${JSON.stringify(body)}`);
      return ok;
    }
    console.log(`  ✓ ${name}  ${ms}ms  ${res.status}`);
    return true;
  } catch (e) {
    console.error(`  ✗ ${name}  ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  console.log("\nDoc365 Hermes smoke test\n");
  const a = await check("web      /api/health", `${WEB}/api/health`);
  const b = await check("adapter  /healthz   ", `${ADAPTER}/healthz`);
  const c = await check("minio    /          ", `${MINIO}/minio/health/live`, false);
  if (!(a && b && c)) {
    console.error("\nFAIL\n");
    process.exit(1);
  }
  console.log("\nOK\n");
}

main();
