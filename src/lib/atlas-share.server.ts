// Server-only: the picture a shared atlas link shows (WhatsApp, Telegram):
// the map of Rajasthan with the place or district marked, its name in both
// languages and a fact from the notes. Made once per version of what it
// shows and kept in storage; when pictures can't be made, the site's own.
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AGRO_ZONES, DIVISIONS, atlasCat, eraLabel, monthsLabel, type LonLat } from "@/lib/atlas";
import { atlasBase, atlasDistrictPage, atlasEntityFacts, atlasPlace } from "@/lib/atlas.server";

const BUCKET = "ca-magazines";
export const SITE_PREVIEW =
  "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ab39d20b-0ba5-4e3e-a17e-c84d41522181";
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type PreviewCard = {
  kicker: string;
  title: string;
  title_hi: string;
  lines: string[];
  fact: string;
  rings: LonLat[][][];
  mark: LonLat[][] | null;
  dot: LonLat | null;
};

// The card as a page 1200 × 630 (the map drawn from the districts' outlines).
export function previewHtml(c: PreviewCard): string {
  const all = c.rings.flat(2);
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const kx = Math.cos((26.5 * Math.PI) / 180);
  const box = 540;
  const s = Math.min(box / ((maxX - minX) * kx), box / (maxY - minY));
  const pt = ([x, y]: LonLat) => [
    ((x - minX) * kx * s + 20).toFixed(1),
    ((maxY - y) * s + 20).toFixed(1),
  ];
  const path = (rings: LonLat[][]) =>
    rings.map((r) => `M${r.map((p) => pt(p).join(",")).join("L")}Z`).join("");
  const dot = c.dot ? pt(c.dot) : null;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@500;700&family=Noto+Serif:wght@700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;display:flex;background:#fffaf0;font-family:"Noto Sans Devanagari",sans-serif;color:#1f2430;overflow:hidden}
.map{width:580px;height:630px;background:#eef2f7;display:grid;place-items:center}
.text{flex:1;padding:56px 52px 40px 44px;display:flex;flex-direction:column;gap:14px}
.kicker{font-size:22px;font-weight:700;color:#b4235a;text-transform:uppercase;letter-spacing:.06em}
h1{font-family:"Noto Serif",serif;font-size:58px;line-height:1.05;color:#1f2a5c}
.hi{font-size:36px;font-weight:700;color:#334155}
.lines{font-size:24px;color:#475569}
.fact{font-size:24px;line-height:1.35;border-left:6px solid #f59e0b;padding-left:16px;color:#1f2430}
.foot{margin-top:auto;font-size:22px;font-weight:700;color:#1f2a5c}
</style></head><body data-fit>
<div class="map"><svg width="580" height="580" viewBox="0 0 580 580">
<path d="${c.rings.map(path).join("")}" fill="#fffdf6" stroke="#94a3b8" stroke-width="1"/>
${c.mark ? `<path d="${path(c.mark)}" fill="#fde68a" stroke="#b45309" stroke-width="2.5"/>` : ""}
${dot ? `<circle cx="${dot[0]}" cy="${dot[1]}" r="13" fill="#b4235a" stroke="#fff" stroke-width="4"/>` : ""}
</svg></div>
<div class="text">
<div class="kicker">${esc(c.kicker)}</div>
<h1>${esc(c.title)}</h1>
${c.title_hi && c.title_hi !== c.title ? `<div class="hi">${esc(c.title_hi)}</div>` : ""}
${c.lines.length ? `<div class="lines">${c.lines.map(esc).join(" · ")}</div>` : ""}
${c.fact ? `<div class="fact">${esc(c.fact.length > 170 ? `${c.fact.slice(0, 167)}…` : c.fact)}</div>` : ""}
<div class="foot">FlashGyan · Rajasthan Atlas</div>
</div></body></html>`;
}

// What a place's or a district's card shows; null: not in the atlas.
export async function previewCard(
  kind: "place" | "district",
  key: string,
): Promise<PreviewCard | null> {
  const base = await atlasBase();
  const rings = base.districts.map((d) => d.rings);
  if (kind === "place") {
    const r = await atlasPlace(key).catch(() => null);
    if (!r) return null;
    const p = r.place;
    const c = atlasCat(p.cat);
    const d = base.districts.find((x) => x.en === p.district);
    return {
      kicker: `${c.icon} ${c.name.en}`,
      title: p.name.en,
      title_hi: p.name.hi,
      lines: [
        p.district ? `${p.district} district` : "",
        eraLabel(p.era_from, p.era_to),
        monthsLabel(p.months, "en"),
      ].filter(Boolean),
      fact: r.facts[0]?.text.en ?? r.mentions[0]?.text.en ?? "",
      rings,
      mark: d?.rings ?? null,
      dot: [p.lon, p.lat],
    };
  }
  const page = await atlasDistrictPage(key);
  if (!page) return null;
  const division = DIVISIONS.find((x) => x.key === page.meta.division);
  const zone = AGRO_ZONES.find((x) => x.key === page.meta.zone);
  const facts = await atlasEntityFacts(`D:${key}`);
  return {
    kicker: "District of Rajasthan",
    title: page.name.en,
    title_hi: page.name.hi,
    lines: [
      division ? `${division.name.en} division` : "",
      zone ? `Zone ${zone.name.en}` : "",
      `${page.places.length} places`,
    ].filter(Boolean),
    fact: page.overview?.tagline.en || facts[0]?.text.en || "",
    rings,
    mark: base.districts.find((x) => x.en === key)?.rings ?? null,
    dot: null,
  };
}

// The PNG (made now, or as kept), or null when it can't be made.
export async function previewPng(
  kind: "place" | "district",
  key: string,
): Promise<Uint8Array | null> {
  const card = await previewCard(kind, key);
  if (!card) return null;
  const html = previewHtml(card);
  const hash = createHash("sha1").update(html).digest("hex").slice(0, 12);
  const path = `atlas-previews/${kind}/${key.replace(/[^a-z0-9-]+/gi, "_").slice(0, 80)}-${hash}.png`;
  const kept = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (!kept.error && kept.data) return new Uint8Array(await kept.data.arrayBuffer());
  try {
    const { screenshot } = await import("@/lib/ig.server");
    const png = await screenshot(html, { width: 1200, height: 630 });
    await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, png, { contentType: "image/png", upsert: true });
    return png;
  } catch (e) {
    console.error("atlas preview:", e instanceof Error ? e.message : e);
    return null;
  }
}
