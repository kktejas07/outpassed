import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";

/**
 * Where photos and payment proofs live. With S3_BUCKET set they go to an
 * S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) and the database keeps
 * only a key; without it they stay in Postgres as before. Reads accept either,
 * so a college can switch on the bucket later without migrating old photos.
 */
export interface BlobStore {
  put(key: string, data: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

class S3Store implements BlobStore {
  private client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? { credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } } : {}),
  });
  constructor(private bucket: string) {}
  async put(key: string, data: Uint8Array, mime: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mime }));
  }
  async get(key: string) {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return out.Body ? new Uint8Array(await out.Body.transformToByteArray()) : null;
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let store: BlobStore | null = env.S3_BUCKET ? new S3Store(env.S3_BUCKET) : null;

/** Tests swap in an in-memory store; null goes back to keeping images in the database. */
export function setBlobStore(s: BlobStore | null) {
  store = s;
}

export const bucketEnabled = () => !!store;

/** Saves an image: to the bucket when there is one (returns its key), else returns the bytes for the database. */
export async function storeImage(prefix: "profile" | "gate" | "visitor" | "fee-proof" | "market" | "ticket", img: { data: Uint8Array; mime: string }) {
  if (!store) return { data: img.data as Uint8Array<ArrayBuffer>, key: null };
  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
  await store.put(key, img.data, img.mime);
  return { data: null, key };
}

/** Reads an image from wherever it was saved. */
export async function readImage(row: { data?: Uint8Array | null; key?: string | null }): Promise<Uint8Array | null> {
  if (row.data) return row.data;
  if (row.key && store) return store.get(row.key);
  return null;
}

/** Deletes bucket copies; never throws (the database row is what matters). */
export async function deleteImages(keys: (string | null | undefined)[]) {
  if (!store) return;
  for (const k of keys) if (k) await store.delete(k).catch(() => undefined);
}
