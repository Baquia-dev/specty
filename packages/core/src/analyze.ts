// SPDX-License-Identifier: Apache-2.0
import { computeSize, type SizeResult } from "./sizing/size";
import { type CanonicalResult, canonicalize } from "./spec/canonical";
import { type Diagnostic, hasErrors } from "./spec/diagnostics";
import type { ParseOptions } from "./spec/parse";
import { type ValidationContext, validateSpec } from "./validate";

export interface Analysis extends CanonicalResult {
  readonly size: SizeResult;
  /** Parse and validation diagnostics, errors first. */
  readonly diagnostics: readonly Diagnostic[];
  readonly valid: boolean;
}

/** Everything `propose` needs: canonical text, hash, size and diagnostics. */
export function analyzeSpec(
  text: string,
  ctx: Omit<ValidationContext, "locations">,
  options: ParseOptions = {},
): Analysis {
  const canonical = canonicalize(text, options);
  const validation = validateSpec(canonical.spec, { ...ctx, locations: canonical.locations });
  const diagnostics = [...canonical.diagnostics, ...validation].toSorted(
    (a, b) => Number(a.severity === "warning") - Number(b.severity === "warning"),
  );
  return {
    ...canonical,
    size: computeSize(canonical.spec, ctx.config, ctx.repo),
    diagnostics,
    valid: !hasErrors(diagnostics),
  };
}
