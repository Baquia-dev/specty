// SPDX-License-Identifier: Apache-2.0
// Public API of Specty's exporters: pure functions from core's spec model to other formats'
// files (ARCHITECTURE §2, formats.md §10). They write nothing: the CLI does.
import type { Spec } from "@baquia-dev/specty-core";
import { kiro } from "./kiro";
import { openSpec } from "./openspec";
import type { ExportContext, ExportedFile } from "./parts";
import { specKit } from "./speckit";

export { exportContextOf } from "./context";
export { type OpenSpecFiles, parseOpenSpec } from "./import-openspec";
export type { ExportContext, ExportedFile } from "./parts";
export { type Scenario, scenarioOf } from "./scenario";

/** OpenSpec, GitHub Spec Kit and Kiro. */
export const EXPORT_FORMATS = ["openspec", "speckit", "kiro"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The files of `spec` in `format`, with paths relative to the folder the export goes to. */
export function exportSpec(
  spec: Spec,
  format: ExportFormat,
  context: ExportContext,
): readonly ExportedFile[] {
  switch (format) {
    case "openspec":
      return openSpec(spec, context);
    case "speckit":
      return specKit(spec, context);
    case "kiro":
      return kiro(spec, context);
  }
}
