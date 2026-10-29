// SPDX-License-Identifier: Apache-2.0
// A ZIP archive the browser writes with no library: each file stored as it is, without
// compression, which any unzip tool reads (the part of PKWARE's APPNOTE an export needs).

/** A file of the archive: its path inside it and its text. */
export interface ZipEntry {
  readonly path: string;
  readonly content: string;
}

interface Packed {
  readonly name: Uint8Array;
  readonly data: Uint8Array;
  readonly crc: number;
}

/** A time as MS-DOS keeps it: the time and the day, two bytes each, in local time. */
interface DosTime {
  readonly time: number;
  readonly day: number;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** Bit 11 of the flags: the names are UTF-8. */
const UTF8 = 0x0800;
/** 2.0, the version that reads a stored file. */
const VERSION = 20;
const LOCAL_SIZE = 30;
const CENTRAL_SIZE = 46;
const END_SIZE = 22;

/** The archive of `entries`, each dated `date`. */
export function zip(
  entries: readonly ZipEntry[],
  date: Date = new Date(),
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const files: Packed[] = entries.map((entry) => {
    const data = encoder.encode(entry.content);
    return { name: encoder.encode(entry.path), data, crc: crc32(data) };
  });
  const size = files.reduce(
    (total, file) => total + LOCAL_SIZE + CENTRAL_SIZE + 2 * file.name.length + file.data.length,
    END_SIZE,
  );
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const when = dosTime(date);
  const offsets: number[] = [];
  let at = 0;
  for (const file of files) {
    offsets.push(at);
    at = writeLocal(bytes, view, at, file, when);
  }
  const directory = at;
  files.forEach((file, index) => {
    at = writeCentral(bytes, view, at, file, when, offsets[index] ?? 0);
  });
  view.setUint32(at, END, true);
  view.setUint16(at + 8, files.length, true);
  view.setUint16(at + 10, files.length, true);
  view.setUint32(at + 12, at - directory, true);
  view.setUint32(at + 16, directory, true);
  return bytes;
}

/** The local header of a file, then its name and its data; returns where the next one starts. */
function writeLocal(bytes: Uint8Array, view: DataView, at: number, file: Packed, when: DosTime) {
  view.setUint32(at, LOCAL, true);
  view.setUint16(at + 4, VERSION, true);
  view.setUint16(at + 6, UTF8, true);
  // At 8, the method: 0, stored.
  view.setUint16(at + 10, when.time, true);
  view.setUint16(at + 12, when.day, true);
  view.setUint32(at + 14, file.crc, true);
  view.setUint32(at + 18, file.data.length, true);
  view.setUint32(at + 22, file.data.length, true);
  view.setUint16(at + 26, file.name.length, true);
  bytes.set(file.name, at + LOCAL_SIZE);
  bytes.set(file.data, at + LOCAL_SIZE + file.name.length);
  return at + LOCAL_SIZE + file.name.length + file.data.length;
}

/** The file's entry in the central directory, which points to its local header. */
function writeCentral(
  bytes: Uint8Array,
  view: DataView,
  at: number,
  file: Packed,
  when: DosTime,
  offset: number,
) {
  view.setUint32(at, CENTRAL, true);
  view.setUint16(at + 4, VERSION, true);
  view.setUint16(at + 6, VERSION, true);
  view.setUint16(at + 8, UTF8, true);
  view.setUint16(at + 12, when.time, true);
  view.setUint16(at + 14, when.day, true);
  view.setUint32(at + 16, file.crc, true);
  view.setUint32(at + 20, file.data.length, true);
  view.setUint32(at + 24, file.data.length, true);
  view.setUint16(at + 28, file.name.length, true);
  view.setUint32(at + 42, offset, true);
  bytes.set(file.name, at + CENTRAL_SIZE);
  return at + CENTRAL_SIZE + file.name.length;
}

function dosTime(date: Date): DosTime {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day:
      (Math.max(date.getFullYear() - 1980, 0) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** CRC-32 (IEEE 802.3), the checksum ZIP keeps for each file. */
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
