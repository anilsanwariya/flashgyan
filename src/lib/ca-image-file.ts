// Images picked in the browser, made ready to upload: large photos are made
// smaller (sharp in print, light to send); small PNGs stay as they are.
const MAX_SIDE = 2000;
const KEEP_PNG_BYTES = 1_500_000;

// maxSide: the longest side in pixels after resizing.
export async function prepareImage(
  file: File,
  maxSide = MAX_SIDE,
): Promise<{ type: string; bytes: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  // Small PNGs (maps, diagrams) stay as they are: sharp lines and text.
  if (file.type === "image/png" && scale === 1 && file.size <= KEEP_PNG_BYTES) {
    bitmap.close();
    return { type: "image/png", bytes: file, w, h };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  if (!blob) throw new Error("Couldn't read this image");
  return { type: "image/jpeg", bytes: blob, w, h };
}

export async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
}
