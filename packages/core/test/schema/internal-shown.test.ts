// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../../src/schema/config";

/** Today's values of the limits of what commands and checks show. */
const TODAY = {
  findings: { perCommand: 100, lastLines: 5, messageChars: 200 },
  commands: { verifyLines: 20, whyEntries: 10 },
};

/** Each key, by its block under `internal`, with its lowest and its highest value. */
const LIMITS = [
  ["findings", "perCommand", 10, 1000],
  ["findings", "lastLines", 1, 50],
  ["findings", "messageChars", 50, 2000],
  ["commands", "verifyLines", 5, 200],
  ["commands", "whyEntries", 1, 100],
] as const;

/** The keys of the errors that `internal` gives in a configuration. */
const issuesOf = (internal: unknown) => {
  const result = resolveConfig({ version: 1, internal });
  return result.ok ? [] : result.issues.map((issue) => issue.path);
};

describe("the internal keys of what commands and checks show", () => {
  it("AC6: default to today's values, with or without the keys, and take each one alone", () => {
    expect(DEFAULT_CONFIG.internal).toMatchObject(TODAY);
    expect(resolveConfig({ version: 1 })).toMatchObject({ ok: true, config: { internal: TODAY } });
    expect(resolveConfig({ version: 1, internal: { findings: {}, commands: {} } })).toMatchObject({
      ok: true,
      config: { internal: TODAY },
    });
    expect(
      resolveConfig({
        version: 1,
        internal: { findings: { lastLines: 2 }, commands: { whyEntries: 3 } },
      }),
    ).toMatchObject({
      ok: true,
      config: {
        internal: {
          findings: { ...TODAY.findings, lastLines: 2 },
          commands: { ...TODAY.commands, whyEntries: 3 },
        },
      },
    });
  });

  it("AC6: takes each key's whole numbers within its limits and refuses the rest, and an unknown key, by its key", () => {
    for (const [block, key, lowest, highest] of LIMITS) {
      const path = `internal.${block}.${key}`;
      for (const valid of [lowest, highest]) {
        expect(issuesOf({ [block]: { [key]: valid } }), `${path} ${valid}`).toEqual([]);
      }
      for (const invalid of [lowest - 1, highest + 1, lowest + 0.5, String(lowest)]) {
        expect(issuesOf({ [block]: { [key]: invalid } }), `${path} ${invalid}`).toEqual([path]);
      }
    }
    expect(issuesOf({ findings: { max: 5 } })).toEqual(["internal.findings"]);
    expect(issuesOf({ commands: { shown: 5 } })).toEqual(["internal.commands"]);
  });
});
