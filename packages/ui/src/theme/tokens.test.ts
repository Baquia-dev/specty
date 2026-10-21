// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PHASES } from "@baquia-dev/specty-core";
import { CONTRAST_PAIRS, contrastRatio, PHASE_LABELS, TOKENS, tokensOf } from "./tokens";

// `ng test` runs from the package root.
const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Custom properties declared in the first block that starts with `header`. */
function block(header: string): ReadonlyMap<string, string> {
  const start = css.indexOf(`${header} {`);
  if (start < 0) throw new Error(`No block "${header}" in styles.css`);
  let depth = 0;
  let end = start;
  for (let index = css.indexOf("{", start); index < css.length; index++) {
    if (css[index] === "{") depth++;
    if (css[index] === "}" && --depth === 0) {
      end = index;
      break;
    }
  }
  const body = css.slice(start, end);
  return new Map(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", m[2] ?? ""]),
  );
}

const light = new Map([...block("@theme static"), ...block(":root")]);
const dark = new Map([...light, ...block('[data-theme="dark"]')]);
const reduced = block("@media (prefers-reduced-motion: reduce)");

describe("tokens", () => {
  it("defines every token of the inventory in styles.css", () => {
    const missing = TOKENS.map((item) => item.name).filter((name) => !light.has(name));
    expect(missing).toEqual([]);
  });

  it("describes every token in Spanish and English, with unique names", () => {
    expect(TOKENS.every((item) => item.es.length > 0 && item.en.length > 0)).toBe(true);
    expect(new Set(TOKENS.map((item) => item.name)).size).toBe(TOKENS.length);
    expect(tokensOf("phase")).toHaveLength(PHASES.length * 2);
    expect(PHASES.every((phase) => PHASE_LABELS[phase].es && PHASE_LABELS[phase].en)).toBe(true);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("keeps WCAG AA contrast in the %s theme (AC7)", (_theme, values) => {
    const failures = CONTRAST_PAIRS.flatMap(({ fg, bg, min }) => {
      const ratio = contrastRatio(values.get(fg) ?? "", values.get(bg) ?? "");
      return ratio >= min ? [] : [`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`];
    });
    expect(failures).toEqual([]);
  });

  it("keeps motion at 200 ms at most, and at 0 with reduced motion (AC8)", () => {
    const durations = [...light].filter(([name]) => name.startsWith("--duration-"));
    expect(durations.length).toBeGreaterThan(0);
    for (const [name, value] of durations) {
      expect(Number.parseFloat(value), name).toBeLessThanOrEqual(200);
      expect(reduced.get(name), name).toBe("0ms");
    }
  });
});

describe("contrastRatio", () => {
  it("follows the WCAG formula", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("rejects values that are not #rrggbb", () => {
    expect(() => contrastRatio("red", "#ffffff")).toThrow(/rrggbb/);
  });
});
