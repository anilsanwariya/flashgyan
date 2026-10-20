// "Join us on Telegram", centred at the bottom of every page of a magazine
// PDF and linked to the channel. Chrome's page footer can't hold a working
// link, so it is added to the finished PDF: the text, and a link area over it.
import { PDFArray, PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";

// On the baseline of the footer's brand line and page numbers.
export const JOIN_BASELINE_PT = 16;
const SIZE = 8.5;

function hexRgb(hex: string) {
  const h = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "6d28d9";
  const n = parseInt(h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function addJoinLink(
  pdf: Uint8Array,
  link: { text: string; url: string; color: string },
): Promise<Uint8Array> {
  if (!/^https:\/\/\S+$/.test(link.url)) return pdf;
  const doc = await PDFDocument.load(pdf);
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
  for (const page of doc.getPages()) {
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
    const annot = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [x - 4, y - 5, x + width + 4, y + SIZE + 3],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(link.url) },
      }),
    );
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (annots instanceof PDFArray) annots.push(annot);
    else page.node.set(PDFName.of("Annots"), doc.context.obj([annot]));
  }
  return doc.save();
}
