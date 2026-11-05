// Server-only helpers for admin image uploads and removals.
type Admin = { storage: any; from: (t: any) => any };

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp";
  return null;
}

/** Decodes and validates an uploaded image: JPEG/PNG/WebP/GIF, at most maxBytes. */
export function validateImageUpload(
  contentType: string,
  dataBase64: string,
  maxBytes = 5 * 1024 * 1024,
): { bytes: Buffer; contentType: string; ext: string } {
  if (dataBase64.length > Math.ceil((maxBytes * 4) / 3) + 8) {
    throw new Error(`Image is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`);
  }
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw new Error(`Image is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`);
  }
  const actual = sniff(bytes);
  if (!actual || !TYPES[actual] || (contentType && TYPES[contentType] && contentType !== actual && !(contentType === "image/jpg"))) {
    throw new Error("Only JPEG, PNG, WebP or GIF images are allowed");
  }
  return { bytes, contentType: actual, ext: TYPES[actual] };
}

/** Storage object path from a stored value (plain path or signed URL). */
export function objectPath(bucket: string, value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^https?:\/\//.test(value)) return value;
  try {
    const u = new URL(value);
    const marker = `/object/sign/${bucket}/`;
    const i = u.pathname.indexOf(marker);
    return i >= 0 ? decodeURIComponent(u.pathname.slice(i + marker.length)) : null;
  } catch {
    return null;
  }
}

/**
 * Deletes the image object a row currently points at when it is being removed
 * or replaced, so links handed out earlier stop working.
 */
export async function releaseOldImage(
  admin: Admin,
  bucket: string,
  table: string,
  id: string,
  next: string | null | undefined,
): Promise<void> {
  const { data } = await admin.from(table as never).select("image_url").eq("id", id).maybeSingle();
  const oldPath = objectPath(bucket, (data as { image_url?: string | null } | null)?.image_url);
  if (!oldPath) return;
  if (next !== undefined && objectPath(bucket, next) === oldPath) return;
  const { error } = await admin.storage.from(bucket).remove([oldPath]);
  if (error) console.error("image remove", error.message);
}
