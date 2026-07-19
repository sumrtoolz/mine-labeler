/** Tests for the georeferencing math. Run: node test/geo.test.js */
const Geo = require('../js/geo.js');

let failures = 0;
function assert(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { console.error(`FAIL  ${name} ${detail}`); failures++; }
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- pixelToLonLat ------------------------------------------------------------
// A 1°×1° tile: west=0 east=1 (lon), south=0 north=1 (lat), 1000×1000 px.
const B = { n: 1, s: 0, e: 1, w: 0 };
assert('top-left pixel -> (west, north)', JSON.stringify(Geo.pixelToLonLat(B, 1000, 1000, 0, 0)) === '[0,1]');
assert('bottom-right pixel -> (east, south)', JSON.stringify(Geo.pixelToLonLat(B, 1000, 1000, 1000, 1000)) === '[1,0]');
const mid = Geo.pixelToLonLat(B, 1000, 1000, 500, 500);
assert('centre pixel -> (0.5, 0.5)', close(mid[0], 0.5) && close(mid[1], 0.5), JSON.stringify(mid));

// --- boxRing (closed, CCW: SW,SE,NE,NW,SW) -----------------------------------
const ring = Geo.boxRing(B, 1000, 1000, { x: 0, y: 0, w: 1000, h: 1000, cls: 0 });
assert('ring has 5 points (closed)', ring.length === 5);
assert('ring first == last (closed)', JSON.stringify(ring[0]) === JSON.stringify(ring[4]));
assert('ring winds SW,SE,NE,NW',
  JSON.stringify(ring) === JSON.stringify([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]),
  JSON.stringify(ring));

// A smaller box maps proportionally: pixels (250,250)-(750,750) -> lon/lat 0.25–0.75
const ring2 = Geo.boxRing(B, 1000, 1000, { x: 250, y: 250, w: 500, h: 500, cls: 0 });
assert('sub-box NE corner is (0.75, 0.75)', close(ring2[2][0], 0.75) && close(ring2[2][1], 0.75), JSON.stringify(ring2[2]));

// --- isValidBounds -----------------------------------------------------------
assert('valid bounds accepted', Geo.isValidBounds(B) === true);
assert('north<=south rejected', Geo.isValidBounds({ n: 0, s: 1, e: 1, w: 0 }) === false);
assert('out-of-range lat rejected', Geo.isValidBounds({ n: 95, s: 0, e: 1, w: 0 }) === false);
assert('missing field rejected', Geo.isValidBounds({ n: 1, s: 0, e: 1 }) === false);

// --- world file --------------------------------------------------------------
// Geographic world file: 0.001°/px, origin lon 24.0 lat 59.1, north-up.
const wf = Geo.parseWorldFile('0.001\n0\n0\n-0.001\n24.0\n59.1');
assert('world file parses A (x-scale)', close(wf.A, 0.001));
assert('world file parses E (y-scale, negative)', close(wf.E, -0.001));
assert('world file parses C (origin lon)', close(wf.C, 24.0));
assert('world file rejects short input', (() => { try { Geo.parseWorldFile('1\n2\n3'); return false; } catch { return true; } })());

const wb = Geo.worldFileToBounds(wf, 1000, 1000);
assert('worldFileToBounds north = origin lat', close(wb.n, 59.1));
assert('worldFileToBounds west = origin lon', close(wb.w, 24.0));
assert('worldFileToBounds east = origin + 1000*scale', close(wb.e, 25.0), '' + wb.e);
assert('worldFileToBounds south = origin - 1000*scale', close(wb.s, 58.1), '' + wb.s);
assert('geographic world file not flagged projected', wb.projected === false);

// Projected (UTM metres) world file should be flagged.
const wfUtm = Geo.worldFileToBounds(Geo.parseWorldFile('0.3\n0\n0\n-0.3\n500000\n6600000'), 1000, 1000);
assert('UTM world file flagged as projected', wfUtm.projected === true);

// --- toGeoJSON ----------------------------------------------------------------
const images = [
  { name: 'ortho.jpg', width: 1000, height: 1000, boxes: [{ x: 0, y: 0, w: 500, h: 500, cls: 0 }] },
  { name: 'no_geo.jpg', width: 800, height: 600, boxes: [{ x: 0, y: 0, w: 10, h: 10, cls: 1 }] },
];
const classes = [{ name: 'anti-tank mine' }, { name: 'UXO' }];
const geoByName = { 'ortho.jpg': B }; // only the first is georeferenced
const fc = Geo.toGeoJSON(images, classes, geoByName);
assert('FeatureCollection type', fc.type === 'FeatureCollection');
assert('only georeferenced image is exported', fc.features.length === 1);
assert('geometry is a Polygon', fc.features[0].geometry.type === 'Polygon');
assert('polygon ring is closed', (() => { const r = fc.features[0].geometry.coordinates[0]; return JSON.stringify(r[0]) === JSON.stringify(r[r.length - 1]); })());
assert('feature carries class name + image', fc.features[0].properties.class === 'anti-tank mine' && fc.features[0].properties.image === 'ortho.jpg');
assert('coordinates are [lon, lat] within tile', (() => { const p = fc.features[0].geometry.coordinates[0][0]; return p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1; })());

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
