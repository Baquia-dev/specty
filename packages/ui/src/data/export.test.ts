// SPDX-License-Identifier: Apache-2.0
import { auditReport, auditViewOf, parseSpec } from "@baquia-dev/specty-core";
import { EXPORT_FORMATS, exportContextOf, exportSpec } from "@baquia-dev/specty-exporters";
import { exportOf } from "./export";
import type { ChangeRecord } from "./records";
import { sampleRecords } from "./sample-records";
import { zip } from "./zip";

const NOW = new Date(2026, 9, 29, 10, 30);
const ID = "20261015-redondeo-promedios";

function record(): ChangeRecord {
  const found = sampleRecords(NOW.getTime()).find((item) => item.state.id === ID);
  if (found === undefined) throw new Error(`no sample ${ID}`);
  return found;
}

describe("the export of a change", () => {
  it("AC1: gives `specty audit`'s report as Markdown or as JSON", () => {
    const change = record();
    const { spec } = parseSpec(change.spec, { language: "es" });
    const view = auditViewOf({ state: change.state, spec, audit: change.audit ?? [] });
    const report = auditReport(view, "es");
    expect(report.markdown).toContain("# Auditoría: ");
    expect(exportOf(change, "markdown", "es", NOW)).toEqual({
      name: `${ID}.md`,
      type: "text/markdown",
      content: report.markdown,
    });

    const json = exportOf(change, "json", "es", NOW);
    expect(json.name).toBe(`${ID}.json`);
    expect(json.type).toBe("application/json");
    expect(JSON.parse(typeof json.content === "string" ? json.content : "")).toEqual(report.json);

    const english = exportOf(change, "markdown", "en", NOW);
    expect(typeof english.content === "string" ? english.content : "").toContain("# Audit: ");
  });

  it("AC2: gives OpenSpec, Spec Kit and Kiro as a zip with `specty export`'s files", () => {
    const change = record();
    const { spec } = parseSpec(change.spec, { language: "es" });
    const context = exportContextOf(change.state, change.audit ?? []);
    for (const format of EXPORT_FORMATS) {
      expect(exportOf(change, format, "es", NOW)).toEqual({
        name: `${ID}-${format}.zip`,
        type: "application/zip",
        content: zip(exportSpec(spec, format, context), NOW),
      });
    }
  });
});
