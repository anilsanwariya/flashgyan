// Rebuilds src/lib/ca-map-data.ts (the monthly magazine's India and
// Rajasthan outlines) from DataMeet's boundaries (CC BY 4.0):
//   Country/india-composite.geojson and States/Admin2.{shp,dbf} from
//   https://github.com/datameet/maps, downloaded into one folder.
// Run: npm i --no-save shapefile@0.6.6 @turf/simplify@7.1.0
//      node scripts/build-map-data.mjs <folder> src/lib/ca-map-data.ts
import fs from "node:fs";
import * as shp from "shapefile";
import simplify from "@turf/simplify";
const [dir, out] = process.argv.slice(2);
const states = [];
const src = await shp.open(dir + "/Admin2.shp", dir + "/Admin2.dbf");
for (;;) {
  const r = await src.read();
  if (r.done) break;
  states.push(r.value);
}
const india = JSON.parse(fs.readFileSync(dir + "/india-composite.geojson", "utf8"));

const rings = (g) => (g.type === "Polygon" ? g.coordinates : g.coordinates.flat());
const simp = (f, tol) => simplify(f, { tolerance: tol, highQuality: true });
// Equirectangular, x scaled by cos(mid latitude), fitted to the width.
function projection(bbox, width) {
  const [x0, y0, x1, y1] = bbox;
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const scale = width / ((x1 - x0) * k);
  return { lon0: x0, lat1: y1, k, scale, width, height: Math.round((y1 - y0) * scale) };
}
const pt = (p, [lon, lat]) => [(lon - p.lon0) * p.k * p.scale, (p.lat1 - lat) * p.scale];
function path(p, geom, minArea = 0) {
  return rings(geom)
    .filter((ring) => {
      if (!minArea) return true;
      const xs = ring.map((c) => pt(p, c));
      let a = 0;
      for (let i = 0; i < xs.length; i++) {
        const [x1, y1] = xs[i],
          [x2, y2] = xs[(i + 1) % xs.length];
        a += x1 * y2 - x2 * y1;
      }
      return Math.abs(a / 2) >= minArea;
    })
    .map(
      (ring) =>
        "M" +
        ring
          .map((c) =>
            pt(p, c)
              .map((v) => v.toFixed(1))
              .join(","),
          )
          .join("L") +
        "Z",
    )
    .join("");
}
function bboxOf(geoms) {
  let b = [180, 90, -180, -90];
  for (const g of geoms)
    for (const ring of rings(g))
      for (const [x, y] of ring)
        b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
}
// The polygons themselves (lon/lat, simplified) to test a point is inside.
const coords = (g) => rings(g).map((ring) => ring.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]));

const indiaGeom = simp(india.features[0], 0.04).geometry;
const indiaP = projection(bboxOf([indiaGeom]), 520);
const stateLines = states.map((s) => path(indiaP, simp(s, 0.04).geometry, 1.5)).join("");
const raj = states.find((s) => s.properties.ST_NM === "Rajasthan");
const rajGeom = simp(raj, 0.012).geometry;
const rajP = projection(bboxOf([rajGeom]), 520);
const rajTest = simp(raj, 0.02).geometry;
const indiaTest = simp(india.features[0], 0.08).geometry;

const body = `// India and Rajasthan outlines for the monthly magazine's "Places in News"
// maps: SVG paths with each map's projection, and coarser polygons (longitude,
// latitude) to check a place lies inside. Generated from DataMeet's India
// boundaries (the composite outline as per the Survey of India, and state
// boundaries), CC BY 4.0: https://github.com/datameet/maps. Do not edit by
// hand.

export type MapProjection = { lon0: number; lat1: number; k: number; scale: number; width: number; height: number };

export const MAP_CREDIT = "Map: DataMeet (CC BY 4.0), not to scale";

export const INDIA_MAP = {
  projection: ${JSON.stringify(indiaP)} as MapProjection,
  outline: ${JSON.stringify(path(indiaP, simp(india.features[0], 0.01).geometry, 0.02))},
  states: ${JSON.stringify(stateLines)},
  rajasthan: ${JSON.stringify(path(indiaP, simp(raj, 0.04).geometry))},
};

export const RAJASTHAN_MAP = {
  projection: ${JSON.stringify(rajP)} as MapProjection,
  outline: ${JSON.stringify(path(rajP, rajGeom))},
};

export const INSIDE: Record<"india" | "rajasthan", number[][][]> = {
  india: ${JSON.stringify(coords(indiaTest))},
  rajasthan: ${JSON.stringify(coords(rajTest))},
};
`;
fs.writeFileSync(out, body);
console.log("bytes", body.length, "india", indiaP, "raj", rajP);
