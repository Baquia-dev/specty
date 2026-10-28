// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CiCommit,
  type CiFacts,
  ciReport,
  renderReport,
  reportExitCode,
  reportJson,
} from "../../src";

const ERROR = () => "error" as const;
const ID = "20261020-saludo";

/** A commit of governed code with no trailers. */
const BARE: CiCommit = {
  sha: "a1b2c3d",
  subject: "feat(src): Saludar por nombre",
  governed: ["src/app.ts"],
  init: false,
  spike: false,
  known: false,
};
/** A commit of `ID`'s task T1, approved. */
const TASK: CiCommit = { ...BARE, change: ID, task: "T1", known: true, approval: "valid" };

const facts = (commits: readonly CiCommit[], more: Partial<CiFacts> = {}): CiFacts => ({
  commits,
  intoTarget: true,
  ...more,
});
const findings = (fact: CiFacts, id: string, lang: "es" | "en" = "es") =>
  ciReport(fact, ERROR, lang)
    .results.find((result) => result.id === id)
    ?.findings.map((finding) => finding.message);

describe("traced", () => {
  it("AC1: names each commit of governed code without Specty-Change, with its files", () => {
    const bare: CiCommit = {
      ...BARE,
      sha: "d4e5f6a",
      subject: "fix: urgente",
      governed: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"],
    };
    expect(findings(facts([TASK, bare]), "traced")).toEqual([
      "d4e5f6a «fix: urgente» no lleva Specty-Change (documéntalo con specty retro): src/a.ts, src/b.ts, src/c.ts y 2 más",
    ]);
    expect(findings(facts([{ ...bare, governed: ["src/a.ts"] }]), "traced", "en")).toEqual([
      'd4e5f6a "fix: urgente" has no Specty-Change (document it with specty retro): src/a.ts',
    ]);
  });

  it("AC1: lets through Specty's installation and commits without governed code", () => {
    expect(
      findings(
        facts([
          { ...BARE, init: true },
          { ...BARE, governed: [] },
        ]),
        "traced",
      ),
    ).toEqual([]);
  });
});

describe("task-approval", () => {
  it("AC2: names a commit whose change does not exist", () => {
    const unknown: CiCommit = { ...BARE, change: "20991231-nada" };
    expect(findings(facts([unknown]), "task-approval")).toEqual([
      "a1b2c3d «feat(src): Saludar por nombre» nombra el cambio 20991231-nada, que no existe",
    ]);
    expect(findings(facts([unknown]), "task-approval", "en")).toEqual([
      'a1b2c3d "feat(src): Saludar por nombre" names the change 20991231-nada, which does not exist',
    ]);
  });

  it("AC2: names a task commit without its spec approved for that hash", () => {
    const missing: CiCommit = { ...TASK, approval: "missing" };
    const mismatch: CiCommit = { ...TASK, sha: "b2c3d4e", task: "T2", approval: "mismatch" };
    expect(findings(facts([missing, mismatch]), "task-approval")).toEqual([
      `a1b2c3d (T1 de ${ID}) no tenía la spec aprobada en su commit`,
      `b2c3d4e (T2 de ${ID}) no coincide con la spec aprobada (Specty-Spec)`,
    ]);
    expect(findings(facts([missing]), "task-approval", "en")).toEqual([
      `a1b2c3d (T1 of ${ID}) had no approved spec in its commit`,
    ]);
  });
});

describe("no-spike", () => {
  const spike: CiCommit = {
    ...BARE,
    subject: "spike: prueba",
    change: ID,
    known: true,
    spike: true,
  };

  it("AC3: names a spike's commit or branch that goes into the target branch", () => {
    expect(findings(facts([spike], { headRef: "spike/prueba" }), "no-spike")).toEqual([
      "a1b2c3d «spike: prueba» es de un spike (Specty-Kind: spike), que no va a la rama destino",
      "la rama spike/prueba es de un spike, que no va a la rama destino",
    ]);
    expect(findings(facts([], { headRef: "spike/try" }), "no-spike", "en")).toEqual([
      "the branch spike/try is a spike's, which does not go into the target branch",
    ]);
  });

  it("AC3: lets a spike go into another branch", () => {
    expect(
      findings(facts([spike], { intoTarget: false, headRef: "spike/prueba" }), "no-spike"),
    ).toEqual([]);
  });
});

describe("the report of `specty ci`", () => {
  it("AC4: passes traced commits, as `specty check` prints and serializes it", () => {
    const report = ciReport(facts([TASK]), ERROR, "es");
    expect(reportExitCode(report)).toBe(0);
    expect(renderReport(report, { lang: "es", verbose: false, maxFindings: 10 })).toBe("OK 3/3");
    expect(reportJson(report)).toMatchObject({
      checks: [
        { id: "traced", status: "passed" },
        { id: "task-approval", status: "passed" },
        { id: "no-spike", status: "passed" },
      ],
      exitCode: 0,
    });
  });

  it("AC4: follows checks.levels: off leaves a check out, warn only warns", () => {
    const report = ciReport(
      facts([BARE]),
      (id) => (id === "traced" ? "warn" : id === "no-spike" ? "off" : "error"),
      "en",
    );
    expect(report.results.map((result) => result.id)).toEqual(["traced", "task-approval"]);
    expect(reportExitCode(report)).toBe(0);
    expect(renderReport(report, { lang: "en", verbose: false, maxFindings: 10 })).toContain(
      "WARN traced",
    );
  });
});
