// SPDX-License-Identifier: Apache-2.0
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export type Sha256Hash = `sha256:${string}`;

export function hashText(text: string): Sha256Hash {
  return `sha256:${bytesToHex(sha256(utf8ToBytes(text)))}`;
}

/** Short form used in commit trailers: `sha256:4be1c2d…` → `4be1c2d`. */
export function shortHash(hash: string, length = 7): string {
  return hash.replace(/^sha256:/, "").slice(0, length);
}
