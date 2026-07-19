/** Tests for the pure export/zip logic. Run: node test/exporters.test.js */
const Exporters = require('../js/exporters.js');
const Zip = require('../js/zip.js');

let failures = 0;
function assert(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { console.error(`FAIL  ${name} ${detail}`); failures++; }
}

// --- YOLO normalization ------------------------------------------------------
// 100x50 box at (200,100) in a 1000x500 image.
// center = (250,125) -> normalized (0.25, 0.25); size -> (0.1, 0.1)
const line = Exporters.yoloLine({ x: 200, y: 100, w: 100, h: 50, cls: 2 }, 1000, 500);
assert('YOLO line has class + 4 normalized numbers', line === '2 0.250000 0.250000 0.100000 0.100000', `got "${line}"`);

// Full-image box normalizes to center 0.5 and size 1.0
const full = Exporters.yoloLine({ x: 0, y: 0, w: 640, h: 640, cls: 0 }, 640, 640);
assert('full-image box -> 0.5 0.5 1 1', full === '0 0.500000 0.500000 1.000000 1.000000', `got "${full}"`);

// --- YOLO bundle -------------------------------------------------------------
const images = [
  { name: 'field_01.jpg', width: 800, height: 600, boxes: [{ x: 10, y: 20, w: 40, h: 30, cls: 0 }] },
  { name: 'field_02.png', width: 800, height: 600, boxes: [] }, // no boxes -> skipped
];
const classes = [{ name: 'anti-tank mine' }, { name: 'UXO' }];
const files = Exporters.yoloFiles(images, classes);
const names = files.map((f) => f.name);
assert('labeled image gets a labels/*.txt', names.includes('labels/field_01.jpg'.replace('.jpg', '') + '.txt') || names.includes('labels/field_01.txt'));
assert('unlabeled image is skipped', !names.some((n) => n.includes('field_02')));
assert('bundle includes classes.txt', names.includes('classes.txt'));
assert('bundle includes data.yaml', names.includes('data.yaml'));
assert('classes.txt lists class names', files.find((f) => f.name === 'classes.txt').text === 'anti-tank mine\nUXO');

// --- COCO round-trip ---------------------------------------------------------
const coco = Exporters.coco(images, classes);
assert('COCO has one image entry per input image', coco.images.length === 2);
assert('COCO bbox is absolute pixel [x,y,w,h]', JSON.stringify(coco.annotations[0].bbox) === '[10,20,40,30]');
assert('COCO area = w*h', coco.annotations[0].area === 1200);

const back = Exporters.parseCoco(coco);
assert('parseCoco recovers class names', JSON.stringify(back.classes) === JSON.stringify(['anti-tank mine', 'UXO']));
assert('parseCoco recovers the box by filename',
  JSON.stringify(back.byName['field_01.jpg']) === JSON.stringify([{ x: 10, y: 20, w: 40, h: 30, cls: 0 }]));

// --- CRC32 known vectors -----------------------------------------------------
const enc = (s) => Uint8Array.from(Buffer.from(s, 'utf8'));
assert('CRC32("") = 0', Zip.crc32(enc('')) === 0);
// Well-known: CRC32 of "123456789" = 0xCBF43926
assert('CRC32("123456789") = 0xCBF43926', Zip.crc32(enc('123456789')) === 0xcbf43926,
  '0x' + Zip.crc32(enc('123456789')).toString(16));
// Well-known: CRC32 of "The quick brown fox jumps over the lazy dog" = 0x414FA339
assert('CRC32(quick brown fox) = 0x414FA339',
  Zip.crc32(enc('The quick brown fox jumps over the lazy dog')) === 0x414fa339);

// --- ZIP structure -----------------------------------------------------------
const zipBytes = Zip.bytes([{ name: 'a.txt', text: 'hello' }]);
assert('zip starts with local file header signature PK\\x03\\x04',
  zipBytes[0] === 0x50 && zipBytes[1] === 0x4b && zipBytes[2] === 0x03 && zipBytes[3] === 0x04);
// End-of-central-directory signature 0x06054b50 appears near the end.
const tail = zipBytes.slice(-22);
assert('zip ends with EOCD signature PK\\x05\\x06',
  tail[0] === 0x50 && tail[1] === 0x4b && tail[2] === 0x05 && tail[3] === 0x06);

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
