// The finishing step for a magazine PDF. "Join us on Telegram", centred at
// the bottom of every page and linked to the channel: Chrome's page footer
// can't hold a working link, so it is added to the finished PDF (the text,
// and a link area over it). Ad pages are made again as clean full pages.
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import { PAGE_MARK } from "@/lib/ca-cover-html";

// On the baseline of the footer's brand line and page numbers.
export const JOIN_BASELINE_PT = 16;
const SIZE = 8.5;

function hexRgb(hex: string) {
  const h = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "6d28d9";
  const n = parseInt(h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// A full-page ad for the PDF step: the image bytes (JPG or PNG), how it
// fills the page and its link.
export type AdImage = { bytes: Uint8Array; fit: "fill" | "fit"; link?: string };

type Mark = { kind: "ad" | "notes"; id?: string };

function uriOf(doc: PDFDocument, ref: unknown): string {
  const annot = doc.context.lookup(ref as PDFRef);
  if (!(annot instanceof PDFDict)) return "";
  const action = annot.lookup(PDFName.of("A"));
  if (!(action instanceof PDFDict)) return "";
  const uri = action.lookup(PDFName.of("URI"));
  return uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : "";
}

// The page markers the magazine HTML leaves on ad and notes pages, taken off
// the pages (they are invisible links).
function takeMarks(doc: PDFDocument): Map<number, Mark> {
  const marks = new Map<number, Mark>();
  doc.getPages().forEach((page, i) => {
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) return;
    for (let k = annots.size() - 1; k >= 0; k--) {
      const uri = uriOf(doc, annots.get(k));
      if (!uri.startsWith(PAGE_MARK)) continue;
      annots.remove(k);
      const [kind, , id] = uri.slice(PAGE_MARK.length).split("/");
      if (kind === "ad") marks.set(i, { kind: "ad", id: decodeURIComponent(id ?? "") });
      else if (kind === "notes") marks.set(i, { kind: "notes" });
    }
  });
  return marks;
}

function linkAnnot(doc: PDFDocument, page: PDFPage, rect: number[], url: string) {
  const annot = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rect,
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    }),
  );
  const annots = page.node.lookup(PDFName.of("Annots"));
  if (annots instanceof PDFArray) annots.push(annot);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([annot]));
}

// An ad page made again as a clean page: the image only, without the page
// footer Chrome prints on every page. It keeps its place, so the page
// numbers after it still count it.
async function adPage(doc: PDFDocument, i: number, ad: AdImage) {
  const old = doc.getPage(i);
  const { width: W, height: H } = old.getSize();
  const png = ad.bytes[0] === 0x89 && ad.bytes[1] === 0x50;
  const img = png ? await doc.embedPng(ad.bytes) : await doc.embedJpg(ad.bytes);
  const scale =
    ad.fit === "fit"
      ? Math.min(W / img.width, H / img.height)
      : Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const page = doc.insertPage(i, [W, H]);
  doc.removePage(i + 1);
  page.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  if (ad.link && /^https:\/\/\S+$/.test(ad.link)) linkAnnot(doc, page, [0, 0, W, H], ad.link);
}

// The finished magazine PDF: ad pages made clean, and "Join us on Telegram"
// at the bottom of every other page. Also says how many pages it has.
export async function finishPdf(
  pdf: Uint8Array,
  opts: {
    join?: { text: string; url: string; color: string };
    loadAd?: (id: string) => Promise<AdImage | null>;
  },
): Promise<{ pdf: Uint8Array; pages: number }> {
  const doc = await PDFDocument.load(pdf);
  const marks = takeMarks(doc);
  for (const [i, mark] of marks) {
    if (mark.kind !== "ad" || !mark.id || !opts.loadAd) continue;
    try {
      const ad = await opts.loadAd(mark.id);
      if (ad) await adPage(doc, i, ad);
    } catch (e) {
      // The ad stays as the HTML printed it, footer and all.
      console.error("ad page:", e instanceof Error ? e.message : e);
    }
  }
  const link = opts.join;
  if (link && /^https:\/\/\S+$/.test(link.url)) {
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    // The built-in font has Latin letters only.
    let text = link.text.trim() || "Join us on Telegram";
    try {
      font.encodeText(text);
    } catch {
      text = "Join us on Telegram";
    }
    const width = font.widthOfTextAtSize(text, SIZE);
    const color = hexRgb(link.color);
    doc.getPages().forEach((page, i) => {
      if (marks.get(i)?.kind === "ad") return;
      const box = page.getMediaBox();
      const x = box.x + (box.width - width) / 2;
      const y = box.y + JOIN_BASELINE_PT;
      page.drawText(text, { x, y, size: SIZE, font, color });
      page.drawLine({
        start: { x, y: y - 1.5 },
        end: { x: x + width, y: y - 1.5 },
        thickness: 0.5,
        color,
      });
      linkAnnot(doc, page, [x - 4, y - 5, x + width + 4, y + SIZE + 3], link.url);
    });
  }
  return { pdf: await doc.save(), pages: doc.getPageCount() };
}

export async function addJoinLink(
  pdf: Uint8Array,
  link: { text: string; url: string; color: string },
): Promise<Uint8Array> {
  if (!/^https:\/\/\S+$/.test(link.url)) return pdf;
  return (await finishPdf(pdf, { join: link })).pdf;
}
