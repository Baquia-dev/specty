// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { slowTestLines, slowTestMessage } from "../../src";

/** Seven slow tests of one file, the longest first, as `slowTests` gives them. */
const SEVEN = [7000, 6000, 5000, 4000, 3000, 2000, 1500].map((ms, index) => ({
  path: "test/a.test.ts",
  name: `t${index + 1}`,
  ms,
}));

describe("the texts of the slow tests", () => {
  it("AC6: the warning of test-time, in Spanish and in English", () => {
    const test = { path: "test/sum.test.ts", name: "sum > adds", ms: 2560 };
    expect(slowTestMessage(test, 1000, "es")).toBe("«sum > adds» tarda 2,6 s (más de 1 s)");
    expect(slowTestMessage(test, 1000, "en")).toBe("«sum > adds» takes 2.6 s (over 1 s)");
    expect(slowTestMessage({ name: "t", ms: 12_000 }, 500, "es")).toBe(
      "«t» tarda 12 s (más de 0,5 s)",
    );
  });

  it("AC4: the note of accept lists the five slowest with their file, and how many more there are", () => {
    expect(slowTestLines(SEVEN, 1000, "es")).toEqual([
      "7 tests tardan más de 1 s:",
      "test/a.test.ts «t1»: 7 s",
      "test/a.test.ts «t2»: 6 s",
      "test/a.test.ts «t3»: 5 s",
      "test/a.test.ts «t4»: 4 s",
      "test/a.test.ts «t5»: 3 s",
      "Otros 2 tests lentos.",
    ]);
  });

  it("AC4: without slow tests, it says nothing", () => {
    expect(slowTestLines([], 1000, "es")).toEqual([]);
    expect(slowTestLines([], 1000, "en")).toEqual([]);
  });

  it("AC6: the lines of the note in English, and in the singular in both languages", () => {
    expect(slowTestLines(SEVEN.slice(0, 6), 1000, "en")).toEqual([
      "6 tests take over 1 s:",
      "test/a.test.ts «t1»: 7 s",
      "test/a.test.ts «t2»: 6 s",
      "test/a.test.ts «t3»: 5 s",
      "test/a.test.ts «t4»: 4 s",
      "test/a.test.ts «t5»: 3 s",
      "1 more slow test.",
    ]);
    expect(slowTestLines(SEVEN.slice(0, 6), 1000, "es").at(-1)).toBe("Otro test lento.");
    const alone = [{ name: "solo", ms: 1234 }];
    expect(slowTestLines(alone, 500, "es")).toEqual([
      "Un test tarda más de 0,5 s:",
      "«solo»: 1,2 s",
    ]);
    expect(slowTestLines(alone, 500, "en")).toEqual(["1 test takes over 0.5 s:", "«solo»: 1.2 s"]);
  });
});
