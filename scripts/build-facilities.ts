/**
 * Build-time facility pipeline (design.md §2, plan.md Phase 1 step 1).
 *
 * data/evacuation/<type>.json  →  assets/facilities/<type>.geojson
 *
 * Run: npm run build:facilities
 * Exits non-zero if any layer ends up with zero NCR records (CI sanity check,
 * design.md §9) or if a source file is missing/unparsable.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FACILITY_TYPES,
  type FacilityType,
  type OsmRecord,
  buildFacilityCollections,
} from './facilities-pipeline';

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'evacuation');
const OUTPUT_DIR = path.join(ROOT, 'assets', 'facilities');

function readSource(type: FacilityType): OsmRecord[] {
  const file = path.join(SOURCE_DIR, `${type}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${file}: expected a JSON array of records`);
  }
  return parsed as OsmRecord[];
}

function main(): void {
  const rawByType: Partial<Record<FacilityType, OsmRecord[]>> = {};
  let sourceErrors = 0;

  for (const type of FACILITY_TYPES) {
    try {
      rawByType[type] = readSource(type);
    } catch (err) {
      sourceErrors += 1;
      console.error(`[build-facilities] FAILED to read ${type}.json: ${(err as Error).message}`);
      rawByType[type] = [];
    }
  }

  const { collections, warnings } = buildFacilityCollections(rawByType);

  for (const line of warnings.malformedCoordinates) {
    console.warn(`[build-facilities] skipped (malformed coordinates) ${line}`);
  }
  for (const line of warnings.duplicatesDropped) {
    console.warn(`[build-facilities] deduped (osm id already emitted) ${line}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let emptyLayers = 0;
  console.log('[build-facilities] NCR facility counts per layer:');
  for (const type of FACILITY_TYPES) {
    const collection = collections[type];
    const outFile = path.join(OUTPUT_DIR, `${type}.geojson`);
    fs.writeFileSync(outFile, JSON.stringify(collection));
    const count = collection.features.length;
    const total = rawByType[type]?.length ?? 0;
    console.log(`  ${type.padEnd(14)} ${String(count).padStart(4)} / ${total} nationwide`);
    if (count === 0) emptyLayers += 1;
  }
  console.log(
    `[build-facilities] skipped ${warnings.malformedCoordinates.length} malformed, ` +
      `deduped ${warnings.duplicatesDropped.length} duplicates → ${OUTPUT_DIR}`,
  );

  if (sourceErrors > 0 || emptyLayers > 0) {
    console.error(
      `[build-facilities] FAILED: ${sourceErrors} unreadable source file(s), ` +
        `${emptyLayers} layer(s) with zero NCR records.`,
    );
    process.exit(1);
  }
}

main();
