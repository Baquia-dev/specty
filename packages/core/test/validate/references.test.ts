// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src";
import { check, fixture, withConfig } from "../helpers";

const STANDARD = fixture("standard.es.md");
const EPIC = fixture("epic.en.md");
const T1_FILES = "  - files: lib/features/home/home_estudiante_provider.dart\n";

describe("task references", () => {
  it("requires every task file to be declared in Files", () => {
    const text = STANDARD.replace(T1_FILES, `${T1_FILES.trimEnd()}, lib/otro.dart\n`);
    expect(check(text)).toContain("task-file-undeclared:T1");
  });

  it("accepts task files inside a declared glob", () => {
    const text = STANDARD.replace(
      "- modificar lib/features/home/home_estudiante_provider.dart",
      "- modificar lib/features/home/** ",
    ).replace(T1_FILES, "  - files: lib/features/home/widgets/*.dart\n");
    expect(check(text)).not.toContain("task-file-undeclared:T1");
  });

  it("requires files and criteria in standard tasks", () => {
    expect(check(STANDARD.replace(T1_FILES, ""))).toContain("task-files-missing:T1");
    expect(check(STANDARD.replace("  - ac: AC1\n", ""))).toContain("task-ac-missing:T1");
  });

  it("only allows `ac: —` for tasks that implement no criterion", () => {
    const none = STANDARD.replace("  - ac: AC1\n", "  - ac: —\n");
    expect(check(none)).toContain("task-ac-none-not-allowed:T1");
    expect(check(none.replace("  - ac: —\n", "  - ac: —\n  - type: refactor\n"))).not.toContain(
      "task-ac-none-not-allowed:T1",
    );
  });

  it("rejects references to unknown criteria", () => {
    expect(check(STANDARD.replace("  - ac: AC1\n", "  - ac: AC9\n"))).toContain(
      "reference-unknown:T1",
    );
  });

  it("requires every criterion to be covered", () => {
    expect(check(STANDARD.replace("  - ac: AC1, AC2\n", "  - ac: AC1\n"))).toContain(
      "criterion-uncovered:AC2",
    );
  });

  it("requires a verification command unless there is a default", () => {
    const text = STANDARD.replace("  - verify: flutter test test/features/home\n", "");
    expect(check(text)).toContain("task-verify-missing:T1");
    const config = withConfig({ verify: { ...DEFAULT_CONFIG.verify, default: "flutter test" } });
    expect(check(text, { config })).not.toContain("task-verify-missing:T1");
  });
});

describe("epic slices", () => {
  it("covers criteria through slices", () => {
    expect(
      check(
        EPIC.replace("  - ac: AC2\n- C2", "- C2").replace("  - ac: AC1, AC2\n", "  - ac: AC1\n"),
      ),
    ).toContain("criterion-uncovered:AC2");
  });

  it("rejects unknown and circular dependencies", () => {
    expect(check(EPIC.replace("  - depends: C1\n- C3", "  - depends: C9\n- C3"))).toContain(
      "reference-unknown:C2",
    );
    const cycle = EPIC.replace(
      "- C1: API contracts and typed models\n",
      "- C1: API contracts and typed models\n  - depends: C2\n",
    );
    expect(check(cycle)).toContain("slice-cycle");
  });
});
