// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { optionName, SETTINGS, settingChanges, settingOf, settingText } from "../../src/light";
import { DEFAULT_CONFIG, resolveConfig } from "../../src/schema/config";

const LEVELS = ["S", "M", "L", "XL"];

/** The keys of the catalog's section `section`, in the page's order. */
const keysOf = (section: string) =>
  SETTINGS.filter((setting) => setting.section === section).map((setting) => setting.key);

/** The keys with an error when `config.yaml` holds `input`. */
const issuesOf = (input: Record<string, unknown>) => {
  const result = resolveConfig({ version: 1, ...input });
  return result.ok ? [] : result.issues.map((issue) => issue.path);
};

describe("the quick lane's tasks and the review's size as settings", () => {
  it("AC3: are 1 and L without their keys, take valid values and refuse anything else by its key", () => {
    expect(DEFAULT_CONFIG.lanes).toEqual({ quick: { maxFiles: 3, maxTasks: 1 } });
    expect(DEFAULT_CONFIG.flow.reviewFrom).toBe("L");
    expect(resolveConfig({ version: 1 })).toMatchObject({
      ok: true,
      config: {
        lanes: { quick: { maxFiles: 3, maxTasks: 1 } },
        flow: { closing: true, reviewFrom: "L" },
      },
    });
    expect(resolveConfig({ version: 1, lanes: { quick: { maxTasks: 2 } } })).toMatchObject({
      ok: true,
      config: { lanes: { quick: { maxFiles: 3, maxTasks: 2 } } },
    });
    expect(resolveConfig({ version: 1, lanes: { quick: { maxFiles: 5 } } })).toMatchObject({
      ok: true,
      config: { lanes: { quick: { maxFiles: 5, maxTasks: 1 } } },
    });
    for (const reviewFrom of LEVELS) {
      expect(resolveConfig({ version: 1, flow: { reviewFrom } })).toMatchObject({
        ok: true,
        config: { flow: { closing: true, reviewFrom } },
      });
    }
    for (const maxTasks of [0, -1, 1.5, "2", null]) {
      expect(issuesOf({ lanes: { quick: { maxTasks } } }), String(maxTasks)).toEqual([
        "lanes.quick.maxTasks",
      ]);
    }
    for (const reviewFrom of ["s", "XXL", "", 2, null]) {
      expect(issuesOf({ flow: { reviewFrom } }), String(reviewFrom)).toEqual(["flow.reviewFrom"]);
    }
    expect(issuesOf({ lanes: { quick: { tasks: 2 } } })).toEqual(["lanes.quick"]);
  });

  it("AC6: shows the tasks after the quick lane's files and the size after the review's time limit, new, named in Spanish and in English", () => {
    expect(keysOf("review")).toEqual(["review.command", "review.timeoutSec", "flow.reviewFrom"]);
    expect(keysOf("size").slice(0, 4)).toEqual([
      "size",
      "lanes.quick.maxFiles",
      "lanes.quick.maxTasks",
      "split",
    ]);
    expect(SETTINGS.find((setting) => setting.key === "lanes.quick.maxTasks")).toEqual({
      key: "lanes.quick.maxTasks",
      section: "size",
      kind: "number",
      new: true,
    });
    expect(SETTINGS.find((setting) => setting.key === "flow.reviewFrom")).toEqual({
      key: "flow.reviewFrom",
      section: "review",
      kind: "choice",
      options: LEVELS,
      new: true,
    });
    expect(settingOf(["lanes", "quick", "maxTasks"])?.key).toBe("lanes.quick.maxTasks");
    expect(settingOf(["flow", "reviewFrom"])?.key).toBe("flow.reviewFrom");
    expect(
      settingChanges(
        { version: 1 },
        { version: 1, lanes: { quick: { maxTasks: 2 } }, flow: { reviewFrom: "M" } },
      ),
    ).toEqual([
      { key: "flow.reviewFrom", after: "M" },
      { key: "lanes.quick.maxTasks", after: 2 },
    ]);
    expect(settingText("lanes.quick.maxTasks", "es").name).toBe("Tareas de un cambio rápido");
    expect(settingText("lanes.quick.maxTasks", "en").name).toBe("Tasks of a quick change");
    expect(settingText("flow.reviewFrom", "es").name).toBe("Revisar desde el tamaño");
    expect(settingText("flow.reviewFrom", "en").name).toBe("Review from size");
    for (const key of ["lanes.quick.maxTasks", "flow.reviewFrom"]) {
      const es = settingText(key, "es").description;
      const en = settingText(key, "en").description;
      expect(es.trim(), key).not.toBe("");
      expect(en.trim(), key).not.toBe("");
      expect(es, key).not.toBe(en);
    }
    for (const level of LEVELS) {
      expect(optionName("flow.reviewFrom", level, "es")).toBe(level);
      expect(optionName("flow.reviewFrom", level, "en")).toBe(level);
    }
  });
});
