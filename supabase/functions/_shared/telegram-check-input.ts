import { CHECK_MAX_PHOTOS, CHECK_MIN_WORDS } from "./saathi-check.ts";
import type { SaathiImage } from "./saathi-core.ts";

export const CHECK_PHOTO_MAX_BYTES = 4_500_000;
export type CheckPhoto = { file_id: string; mime: SaathiImage["media_type"] };

export function checkQuestionInput(text: string): { question: string; marks: number | null } | null {
  const value = text.trim();
  const match = /^(\d{1,2})\s+([\s\S]+)$/.exec(value);
  const marks = match ? Number(match[1]) : null;
  const question = (match ? match[2] : value).trim();
  if (question.length < 5 || question.length > 2000 || (marks !== null && (marks < 1 || marks > 50))) return null;
  return { question, marks };
}

export function validCheckAnswer(text: string, photoCount: number): boolean {
  return text.length <= 12_000 && photoCount <= CHECK_MAX_PHOTOS &&
    (photoCount > 0 || text.trim().split(/\s+/).filter(Boolean).length >= CHECK_MIN_WORDS);
}

export function pickCheckPhoto(message: {
  photo?: { file_id?: string; file_size?: number }[];
  document?: { file_id?: string; file_size?: number; mime_type?: string };
}): CheckPhoto | null {
  if (Array.isArray(message.photo)) {
    const sizes = message.photo.filter((p) => p.file_id && (!p.file_size || p.file_size <= CHECK_PHOTO_MAX_BYTES));
    const best = sizes[sizes.length - 1];
    return best?.file_id ? { file_id: best.file_id, mime: "image/jpeg" } : null;
  }
  const doc = message.document;
  const mime = doc?.mime_type;
  if (doc?.file_id && (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") &&
      (!doc.file_size || doc.file_size <= CHECK_PHOTO_MAX_BYTES)) {
    return { file_id: doc.file_id, mime };
  }
  return null;
}