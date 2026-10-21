// SPDX-License-Identifier: Apache-2.0
import { matchesAny } from "../glob";
import { normalizePath } from "../paths";
import type { ResolvedConfig } from "../schema/config";

/** Specty's own directory is never governed: specs are written there before any approval. */
const SPECTY_DIR = ".specty";

/** True when changes to the path require an approved spec. */
export function isGoverned(
  path: string,
  config: Pick<ResolvedConfig, "governed" | "ignored">,
): boolean {
  const normalized = normalizePath(path);
  if (normalized === SPECTY_DIR || normalized.startsWith(`${SPECTY_DIR}/`)) return false;
  return matchesAny(normalized, config.governed) && !matchesAny(normalized, config.ignored);
}
