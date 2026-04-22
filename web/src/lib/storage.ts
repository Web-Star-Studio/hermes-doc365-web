/**
 * S3-compatible storage module.
 *
 * All S3 calls in the app go through this file so swapping providers
 * (MinIO → R2 → S3 → …) is a config-only change.
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
  }
  return _client;
}

export function getBucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is required");
  return b;
}

/** Build a deterministic-ish, collision-safe key under the conversation folder. */
export function buildStorageKey(opts: {
  orgId: string;
  conversationId: string;
  originalName: string;
}): string {
  const safe = opts.originalName
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
  const id = randomUUID();
  return `org/${opts.orgId}/conv/${opts.conversationId}/${id}-${safe}`;
}

/**
 * Returns a presigned PUT URL valid for `ttlSeconds`.
 * The client will hit this URL directly with the raw bytes.
 *
 * We issue the URL using the PUBLIC endpoint so the browser can reach MinIO
 * directly when running against the compose stack from the host. In pure
 * server-to-server flows we use S3_ENDPOINT instead.
 */
export async function getPresignedPutUrl(params: {
  key: string;
  contentType: string;
  contentLengthBytes?: number;
  ttlSeconds?: number;
}): Promise<string> {
  const ttl = params.ttlSeconds ?? 60 * 5; // 5 minutes is plenty for a PUT
  const cmd = new PutObjectCommand({
    Bucket: getBucket(),
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLengthBytes,
  });

  // If we have a public endpoint override, use a dedicated client to sign so
  // the URL host matches what the browser can reach.
  const publicEndpoint = process.env.S3_ENDPOINT_PUBLIC;
  if (publicEndpoint && publicEndpoint !== process.env.S3_ENDPOINT) {
    const pub = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: publicEndpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
    return getSignedUrl(pub, cmd, { expiresIn: ttl });
  }

  return getSignedUrl(client(), cmd, { expiresIn: ttl });
}

/** Presigned GET for internal use (the adapter downloads through S3_ENDPOINT). */
export async function getPresignedGetUrl(params: {
  key: string;
  ttlSeconds?: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: getBucket(),
    Key: params.key,
  });
  return getSignedUrl(client(), cmd, {
    expiresIn: params.ttlSeconds ?? 60 * 10,
  });
}

/** Confirm an object exists and returns its actual byte size. */
export async function headObject(key: string): Promise<{ size: number } | null> {
  try {
    const out = await client().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key }),
    );
    return { size: Number(out.ContentLength ?? 0) };
  } catch {
    return null;
  }
}
