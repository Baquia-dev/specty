// SPDX-License-Identifier: Apache-2.0
import { zip } from "./zip";

interface Read {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly time: number;
  readonly date: number;
  readonly content: string;
}

/** Reads an archive back through its central directory, as an unzip tool does. */
function unzip(bytes: Uint8Array): Read[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: Read[] = [];
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    entries.push({
      name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)),
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      crc: view.getUint32(at + 16, true),
      time: view.getUint16(at + 12, true),
      date: view.getUint16(at + 14, true),
      content: decoder.decode(bytes.subarray(start, start + size)),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}

describe("zip", () => {
  it("AC2: stores each file with its path, its content and its CRC, readable by any unzip", () => {
    const when = new Date(2026, 9, 29, 10, 30, 0);
    const entries = unzip(
      zip(
        [
          { path: "hola.txt", content: "hello" },
          { path: "carpeta/ñandú.md", content: "# Ñandú\n" },
        ],
        when,
      ),
    );
    expect(entries.map(({ name, content }) => ({ name, content }))).toEqual([
      { name: "hola.txt", content: "hello" },
      { name: "carpeta/ñandú.md", content: "# Ñandú\n" },
    ]);
    // Stored, without compression, and with the names in UTF-8.
    for (const entry of entries) {
      expect(entry.method).toBe(0);
      expect(entry.flags & 0x0800).toBe(0x0800);
      // 2026-10-29 10:30:00 in MS-DOS format.
      expect(entry.date).toBe(((2026 - 1980) << 9) | (10 << 5) | 29);
      expect(entry.time).toBe((10 << 11) | (30 << 5));
    }
    expect(entries[0]?.crc).toBe(0x3610a686);
  });

  it("AC2: writes an empty archive without files", () => {
    expect(unzip(zip([]))).toEqual([]);
  });
});
