/**
 * Typed, validated environment access for the Next.js app.
 * Throws at import time if required vars are missing.
 */
import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  ADAPTER_URL: z.string().url(),
  ADAPTER_HMAC_SECRET: z.string().min(16),
  S3_ENDPOINT: z.string().url(),
  S3_ENDPOINT_PUBLIC: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true")
    .default("true"),
  ORIZON_SUBMIT_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true")
    .default("false"),
});

// Lazy parse so import order (and drizzle-kit CLI) doesn't trip on missing vars.
let cached: z.infer<typeof serverSchema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "❌ Invalid environment variables:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid environment variables");
  }
  cached = parsed.data;
  return cached;
}

export const ORIZON_SUBMIT_ENABLED = () => env().ORIZON_SUBMIT_ENABLED;
