/**
 * Georeferencing — turn pixel boxes into real-world lon/lat polygons.
 *
 * The core need: a deminer can't act on "a mine at pixel (412, 380)". They can
 * act on a GPS location. If we know how the image maps to the ground, every box
 * corner becomes a real coordinate we can export as GeoJSON and drop onto a map.
 *
 * We model georeference as a north-up bounding box in WGS84 degrees:
 *   { n, s, e, w }  (north/south latitude, east/west longitude)
 * This covers the overwhelming majority of drone orthomosaics and map exports,
 * which are north-up and axis-aligned. Rotated/projected imagery is detected and
 * flagged rather than silently mis-mapped.
 *
 * Pure functions, no DOM — also run under Node for tests.
 */
const Geo = (() => {
  /**
   * Parse an ESRI "world file" (.tfw/.jgw/.pgw/.wld): six numbers, one per line.
   * https://en.wikipedia.org/wiki/World_file
   *   line 1: A  x-scale (lon per pixel-column)
   *   line 2: D  y-skew (rotation)
   *   line 3: B  x-skew (rotation)
   *   line 4: E  y-scale (lat per pixel-row, normally negative)
   *   line 5: C  lon of the CENTER of the upper-left pixel
   *   line 6: F  lat of the CENTER of the upper-left pixel
   * Transform: lon = A*col + B*row + C ; lat = D*col + E*row + F
   */
  function parseWorldFile(text) {
    const nums = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .map(Number);
    if (nums.length < 6 || nums.slice(0, 6).some((n) => !isFinite(n))) {
      throw new Error('A world file must contain 6 numeric lines.');
    }
    const [A, D, B, E, C, F] = nums;
    return { A, B, C, D, E, F };
  }

  /** Convert a world-file affine transform into a north-up bounds box. */
  function worldFileToBounds(wf, imgW, imgH) {
    const lon = (col, row) => wf.A * col + wf.B * row + wf.C;
    const lat = (col, row) => wf.D * col + wf.E * row + wf.F;
    return {
      n: lat(0, 0),
      w: lon(0, 0),
      e: lon(imgW, imgH),
      s: lat(imgW, imgH),
      rotated: wf.B !== 0 || wf.D !== 0,
      projected: Math.abs(wf.C) > 180 || Math.abs(wf.F) > 90,
    };
  }

  /** True if a bounds box looks like valid WGS84 degrees. */
  function isValidBounds(b) {
    return (
      b &&
      [b.n, b.s, b.e, b.w].every((v) => typeof v === 'number' && isFinite(v)) &&
      b.n <= 90 && b.s >= -90 && b.n > b.s &&
      b.e <= 180 && b.w >= -180 && b.e > b.w
    );
  }

  /** Map a pixel (px from left, py from top) to [lon, lat] within a bounds box. */
  function pixelToLonLat(bounds, imgW, imgH, px, py) {
    const lon = bounds.w + (px / imgW) * (bounds.e - bounds.w);
    const lat = bounds.n + (py / imgH) * (bounds.s - bounds.n); // py down => lat down
    return [lon, lat];
  }

  /**
   * A box's four corners as a closed GeoJSON ring, wound counter-clockwise
   * (RFC 7946 right-hand rule for exterior rings). Order: SW, SE, NE, NW, SW.
   */
  function boxRing(bounds, imgW, imgH, box) {
    const P = (px, py) => pixelToLonLat(bounds, imgW, imgH, px, py);
    const sw = P(box.x, box.y + box.h);
    const se = P(box.x + box.w, box.y + box.h);
    const ne = P(box.x + box.w, box.y);
    const nw = P(box.x, box.y);
    return [sw, se, ne, nw, sw];
  }

  /**
   * Build a GeoJSON FeatureCollection from every box on every georeferenced
   * image. `geoByName[filename]` is a bounds box; images without one are skipped.
   */
  function toGeoJSON(images, classes, geoByName) {
    const features = [];
    for (const im of images) {
      const bounds = geoByName[im.name];
      if (!isValidBounds(bounds)) continue;
      for (const box of im.boxes) {
        const cls = classes[box.cls];
        features.push({
          type: 'Feature',
          properties: {
            class: cls ? cls.name : `class_${box.cls}`,
            class_id: box.cls,
            image: im.name,
          },
          geometry: { type: 'Polygon', coordinates: [boxRing(bounds, im.width, im.height, box)] },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }

  return { parseWorldFile, worldFileToBounds, isValidBounds, pixelToLonLat, boxRing, toGeoJSON };
})();

if (typeof module !== 'undefined') module.exports = Geo;
