// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { PIECES, SETTINGS, settingChanges, settingOf, settingText } from "../../src/light";

const KEY = "checks.taskDone.skip";

describe("the checks task done leaves out, as a setting", () => {
  it("AC4: shows in «Verificaciones de calidad», after the level of each check, as a new list that affects permissions", () => {
    const checks = SETTINGS.filter((setting) => setting.section === "checks").map(
      (setting) => setting.key,
    );
    expect(checks.indexOf(KEY)).toBe(checks.indexOf("checks.levels") + 1);
    expect(SETTINGS.find((setting) => setting.key === KEY)).toEqual({
      key: KEY,
      section: "checks",
      kind: "list",
      permissions: true,
      new: true,
    });
    expect(settingOf(["checks", "taskDone", "skip"])?.key).toBe(KEY);
    expect(
      settingChanges({ version: 1 }, { version: 1, checks: { taskDone: { skip: ["todo"] } } }),
    ).toEqual([{ key: KEY, after: ["todo"] }]);
  });

  it("AC4: is part of the piece «specty check de lo cambiado», after the level of each check", () => {
    const keys = PIECES.find((piece) => piece.id === "checks")?.keys ?? [];
    expect(keys.indexOf(KEY)).toBe(keys.indexOf("checks.levels") + 1);
    expect(PIECES.filter((piece) => piece.keys.includes(KEY)).map((piece) => piece.id)).toEqual([
      "checks",
    ]);
  });

  it("AC4: names it and says that task done leaves them out, in Spanish and in English", () => {
    const es = settingText(KEY, "es");
    const en = settingText(KEY, "en");
    for (const text of [es, en]) {
      expect(text.name).not.toBe(KEY);
      expect(text.name.trim()).not.toBe("");
      expect(text.description).toContain("task done");
    }
    expect(es.name).not.toBe(en.name);
    expect(es.description).not.toBe(en.description);
  });
});
