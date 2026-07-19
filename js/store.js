/**
 * Persistence. Images themselves are NEVER stored (they stay on the user's
 * disk and are re-selected each session) — we only persist the annotations,
 * keyed by filename, plus the class list. On reload, when the user re-picks
 * the same folder, boxes reattach to images by name.
 */
const Store = (() => {
  const KEY = 'minelabeler.v1';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not autosave (storage full?):', e);
    }
  }

  // data = { classes: [{name,color}], boxes: {[file]: [box]}, geo: {[file]: bounds} }
  function read() {
    const d = load();
    return { classes: d.classes || null, boxes: d.boxes || {}, geo: d.geo || {} };
  }

  function writeGeo(filename, bounds) {
    const d = load();
    d.geo = d.geo || {};
    if (bounds) d.geo[filename] = bounds;
    else delete d.geo[filename];
    save(d);
  }

  function writeBoxes(filename, boxes) {
    const d = load();
    d.boxes = d.boxes || {};
    if (boxes.length) d.boxes[filename] = boxes;
    else delete d.boxes[filename];
    save(d);
  }

  function writeClasses(classes) {
    const d = load();
    d.classes = classes;
    save(d);
  }

  function mergeBoxes(byName) {
    const d = load();
    d.boxes = Object.assign(d.boxes || {}, byName);
    save(d);
  }

  return { read, writeBoxes, writeClasses, mergeBoxes, writeGeo };
})();
