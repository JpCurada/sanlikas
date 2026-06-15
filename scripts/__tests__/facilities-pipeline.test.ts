import {
  buildFacilityCollections,
  isNcrRecord,
  parseCoordinates,
  type OsmRecord,
} from '../facilities-pipeline';

function record(overrides: Partial<OsmRecord>): OsmRecord {
  return {
    osm_type: 'node',
    osm_id: 1,
    lat: '14.60',
    lon: '121.00',
    name: 'Test Facility',
    display_name: 'Test Facility, Manila, Metro Manila, Philippines',
    address: { region: 'Metro Manila', 'ISO3166-2-lvl3': 'PH-00' },
    ...overrides,
  };
}

describe('parseCoordinates', () => {
  it('parses string lat/lon as [lon, lat]', () => {
    expect(parseCoordinates(record({ lat: '14.5990090', lon: '120.9658305' }))).toEqual([
      120.9658305, 14.599009,
    ]);
  });

  it('returns null for missing or non-numeric coordinates', () => {
    expect(parseCoordinates(record({ lat: undefined, lon: '121.0' }))).toBeNull();
    expect(parseCoordinates(record({ lat: 'abc', lon: '121.0' }))).toBeNull();
    expect(parseCoordinates(record({ lat: '14.6', lon: '' }))).toBeNull();
  });

  it('returns null for out-of-range coordinates', () => {
    expect(parseCoordinates(record({ lat: '95', lon: '121' }))).toBeNull();
    expect(parseCoordinates(record({ lat: '14.6', lon: '200' }))).toBeNull();
  });
});

describe('isNcrRecord', () => {
  it('accepts records labeled Metro Manila by region', () => {
    expect(isNcrRecord(record({}), [121.0, 14.6])).toBe(true);
  });

  it('accepts records labeled PH-00 even without a region name', () => {
    const r = record({ address: { 'ISO3166-2-lvl3': 'PH-00' } });
    expect(isNcrRecord(r, [121.0, 14.6])).toBe(true);
  });

  it('rejects records labeled with another region even when inside the NCR bbox', () => {
    const r = record({
      address: { region: 'Calabarzon', state: 'Cavite', 'ISO3166-2-lvl3': 'PH-40' },
    });
    expect(isNcrRecord(r, [121.0, 14.35])).toBe(false);
  });

  it('falls back to the bbox when the address has no regional signal', () => {
    const inside = record({ address: { country: 'Philippines' } });
    expect(isNcrRecord(inside, [121.0, 14.6])).toBe(true);
    const noAddress = record({ address: undefined });
    expect(isNcrRecord(noAddress, [121.0, 14.6])).toBe(true);
  });

  it('rejects records outside the bbox when the address has no regional signal', () => {
    const r = record({ address: undefined });
    expect(isNcrRecord(r, [125.48, 7.14])).toBe(false); // Davao
    expect(isNcrRecord(r, [120.5, 14.6])).toBe(false); // west of NCR
  });
});

describe('buildFacilityCollections', () => {
  it('keeps nationwide records, skips malformed coordinates, and dedupes across files', () => {
    const ncrSchool = record({ osm_id: 100, name: 'NCR School' });
    const davaoSchool = record({
      osm_id: 101,
      name: 'Davao School',
      lat: '7.14',
      lon: '125.48',
      address: { region: 'Davao Region', 'ISO3166-2-lvl3': 'PH-11' },
    });
    const badCoords = record({ osm_id: 102, name: 'Broken', lat: 'not-a-number' });
    // Same OSM object appears both as evacuation center and school:
    const dualUse = record({ osm_id: 100, name: 'NCR School (evac)' });

    const { collections, warnings } = buildFacilityCollections({
      evacuation: [dualUse],
      school: [ncrSchool, davaoSchool, badCoords],
    });

    // evacuation.json is processed first, so it wins the duplicate.
    expect(collections.evacuation.features).toHaveLength(1);
    expect(collections.evacuation.features[0]!.properties.name).toBe('NCR School (evac)');
    expect(collections.school.features).toHaveLength(1);
    expect(collections.school.features[0]!.properties.name).toBe('Davao School');
    expect(warnings.duplicatesDropped).toHaveLength(1);
    expect(warnings.duplicatesDropped[0]).toContain('NCR School');
    expect(warnings.malformedCoordinates).toHaveLength(1);
    expect(warnings.malformedCoordinates[0]).toContain('Broken');
  });

  it('does NOT merge different osm types sharing a numeric id', () => {
    const a = record({ osm_type: 'node', osm_id: 7, name: 'Node 7' });
    const b = record({ osm_type: 'way', osm_id: 7, name: 'Way 7' });
    const { collections, warnings } = buildFacilityCollections({
      hospital: [a, b],
    });
    expect(collections.hospital.features).toHaveLength(2);
    expect(warnings.duplicatesDropped).toHaveLength(0);
  });

  it('emits null (never undefined) for absent optional fields', () => {
    const bare = record({
      osm_id: 200,
      name: undefined,
      display_name: undefined,
      extratags: null,
    });
    const { collections } = buildFacilityCollections({ gymnasium: [bare] });
    const props = collections.gymnasium.features[0]!.properties;
    expect(props.name).toBeNull();
    expect(props.address).toBeNull();
    expect(props.capacity).toBeNull();
    expect(props.hazardTypes).toBeNull();
  });

  it('parses capacity and semicolon-separated hazard types from extratags', () => {
    const rich = record({
      osm_id: 201,
      extratags: {
        'capacity:persons': '100-250',
        'emergency:hazard_type': 'flood;earthquake;landslide',
      },
    });
    const { collections } = buildFacilityCollections({ evacuation: [rich] });
    const props = collections.evacuation.features[0]!.properties;
    expect(props.capacity).toBe('100-250');
    expect(props.hazardTypes).toEqual(['flood', 'earthquake', 'landslide']);
  });

  it('always returns all six layers, empty when no input', () => {
    const { collections } = buildFacilityCollections({});
    expect(Object.keys(collections).sort()).toEqual(
      ['covered_court', 'evacuation', 'gymnasium', 'hospital', 'multi_purpose', 'school'].sort(),
    );
    expect(collections.covered_court.features).toEqual([]);
  });
});
