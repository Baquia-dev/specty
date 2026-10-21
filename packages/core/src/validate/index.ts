// SPDX-License-Identifier: Apache-2.0
import type { Diagnostic } from "../spec/diagnostics";
import type { Spec } from "../spec/model";
import type { Rule, ValidationContext } from "./context";
import { checkAdjusting, checkClosing, checkIdReuse } from "./phase";
import { checkCriteria, checkFileReasons, checkSplit, checkTaskQuality } from "./quality";
import { checkCoverage, checkSlices, checkTasks } from "./references";
import { checkQuickLane, checkSections, checkSpikeClosing } from "./structure";

export type { ProposePhase, ValidationContext } from "./context";

const RULES: readonly Rule[] = [
  checkSections,
  checkSpikeClosing,
  checkQuickLane,
  checkTasks,
  checkCoverage,
  checkSlices,
  checkCriteria,
  checkTaskQuality,
  checkFileReasons,
  checkSplit,
  checkAdjusting,
  checkClosing,
  checkIdReuse,
];

/** Semantic rules from docs/formats.md §2. Messages use the spec's language. */
export function validateSpec(spec: Spec, ctx: ValidationContext): readonly Diagnostic[] {
  return RULES.flatMap((rule) => rule(spec, ctx, spec.language));
}
