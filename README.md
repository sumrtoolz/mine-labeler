# 🛰️ MineLabeler

**A free, browser-based tool for labeling aerial imagery to train mine- and
UXO-detection AI for humanitarian demining.**

Load a folder of drone/aerial images, draw boxes around mines and unexploded
ordnance, and export clean training data in **YOLO** or **COCO** format. Runs
entirely in your browser — no upload, no server, no account. Your images never
leave your computer.

**[Open the labeler →](https://sumrtoolz.github.io/mine-labeler/)**

## Why this exists

Ukraine is now the most heavily mined country on earth. The bottleneck in
AI-assisted demining isn't the models — it's **labeled training data**. The
[UNDP's demining-AI programme](https://www.undp.org/ukraine/press-releases/ai-demining-ukrainian-innovators-train-algorithms-detect-explosives-drone-images)
and groups like the HALO Trust need large sets of aerial images with mines and
UXO marked by humans before a detector can learn to find them.

Most annotation tools are either heavyweight server installs (Label Studio,
CVAT) or commercial (Roboflow). MineLabeler is a single static page a
volunteer can open and start labeling in ten seconds — deliberately small,
deliberately free, deliberately private.

> **Scope:** this is a *humanitarian demining* data tool — it helps find and
> remove explosives so civilians can return to their land. It has nothing to
> do with weapons or targeting.

## Features

- **Draw, edit, delete** bounding boxes on a canvas; click the × handle on any
  box to remove it.
- **Configurable class taxonomy** — ships with a demining-oriented default
  (anti-tank mine, anti-personnel mine, UXO/shell, submunition, suspicious
  object); add or remove classes freely.
- **Autosave** to your browser (`localStorage`), keyed by filename — close the
  tab and your work is still there when you reload and re-open the folder.
- **Filmstrip** with per-image box counts and a labeling progress readout.
- **Keyboard-driven**: `1–9` pick a class, `←/→` (or `A/D`) change image,
  `⌘/Ctrl-Z` or `Backspace` undo the last box.
- **Export YOLO** — a `.zip` (`labels/*.txt`, `classes.txt`, `data.yaml`)
  ready to drop into an Ultralytics YOLO training run.
- **Export / import COCO** — a single JSON, so a team can pass partially-labeled
  sets between volunteers.
- **Georeference + Export GeoJSON** — give an image its real-world bounds (type
  N/S/E/W, or load an ESRI world file) and every box becomes a true lon/lat
  polygon. The exported `.geojson` drops straight onto a map — turning "a mine
  at pixel (412, 380)" into a GPS location a deminer can actually walk to.

## The formats — worth understanding

### YOLO
One `.txt` per image; each line is one box:

```
class_id  x_center  y_center  width  height
```

All four numbers are **normalized to 0–1** (fractions of image size), and the
position is the box **center**, not a corner. So a 100×50 box at pixel (200,100)
in a 1000×500 image becomes `2 0.250000 0.250000 0.100000 0.100000`.
Spec: [Ultralytics dataset format](https://docs.ultralytics.com/datasets/detect/).

### COCO
A single JSON with `images`, `annotations`, and `categories`. Here `bbox` is
`[x, y, width, height]` in **absolute pixels** from the top-left corner — a
different convention from YOLO, which is exactly the kind of detail this tool
gets right for you. Spec: [cocodataset.org](https://cocodataset.org/#format-data).

### GeoJSON — from pixels to GPS
A box on its own lives in *pixel* space, which is useless in the field. If the
image is georeferenced, MineLabeler maps each box corner to WGS84 lon/lat and
exports a [GeoJSON](https://geojson.org/) `FeatureCollection` of polygons — the
format every mapping tool (QGIS, Leaflet, geojson.io) reads directly. You supply
the georeference two ways:

- **Bounds** — north/south latitude and east/west longitude, in decimal degrees.
- **World file** — the six-line `.tfw`/`.wld` sidecar drone software emits; we
  parse its affine transform. Projected (UTM-metre) world files are detected and
  flagged, since GeoJSON requires lon/lat.

Assumes north-up, axis-aligned imagery (true of almost all orthomosaics). The
math is in `js/geo.js` and is fully unit-tested.

### Bonus: a dependency-free ZIP writer
`js/zip.js` builds the YOLO `.zip` from scratch — local file headers, a central
directory, and a CRC-32 per entry — with **no libraries**. It's ~120 lines and
a compact worked example of the [ZIP format](https://en.wikipedia.org/wiki/ZIP_(file_format)).
The tests check the CRC-32 against known vectors, and CI-style we verify the
output opens with the real `unzip` tool.

## Run locally

No build, no npm install:

```bash
git clone https://github.com/sumrtoolz/mine-labeler
cd mine-labeler
python3 -m http.server 8000
# open http://localhost:8000
```

Run the tests (pure Node, no packages):

```bash
node test/exporters.test.js
node test/geo.test.js
```

## Structure

```
index.html            layout
css/style.css         dark UI
js/zip.js             dependency-free STORE-method ZIP writer + CRC32
js/exporters.js       YOLO + COCO conversion (pure, tested)
js/geo.js             georeferencing: pixel→lon/lat, world files, GeoJSON (pure, tested)
js/store.js           localStorage autosave (annotations only, never images)
js/labeler.js         canvas: render image + boxes, draw/edit interactions
js/app.js             wiring: loading, palette, filmstrip, nav, geo, export
test/exporters.test.js  YOLO/COCO/CRC32/ZIP unit tests
test/geo.test.js        georeferencing + GeoJSON unit tests
```

`js/zip.js` and `js/exporters.js` are pure and run under both the browser and
Node — which is what makes the export logic testable without a browser.

## Getting it to people who need it

Building it is step one; reaching deminers is step two. The real channels are
vetted organizations — [Defense Tech for Ukraine](https://defensetechforukraine.org/volunteer/programming-for-ukraine/)
matches programmers to humanitarian teams, and the UNDP Ukraine demining
programme and HALO Trust work with technical volunteers. This repo is meant as
an open contribution they can pick up, fork, or point volunteers to.

## Limitations & honesty

- Bounding boxes only (no polygons/segmentation yet).
- Annotations persist per-browser; there's no cloud sync — export regularly to
  share or back up.
- The default class taxonomy is a starting point, not doctrine; real labeling
  campaigns should agree a taxonomy with the demining organization first.

## License

MIT — use it, fork it, adapt it for any humanitarian demining effort.
