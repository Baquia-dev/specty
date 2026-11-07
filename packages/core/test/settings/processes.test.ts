// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { SETTINGS, settingChanges, settingOf, settingText } from "../../src/light";

const ENV = "verify.processes.env";
const MEMORY = "verify.processes.memoryMiB";

describe("the processes of each verification command, as settings", () => {
  it("AC5: shows the variables as a list and the memory per process as a number in «Verificación», after the verifications at once", () => {
    const verify = SETTINGS.filter((setting) => setting.section === "verify").map(
      (setting) => setting.key,
    );
    expect(
      verify.slice(verify.indexOf("verify.slots"), verify.indexOf("verify.slots") + 4),
    ).toEqual(["verify.slots", ENV, MEMORY, "verify.units"]);
    expect(SETTINGS.find((setting) => setting.key === ENV)).toEqual({
      key: ENV,
      section: "verify",
      kind: "list",
    });
    expect(SETTINGS.find((setting) => setting.key === MEMORY)).toEqual({
      key: MEMORY,
      section: "verify",
      kind: "number",
    });
    expect(settingOf(["verify", "processes", "env"])?.key).toBe(ENV);
    expect(settingOf(["verify", "processes", "memoryMiB"])?.key).toBe(MEMORY);
    expect(
      settingChanges(
        { version: 1 },
        { version: 1, verify: { processes: { env: ["VITEST_MAX_WORKERS"], memoryMiB: 768 } } },
      ),
    ).toEqual([
      { key: ENV, after: ["VITEST_MAX_WORKERS"] },
      { key: MEMORY, after: 768 },
    ]);
  });

  it("AC5: names them and says what they do, in Spanish and in English", () => {
    for (const key of [ENV, MEMORY]) {
      const es = settingText(key, "es");
      const en = settingText(key, "en");
      for (const text of [es, en]) {
        expect(text.name, key).not.toBe(key);
        expect(text.name.trim(), key).not.toBe("");
        expect(text.description.trim(), key).not.toBe("");
      }
      expect(es.name, key).not.toBe(en.name);
      expect(es.description, key).not.toBe(en.description);
    }
    expect(settingText(ENV, "es").description).toContain("procesos");
    expect(settingText(ENV, "en").description).toContain("processes");
    expect(settingText(MEMORY, "es").name).toContain("MiB");
    expect(settingText(MEMORY, "en").name).toContain("MiB");
  });
});
