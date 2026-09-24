import fs from 'node:fs';

const schoolCsv = 'data-sources/facility-bulk-review-20260924/mext-school-code-west-2026-05-01.csv';
const universityCsv = 'data-sources/facility-bulk-review-20260924/mext-university-code-west-2026-05-01.csv';
const boundaryPath = 'data-sources/prefecture-directed-20260915/municipal-boundaries.geojson';
const dataPath = 'public/data/shopping.geojson';
const outputPath = 'data-sources/facility-bulk-review-20260924/mext-school-candidates.json';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readOfficial(path) {
  const rows = parseCsv(fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const headerIndex = rows.findIndex(row => row[0] === '学校コード');
  if (headerIndex < 0) throw new Error(`School-code header missing: ${path}`);
  const header = rows[headerIndex];
  return rows.slice(headerIndex + 1).filter(row => row.length >= header.length).map(row => {
    const record = Object.fromEntries(header.map((key, i) => [key.replace(/\s/g, ''), (row[i] ?? '').trim()]));
    return record;
  }).filter(record => (record['都道府県番号'] ?? '').startsWith('35'));
}

const official = [
  ...readOfficial(schoolCsv).map(row => ({ ...row, source_file: schoolCsv })),
  ...readOfficial(universityCsv).map(row => ({ ...row, source_file: universityCsv })),
].filter(row => !row['属性情報廃止年月日'] && row['本分校'] !== '9(廃)');

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}
function institutionCore(value) {
  return normalize(value)
    .replace(/^(?:[^市町村区]{1,8}[市町村区]立|[市町村区]立)/, '')
    .replace(/^(?:学校法人|国立大学法人)/, '');
}

const boundaries = JSON.parse(fs.readFileSync(boundaryPath, 'utf8')).features
  .filter(feature => feature.properties?.N03_001 === '山口県')
  .flatMap(feature => {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    return polygons.map(rings => {
      const outer = rings[0];
      return {
        city: feature.properties.N03_004,
        rings,
        bbox: [
          Math.min(...outer.map(([x]) => x)), Math.min(...outer.map(([, y]) => y)),
          Math.max(...outer.map(([x]) => x)), Math.max(...outer.map(([, y]) => y)),
        ],
      };
    });
  });
const knownCities = [...new Set(boundaries.map(boundary => boundary.city))]
  .sort((a, b) => b.length - a.length);

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function boundaryCity(point) {
  if (!point) return null;
  const cities = new Set();
  for (const boundary of boundaries) {
    const [minX, minY, maxX, maxY] = boundary.bbox;
    if (point[0] < minX || point[0] > maxX || point[1] < minY || point[1] > maxY) continue;
    if (pointInRing(point, boundary.rings[0]) && !boundary.rings.slice(1).some(hole => pointInRing(point, hole))) {
      cities.add(boundary.city);
    }
  }
  return cities.size === 1 ? [...cities][0] : null;
}

function polygonCentroid(ring) {
  let area6 = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    area6 += cross;
    x += (ring[j][0] + ring[i][0]) * cross;
    y += (ring[j][1] + ring[i][1]) * cross;
  }
  return Math.abs(area6) < 1e-12 ? ring[0] : [x / (3 * area6), y / (3 * area6)];
}

function featureAnchor(geometry) {
  if (geometry?.type === 'Point') return geometry.coordinates;
  if (geometry?.type !== 'MultiPolygon' && geometry?.type !== 'Polygon') return null;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const largest = polygons.reduce((best, polygon) => polygon[0].length > (best?.[0]?.length ?? 0) ? polygon : best, null);
  if (!largest?.[0]?.length) return null;
  const centroid = polygonCentroid(largest[0]);
  return pointInRing(centroid, largest[0]) ? centroid : largest[0][0];
}

function cityFromText(...values) {
  const text = values.filter(Boolean).join(' ');
  return knownCities.find(city => text.includes(city)) ?? null;
}

const geojson = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const features = geojson.features.filter(f => ['school', 'college'].includes(f.properties?.category));
const candidates = features.map(feature => {
  const p = feature.properties;
  const exact = official.filter(row => normalize(row['学校名']) === normalize(p.name));
  const core = institutionCore(p.name);
  const loose = exact.length ? [] : official.filter(row => institutionCore(row['学校名']) === core);
  const matches = exact.length ? exact : loose;
  const matchType = exact.length === 1 ? 'exact_unique_name' : exact.length > 1 ? 'exact_name_multiple_official_rows' : loose.length === 1 ? 'unique_school_name_core' : loose.length > 1 ? 'school_name_core_multiple_official_rows' : 'no_name_match';
  const anchor = featureAnchor(feature.geometry);
  const geometryCity = boundaryCity(anchor);
  const storedCity = cityFromText(p.city, p.address, p.official_address);
  const featureCity = geometryCity ?? storedCity;
  const candidateCities = [...new Set(matches.map(row => cityFromText(row['学校所在地'])).filter(Boolean))];
  const locationRelation = matches.length === 0 ? 'no_name_candidate'
    : candidateCities.length === 0 || !featureCity ? 'municipality_unresolved'
      : candidateCities.length > 1 ? 'multiple_official_municipalities'
        : candidateCities[0] === featureCity ? 'same_municipality'
          : 'municipality_mismatch';
  return {
    feature_id: feature.id,
    feature_name: p.name,
    app_category: p.category,
    feature_coordinates: anchor,
    feature_municipality: featureCity,
    municipality_source: geometryCity ? 'MLIT N03-2026-01-01 point-in-polygon' : storedCity ? 'existing feature properties' : null,
    match_type: matchType,
    location_relation: locationRelation,
    official_matches: matches.map(row => ({
      school_code: row['学校コード'],
      school_type: row['学校種'],
      official_name: row['学校名'],
      official_address: row['学校所在地'],
      postal_code: row['郵便番号'],
      branch_status: row['本分校'],
      retired_date: row['属性情報廃止年月日'],
      source_file: row.source_file,
    })),
    note: 'Candidate association only: MEXT rows do not contain this OSM feature ID or its coordinates. Do not update or merge without checking the official location against the original feature.'
  };
});

const counts = Object.fromEntries(['exact_unique_name','exact_name_multiple_official_rows','unique_school_name_core','school_name_core_multiple_official_rows','no_name_match'].map(type => [type, candidates.filter(c => c.match_type === type).length]));
const result = {
  audited_at: '2026-09-24',
  official_snapshot: 'MEXT school code list as of 2026-05-01 (provisional); the downloaded CSV header shows 2026-05-20',
  official_active_yamaguchi_rows: official.length,
  official_school_csv_active_yamaguchi_rows: official.filter(row => row.source_file === schoolCsv).length,
  official_university_csv_active_yamaguchi_rows: official.filter(row => row.source_file === universityCsv).length,
  municipality_crosscheck_source: 'National Land Numerical Information N03-2026-01-01; used only to infer feature municipality, not exact facility-location correspondence',
  app_features_checked: features.length,
  counts,
  location_relation_counts: Object.fromEntries(['same_municipality','municipality_mismatch','multiple_official_municipalities','municipality_unresolved','no_name_candidate'].map(type => [type, candidates.filter(c => c.location_relation === type).length])),
  match_and_location_counts: Object.fromEntries(['exact_unique_name','unique_school_name_core','school_name_core_multiple_official_rows','no_name_match'].flatMap(matchType => ['same_municipality','municipality_mismatch','multiple_official_municipalities','municipality_unresolved','no_name_candidate'].map(location => [`${matchType}__${location}`, candidates.filter(c => c.match_type === matchType && c.location_relation === location).length]))),
  features: candidates,
  mutation_applied: false
};
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  outputPath,
  officialRows: official.length,
  officialSchoolRows: official.filter(row => row.source_file === schoolCsv).length,
  officialUniversityRows: official.filter(row => row.source_file === universityCsv).length,
  appFeatures: features.length,
  counts,
  locationRelationCounts: result.location_relation_counts,
}));
