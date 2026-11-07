// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  branchName,
  type CardContext,
  impactLine,
  makeChangeId,
  reviewedCard,
  taskDoneRefusalCard,
} from "../../src";
import { SETTINGS, settingText } from "../../src/light";
import { resolveConfig } from "../../src/schema/config";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
/** A title whose slug, of 72 characters, passes the 48 of today. */
const TITLE = "Los límites de lo que muestran las tarjetas pasan a ser ajustes internos";
const WHOLE = "los-limites-de-lo-que-muestran-las-tarjetas-pasan-a-ser-ajustes-internos";
/** The keys of `internal.cards`, in the page's order, with their limits. */
const LIMITS = {
  "internal.cards.importersShown": [1, 50],
  "internal.cards.reviewLines": [20, 2000],
  "internal.cards.noteChars": [100, 1000],
  "internal.cards.slugChars": [16, 100],
} as const;
const KEYS = Object.keys(LIMITS);

describe("the cards' limits as parameters", () => {
  const importers = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts"];

  it("AC1: a line names as many importers as it is given and counts the rest, five without", () => {
    expect(impactLine("x.ts", importers, "es", 2)).toBe("x.ts — importado por a.ts, b.ts y 5 más");
    expect(impactLine("x.ts", importers, "en", 2)).toBe("x.ts — imported by a.ts, b.ts and 5 more");
    expect(impactLine("x.ts", importers, "es", 7)).toBe(
      "x.ts — importado por a.ts, b.ts, c.ts, d.ts, e.ts, f.ts, g.ts",
    );
    expect(impactLine("x.ts", importers, "es")).toBe(
      "x.ts — importado por a.ts, b.ts, c.ts, d.ts, e.ts y 2 más",
    );
  });

  it("AC2: the review's card repeats as many lines as it is given, then «…», 200 without", () => {
    const answer = Array.from({ length: 250 }, (_, n) => `- línea ${n + 1}`);
    const view = {
      header: "H",
      target: "spec",
      command: "claude -p",
      path: "spec-r1.md",
      text: answer.join("\n"),
    } as const;
    expect(reviewedCard(view, ES, 20).blocks[0]?.lines).toEqual([
      "Guardada en spec-r1.md.",
      ...answer.slice(0, 20),
      "…",
    ]);
    expect(reviewedCard(view, EN, 300).blocks[0]?.lines).toEqual([
      "Kept in spec-r1.md.",
      ...answer,
    ]);
    expect(reviewedCard(view, ES).blocks[0]?.lines).toEqual([
      "Guardada en spec-r1.md.",
      ...answer.slice(0, 200),
      "…",
    ]);
  });

  it("AC3: a note too long says the most it is given, 300 without", () => {
    const summary = taskDoneRefusalCard(
      { reason: "too-long", note: "summary", length: 150, max: 100 },
      "H",
      ES,
    );
    expect(summary.status).toBe("invalid");
    expect(summary.blocks[0]?.lines).toEqual([
      "El resumen tiene 150 caracteres; el máximo es 100, porque las tarjetas de las tareas siguientes lo repiten.",
    ]);
    const finding = taskDoneRefusalCard(
      { reason: "too-long", note: "finding", length: 600, max: 500 },
      "H",
      EN,
    );
    expect(finding.blocks[0]?.lines[0]).toMatch(/^A finding has 600 characters; the most is 500,/);
    const today = taskDoneRefusalCard(
      { reason: "too-long", note: "summary", length: 320 },
      "H",
      ES,
    );
    expect(today.blocks[0]?.lines[0]).toContain("el máximo es 300,");
  });

  it("AC4: a change's id and its branch cut the slug at the last dash within the length they are given, 48 without", () => {
    const day = new Date(2026, 10, 7);
    expect(makeChangeId(day, TITLE)).toBe("20261107-los-limites-de-lo-que-muestran-las-tarjetas");
    expect(makeChangeId(day, TITLE, 16)).toBe("20261107-los-limites-de");
    expect(makeChangeId(day, TITLE, 100)).toBe(`20261107-${WHOLE}`);
    const change = { kind: "standard", type: "feat", id: "20261107-x", title: TITLE } as const;
    expect(branchName({ ...change, flow: "github" })).toBe(
      "feat/los-limites-de-lo-que-muestran-las-tarjetas",
    );
    expect(branchName({ ...change, flow: "github", slugChars: 16 })).toBe("feat/los-limites-de");
    expect(branchName({ ...change, flow: "gitflow", slugChars: 100 })).toBe(`feature/${WHOLE}`);
    expect(
      branchName({ ...change, flow: "trunk", pattern: "team/{type}-{slug}", slugChars: 16 }),
    ).toBe("team/feat-los-limites-de");
    // The id is the change's own: the slug's length does not touch it.
    expect(branchName({ ...change, flow: "specty", slugChars: 16 })).toBe("specty/20261107-x");
  });
});

describe("the internal keys of what the cards show", () => {
  const TODAY = { importersShown: 5, reviewLines: 200, noteChars: 300, slugChars: 48 };
  const issuesOf = (cards: unknown) => {
    const result = resolveConfig({ version: 1, internal: { cards } });
    return result.ok ? [] : result.issues.map((issue) => issue.path);
  };

  it("AC5: default to today's values, with or without the block, and take each limit", () => {
    const today = { ok: true, config: { internal: { cards: TODAY } } };
    expect(resolveConfig({ version: 1 })).toMatchObject(today);
    expect(resolveConfig({ version: 1, internal: { cards: {} } })).toMatchObject(today);
    for (const end of [0, 1]) {
      const cards = Object.fromEntries(
        Object.entries(LIMITS).map(([key, limits]) => [key.split(".").at(-1), limits[end]]),
      );
      expect(resolveConfig({ version: 1, internal: { cards } })).toMatchObject({
        ok: true,
        config: { internal: { cards } },
      });
    }
  });

  it("AC5: refuses a value outside its limits, a fraction, a text and an unknown key, by its key", () => {
    for (const [key, [lowest, highest]] of Object.entries(LIMITS)) {
      const name = key.split(".").at(-1) ?? key;
      for (const value of [lowest - 1, highest + 1, lowest + 0.5, String(lowest)]) {
        expect(issuesOf({ [name]: value }), `${key} ${String(value)}`).toEqual([key]);
      }
    }
    expect(issuesOf({ lines: 5 })).toEqual(["internal.cards"]);
  });

  it("AC6: puts the four in «Interno», together after the execution and the server, as new numbers with no unit", () => {
    for (const key of KEYS) {
      expect(
        SETTINGS.find((setting) => setting.key === key),
        key,
      ).toEqual({ key, section: "internal", kind: "number", new: true });
    }
    const keys = SETTINGS.map((setting) => setting.key);
    const first = keys.indexOf(KEYS[0] ?? "");
    expect(keys.slice(first, first + KEYS.length)).toEqual(KEYS);
    expect(first).toBeGreaterThan(keys.indexOf("internal.server.portsTried"));
    expect(keys.indexOf("internal.server.portsTried")).toBeGreaterThan(-1);
  });

  it("AC7: names and describes each in Spanish and in English, with its limits", () => {
    for (const [key, [lowest, highest]] of Object.entries(LIMITS)) {
      const es = settingText(key, "es");
      const en = settingText(key, "en");
      expect(es.name, key).not.toBe(key);
      expect(en.name, key).not.toBe(key);
      expect(es.name, key).not.toBe(en.name);
      expect(es.description, key).not.toBe(en.description);
      expect(es.description, key).toContain(`de ${lowest} a ${highest}`);
      expect(en.description, key).toContain(`from ${lowest} to ${highest}`);
    }
  });
});
