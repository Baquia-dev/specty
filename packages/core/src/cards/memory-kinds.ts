// SPDX-License-Identifier: Apache-2.0
import type { MemoryKind } from "../memory/entries";

/** Each kind of memory entry with its article, as a sentence names one entry: Spanish, English. */
export const ONE_OF_KIND: Readonly<Record<MemoryKind, readonly [string, string]>> = {
  pending: ["un pendiente", "a pending item"],
  improvement: ["una mejora", "an improvement"],
  reminder: ["un recordatorio", "a reminder"],
  decision: ["una decisión", "a decision"],
  lesson: ["una lección", "a lesson"],
};
