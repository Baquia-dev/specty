// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import type { DiffLine } from "./diff";
import { FixtureData } from "./fixtures";
import { patchFiles } from "./patch";
import { deriveViews } from "./views";

const PDF = "20261019-boletines-pdf";
const LOGIN = "20261021-login-google";
const REPORT_CARD = "test/reports/report_card_test.dart";
const PROVIDER = "test/auth/google_provider_test.dart";

/** The prototype's source, as the app makes it. */
function source(): FixtureData {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [FixtureData] });
  return TestBed.inject(FixtureData);
}

async function viewOf(data: FixtureData, id: string) {
  const view = deriveViews(await data.changes()).find((change) => change.id === id);
  if (view === undefined) throw new Error(`no sample change ${id}`);
  return view;
}

/** Whether each line of `side` is, at its number, the line the test's code has there. */
function matches(code: string, lines: readonly DiffLine[], side: "old" | "new"): boolean {
  const file = code.split("\n");
  return lines.every((line) => {
    const number = side === "old" ? line.oldNumber : line.newNumber;
    return number === undefined || file[number - 1] === line.text;
  });
}

describe("the prototype's unlocks", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: gives the code of each locked test of the changes in implementation", async () => {
    const data = source();
    expect((await viewOf(data, PDF)).lockedTests?.map((test) => test.path)).toEqual([REPORT_CARD]);
    expect((await viewOf(data, LOGIN)).lockedTests?.map((test) => test.path)).toEqual([PROVIDER]);
    expect(await data.testCode(PDF, REPORT_CARD)).toContain("Firma del rector");
    expect(await data.testCode(LOGIN, PROVIDER)).toContain("expect(provider.current, isNull);");
  });

  it("AC3: has an unlock waiting, with its patch to the locked test and its evidence", async () => {
    const data = source();
    const view = await viewOf(data, PDF);
    expect(view.decision).toBe("scope");
    const unlock = view.progress.tasks[2]?.scopeRequests[1];
    expect(unlock).toMatchObject({ id: "S2", paths: [REPORT_CARD], unlocks: [REPORT_CARD] });
    expect(unlock?.reason).toContain("Firma del rector");
    expect(unlock?.evidence).toEqual([
      {
        path: "lib/school/school_profile.dart",
        from: 12,
        to: 13,
        text: expect.stringContaining("final String signedBy;"),
      },
    ]);
    const files = patchFiles(unlock?.patch ?? "");
    expect(files.map((file) => [file.path, file.additions, file.deletions])).toEqual([
      [REPORT_CARD, 1, 1],
    ]);
    // The patch applies to the test as it was locked.
    const lines = files[0]?.hunks.flatMap((hunk) => hunk.lines) ?? [];
    expect(matches(await data.testCode(PDF, REPORT_CARD), lines, "old")).toBe(true);
  });

  it("AC4: has an unlock approved before, with its reason, its patch and its evidence", async () => {
    const data = source();
    const view = await viewOf(data, LOGIN);
    expect(view.decision).toBeUndefined();
    const [test] = view.lockedTests ?? [];
    expect(test?.unlockedFor).toBeUndefined();
    expect(test?.unlocks.map(({ request, task }) => [request, task])).toEqual([["S1", "T1"]]);
    const unlock = test?.unlocks[0];
    expect(unlock?.reason).toContain("signOut()");
    expect(unlock?.evidence?.map(({ path, from, to }) => [path, from, to])).toEqual([
      ["lib/auth/auth_provider.dart", 6, 10],
    ]);
    const files = patchFiles(unlock?.patch ?? "");
    expect(files.map((file) => [file.path, file.additions, file.deletions])).toEqual([
      [PROVIDER, 2, 1],
    ]);
    // The test has what the approved patch left.
    const lines = files[0]?.hunks.flatMap((hunk) => hunk.lines) ?? [];
    expect(matches(await data.testCode(LOGIN, PROVIDER), lines, "new")).toBe(true);
  });

  it("AC5: approving the unlock that waits keeps its tests, task, patch and evidence, as the CLI does", async () => {
    const data = source();
    const asked = (await viewOf(data, PDF)).progress.tasks[2]?.scopeRequests[1];
    await data.decideScope(PDF, "S2", "approved");
    const [test] = (await viewOf(data, PDF)).lockedTests ?? [];
    expect(test?.unlockedFor).toBe("T3");
    expect(test?.unlocks).toEqual([
      {
        request: "S2",
        task: "T3",
        reason: asked?.reason,
        patch: asked?.patch,
        evidence: asked?.evidence,
      },
    ]);
    const record = (await data.changes()).find((item) => item.state.id === PDF);
    expect(record?.audit?.at(-1)).toMatchObject({
      actor: "human",
      event: "scope.decided",
      data: { id: "S2", decision: "approved", unlock: [REPORT_CARD], task: "T3" },
    });
  });

  it("AC5: a rejected unlock opens nothing", async () => {
    const data = source();
    await data.decideScope(PDF, "S2", "rejected", "Pon la firma fija, como dice la spec.");
    const [test] = (await viewOf(data, PDF)).lockedTests ?? [];
    expect(test?.unlockedFor).toBeUndefined();
    expect(test?.unlocks).toEqual([]);
  });
});
