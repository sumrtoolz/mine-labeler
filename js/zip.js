/**
 * Minimal ZIP writer — "store" method (no compression), pure JS, no deps.
 *
 * A .zip is just: [local header + file data] per entry, then a "central
 * directory" listing all entries, then an "end of central directory" record.
 * We only need STORE (compression method 0), which lets us skip DEFLATE
 * entirely — text label files are tiny, so compression buys nothing here.
 * Spec: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 *
 * Exposed as `Zip.build([{name, text}]) -> Blob`. Also usable in Node for
 * tests (CRC32 is verified against known vectors there).
 */
const Zip = (() => {
  // CRC-32 (IEEE 802.3), lazily-built lookup table.
  let table = null;
  function crcTable() {
    if (table) return table;
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  }
  function crc32(bytes) {
    const t = crcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  const enc = (s) =>
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(s)
      : Uint8Array.from(Buffer.from(s, 'utf8'));

  // Little-endian writers into a growing byte array.
  function pushU16(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff); }
  function pushU32(arr, v) { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); }
  function pushBytes(arr, bytes) { for (let i = 0; i < bytes.length; i++) arr.push(bytes[i]); }

  /** files: [{name: string, text: string}] -> Uint8Array (the full zip). */
  function bytes(files) {
    const out = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc(f.name);
      const data = enc(f.text);
      const crc = crc32(data);

      // Local file header (signature 0x04034b50)
      const local = [];
      pushU32(local, 0x04034b50);
      pushU16(local, 20);      // version needed
      pushU16(local, 0);       // flags
      pushU16(local, 0);       // method 0 = store
      pushU16(local, 0);       // mod time
      pushU16(local, 0x21);    // mod date (1980-01-01)
      pushU32(local, crc);
      pushU32(local, data.length); // compressed size
      pushU32(local, data.length); // uncompressed size
      pushU16(local, nameBytes.length);
      pushU16(local, 0);       // extra len
      pushBytes(local, nameBytes);
      pushBytes(local, data);

      // Central directory header (signature 0x02014b50)
      pushU32(central, 0x02014b50);
      pushU16(central, 20);    // version made by
      pushU16(central, 20);    // version needed
      pushU16(central, 0);     // flags
      pushU16(central, 0);     // method
      pushU16(central, 0);     // time
      pushU16(central, 0x21);  // date
      pushU32(central, crc);
      pushU32(central, data.length);
      pushU32(central, data.length);
      pushU16(central, nameBytes.length);
      pushU16(central, 0);     // extra
      pushU16(central, 0);     // comment
      pushU16(central, 0);     // disk number
      pushU16(central, 0);     // internal attrs
      pushU32(central, 0);     // external attrs
      pushU32(central, offset); // offset of local header
      pushBytes(central, nameBytes);

      pushBytes(out, local);
      offset += local.length;
    }

    const centralStart = offset;
    pushBytes(out, central);

    // End of central directory (signature 0x06054b50)
    pushU32(out, 0x06054b50);
    pushU16(out, 0);                 // this disk
    pushU16(out, 0);                 // disk with CD
    pushU16(out, files.length);      // entries this disk
    pushU16(out, files.length);      // total entries
    pushU32(out, central.length);    // CD size
    pushU32(out, centralStart);      // CD offset
    pushU16(out, 0);                 // comment len

    return Uint8Array.from(out);
  }

  function build(files) {
    return new Blob([bytes(files)], { type: 'application/zip' });
  }

  return { build, bytes, crc32 };
})();

if (typeof module !== 'undefined') module.exports = Zip;
