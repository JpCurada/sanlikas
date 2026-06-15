/**
 * build-pedestrian-graph.mjs
 *
 * Streams data/maps/philippines-260611.osm.pbf, extracts walkable ways inside the
 * NCR bbox, builds a pedestrian routing graph, keeps the largest connected
 * component, pre-tags each edge with 100-year flood risk, and writes a compact
 * bundled JSON consumed at runtime by lib/routing/graph.ts.
 *
 * No SQLite / native module — the whole NCR graph fits comfortably in memory on
 * device, so we ship JSON and load it once. (Design §5 reserves a SQLite
 * corridor-subgraph upgrade for later scale; not needed for NCR-only.)
 *
 * Usage:  node scripts/build-pedestrian-graph.mjs
 * Output: assets/graph/ncr-pedestrian-graph.graphjson
 *
 * Adapted from the LIKAS pedestrian-graph generator (walkable highway classes,
 * haversine edge metres) but sourced directly from the .pbf rather than MBTiles.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const osmParser = require('osm-pbf-parser');
const through2 = require('through2');
// through2 ships an ESM-wrapped build under createRequire: the object-mode
// helper is exposed as `objectTransform` (older builds expose `.obj`).
const objStream = through2.objectTransform || through2.obj || through2.default.obj;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PBF_PATH = path.join(ROOT, 'data/maps/philippines-260611.osm.pbf');
const FLOOD_PATH = path.join(ROOT, 'data/maps/MetroManila_Flood_100year.json');
const OUT_PATH = path.join(ROOT, 'assets/graph/ncr-pedestrian-graph.graphjson');

// NCR bbox (mirrors lib/geo/ncr.ts NCR_SW / NCR_NE).
const BBOX = { minLon: 120.9, minLat: 14.3, maxLon: 121.15, maxLat: 14.8 };

// Highway classes a pedestrian can use (matches LIKAS).
const WALKABLE = new Set([
  'path', 'footway', 'pedestrian', 'living_street', 'steps', 'residential',
  'service', 'unclassified', 'tertiary', 'tertiary_link', 'secondary',
  'secondary_link', 'primary', 'primary_link', 'track', 'corridor', 'road',
]);

const inBbox = (lon, lat) =>
  lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat;

const EARTH_R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
function haversineM(lon1, lat1, lon2, lat2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Pass 1: collect walkable way node-id sequences ──────────────────────────────

console.log('[graph] Pass 1/2 — scanning ways…');

/** @type {Array<number[]>} sequences of node ids forming walkable ways */
const wayNodeSeqs = [];
/** node ids we must resolve to coordinates in pass 2 */
const neededNodes = new Set();

await new Promise((resolve, reject) => {
  const parse = osmParser();
  fs.createReadStream(PBF_PATH)
    .pipe(parse)
    .pipe(
      objStream((items, _enc, next) => {
        for (const item of items) {
          if (item.type !== 'way') continue;
          const hw = item.tags && item.tags.highway;
          if (!hw || !WALKABLE.has(hw)) continue;
          if (item.tags.area === 'yes') continue;
          const refs = item.refs || [];
          if (refs.length < 2) continue;
          wayNodeSeqs.push(refs);
          for (const r of refs) neededNodes.add(r);
        }
        next();
      }),
    )
    .on('finish', resolve)
    .on('error', reject);
});

console.log(
  `[graph]   walkable ways: ${wayNodeSeqs.length.toLocaleString()}, ` +
    `referenced nodes: ${neededNodes.size.toLocaleString()}`,
);

// ── Pass 2: resolve coordinates for referenced nodes (NCR only) ─────────────────

console.log('[graph] Pass 2/2 — resolving node coordinates…');

/** @type {Map<number, [number, number]>} osm node id → [lon, lat] */
const nodeCoord = new Map();

await new Promise((resolve, reject) => {
  const parse = osmParser();
  fs.createReadStream(PBF_PATH)
    .pipe(parse)
    .pipe(
      objStream((items, _enc, next) => {
        for (const item of items) {
          if (item.type !== 'node') continue;
          if (!neededNodes.has(item.id)) continue;
          if (!inBbox(item.lon, item.lat)) continue;
          nodeCoord.set(item.id, [item.lon, item.lat]);
        }
        next();
      }),
    )
    .on('finish', resolve)
    .on('error', reject);
});

console.log(`[graph]   resolved NCR nodes: ${nodeCoord.size.toLocaleString()}`);

// ── Build adjacency (only edges whose BOTH endpoints are in NCR) ────────────────

/** osm node id → compact index */
const idToIdx = new Map();
const idxLon = [];
const idxLat = [];
const adjacency = []; // idx → Array<[neighborIdx, meters]>

function idxOf(osmId) {
  let i = idToIdx.get(osmId);
  if (i === undefined) {
    const coord = nodeCoord.get(osmId);
    i = idxLon.length;
    idToIdx.set(osmId, i);
    idxLon.push(coord[0]);
    idxLat.push(coord[1]);
    adjacency.push([]);
  }
  return i;
}

let edgeCount = 0;
for (const refs of wayNodeSeqs) {
  let prev = null;
  for (const r of refs) {
    if (!nodeCoord.has(r)) {
      prev = null; // gap outside NCR — break the chain
      continue;
    }
    if (prev !== null) {
      const a = idxOf(prev);
      const b = idxOf(r);
      if (a !== b) {
        const m = haversineM(idxLon[a], idxLat[a], idxLon[b], idxLat[b]);
        adjacency[a].push([b, m]);
        adjacency[b].push([a, m]); // pedestrian graph is undirected
        edgeCount++;
      }
    }
    prev = r;
  }
}

console.log(
  `[graph]   raw graph: ${idxLon.length.toLocaleString()} nodes, ` +
    `${edgeCount.toLocaleString()} edges`,
);

// ── Keep the largest connected component (drop islands) ─────────────────────────

const comp = new Int32Array(idxLon.length).fill(-1);
let bestComp = -1;
let bestSize = 0;
let compId = 0;
for (let start = 0; start < idxLon.length; start++) {
  if (comp[start] !== -1) continue;
  let size = 0;
  const stack = [start];
  comp[start] = compId;
  while (stack.length) {
    const n = stack.pop();
    size++;
    for (const [nb] of adjacency[n]) {
      if (comp[nb] === -1) {
        comp[nb] = compId;
        stack.push(nb);
      }
    }
  }
  if (size > bestSize) {
    bestSize = size;
    bestComp = compId;
  }
  compId++;
}

// Re-index nodes in the largest component.
const remap = new Int32Array(idxLon.length).fill(-1);
const nodes = []; // [lon, lat]
for (let i = 0; i < idxLon.length; i++) {
  if (comp[i] === bestComp) {
    remap[i] = nodes.length;
    nodes.push([
      Math.round(idxLon[i] * 1e6) / 1e6,
      Math.round(idxLat[i] * 1e6) / 1e6,
    ]);
  }
}

// ── Flood pre-tagging: mark nodes inside 100-year flood polygons ─────────────────

console.log('[graph] Tagging flood-risk nodes…');
const floodPolys = loadFloodPolygons(FLOOD_PATH);
console.log(`[graph]   flood polygons (NCR-clipped): ${floodPolys.length}`);

// Spatial grid over the NCR bbox: each cell lists indices of polygons whose
// bbox overlaps it. A node then only tests polygons in its own cell, turning an
// O(nodes × polys) scan into roughly O(nodes × polysPerCell). ~0.005° ≈ 550 m.
const GRID = 0.005;
const gridCols = Math.ceil((BBOX.maxLon - BBOX.minLon) / GRID) + 1;
const gridRows = Math.ceil((BBOX.maxLat - BBOX.minLat) / GRID) + 1;
const cellOf = (lon, lat) => {
  const cx = Math.floor((lon - BBOX.minLon) / GRID);
  const cy = Math.floor((lat - BBOX.minLat) / GRID);
  return cy * gridCols + cx;
};
/** @type {Map<number, number[]>} cell index → polygon indices */
const floodGrid = new Map();
const polyBboxes = [];
for (let pi = 0; pi < floodPolys.length; pi++) {
  const outer = floodPolys[pi][0];
  let mnLon = Infinity, mnLat = Infinity, mxLon = -Infinity, mxLat = -Infinity;
  for (const [lon, lat] of outer) {
    if (lon < mnLon) mnLon = lon;
    if (lon > mxLon) mxLon = lon;
    if (lat < mnLat) mnLat = lat;
    if (lat > mxLat) mxLat = lat;
  }
  polyBboxes.push([mnLon, mnLat, mxLon, mxLat]);
  const cx0 = Math.floor((Math.max(mnLon, BBOX.minLon) - BBOX.minLon) / GRID);
  const cx1 = Math.floor((Math.min(mxLon, BBOX.maxLon) - BBOX.minLon) / GRID);
  const cy0 = Math.floor((Math.max(mnLat, BBOX.minLat) - BBOX.minLat) / GRID);
  const cy1 = Math.floor((Math.min(mxLat, BBOX.maxLat) - BBOX.minLat) / GRID);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const cell = cy * gridCols + cx;
      let arr = floodGrid.get(cell);
      if (!arr) floodGrid.set(cell, (arr = []));
      arr.push(pi);
    }
  }
}
console.log(`[graph]   flood grid: ${gridCols}×${gridRows} cells, ${floodGrid.size} non-empty`);

function nodeFloodRisk(lon, lat) {
  const cand = floodGrid.get(cellOf(lon, lat));
  if (!cand) return 0;
  for (const pi of cand) {
    const [mnLon, mnLat, mxLon, mxLat] = polyBboxes[pi];
    if (lon < mnLon || lon > mxLon || lat < mnLat || lat > mxLat) continue;
    if (pointInRings(lon, lat, floodPolys[pi])) return 1;
  }
  return 0;
}

// ── Emit edges (deduped, in largest component), with per-edge flood flag ────────

const floodFlag = new Uint8Array(nodes.length);
for (let i = 0; i < idxLon.length; i++) {
  if (remap[i] === -1) continue;
  floodFlag[remap[i]] = nodeFloodRisk(idxLon[i], idxLat[i]);
}

const edges = []; // [a, b, meters, floodRisk] with a < b
const seen = new Set();
for (let i = 0; i < idxLon.length; i++) {
  if (remap[i] === -1) continue;
  const a = remap[i];
  for (const [j, m] of adjacency[i]) {
    if (remap[j] === -1) continue;
    const b = remap[j];
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = lo * nodes.length + hi;
    if (seen.has(key)) continue;
    seen.add(key);
    const flood = floodFlag[lo] && floodFlag[hi] ? 1 : 0; // edge floods if both ends do
    edges.push([lo, hi, Math.round(m * 10) / 10, flood]);
  }
}

const floodEdges = edges.filter((e) => e[3] === 1).length;
console.log(
  `[graph]   largest component: ${nodes.length.toLocaleString()} nodes, ` +
    `${edges.length.toLocaleString()} edges (${floodEdges.toLocaleString()} flood-prone)`,
);

// ── Write ───────────────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
const payload = {
  meta: {
    builtAt: new Date().toISOString(),
    source: 'philippines-260611.osm.pbf',
    bbox: BBOX,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    floodEdgeCount: floodEdges,
  },
  nodes, // [[lon, lat], …]
  edges, // [[aIdx, bIdx, meters, floodRisk], …]
};
fs.writeFileSync(OUT_PATH, JSON.stringify(payload));
const sizeMB = (fs.statSync(OUT_PATH).size / 1e6).toFixed(1);
console.log(`[graph] ✅ wrote ${OUT_PATH} (${sizeMB} MB)`);

if (nodes.length < 1000 || edges.length < 1000) {
  console.error('[graph] ❌ graph implausibly small — aborting with error.');
  process.exit(1);
}

// ── Flood polygon helpers ───────────────────────────────────────────────────────

function loadFloodPolygons(file) {
  if (!fs.existsSync(file)) {
    console.warn('[graph]   flood file missing — skipping flood tagging.');
    return [];
  }
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const polys = [];
  const feats = fc.type === 'FeatureCollection' ? fc.features : [fc];
  for (const f of feats) {
    const g = f.geometry || f;
    if (!g) continue;
    if (g.type === 'Polygon') addPoly(polys, g.coordinates);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) addPoly(polys, p);
  }
  return polys;
}

function addPoly(polys, rings) {
  // Quick NCR-bbox reject: skip polygons entirely outside NCR.
  let touches = false;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (inBbox(lon, lat)) {
        touches = true;
        break;
      }
    }
    if (touches) break;
  }
  if (touches) polys.push(rings);
}

function pointInRings(lon, lat, rings) {
  // First ring = outer boundary; subsequent rings = holes.
  if (!pointInRing(lon, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lon, lat, rings[h])) return false;
  }
  return true;
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
