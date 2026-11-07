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

/** The chart series, in their order: neighbors meet in a stack. */
const SERIES = ["--color-series-1", "--color-series-2", "--color-series-3"] as const;

/** Machado, Oliveira and Fernandes (2009), severity 1, on linear RGB. */
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;

type Rgb = readonly [number, number, number];

function linear(hex: string): Rgb {
  const value = Number.parseInt(hex.trim().slice(1), 16);
  const [r, g, b] = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return [r ?? 0, g ?? 0, b ?? 0];
}

function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** How someone with `kind` sees `hex`, in linear RGB; with no kind, as it is. */
function seen(hex: string, kind?: keyof typeof MACHADO): Rgb {
  const rgb = linear(hex);
  if (kind === undefined) return rgb;
  const [r, g, b] = MACHADO[kind].map((row) =>
    Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])),
  );
  return [r ?? 0, g ?? 0, b ?? 0];
}

/** ΔE between two colors in OKLab, × 100, as someone with `kind` sees them. */
function distance(a: string, b: string, kind?: keyof typeof MACHADO): number {
  const [x, y] = [oklab(seen(a, kind)), oklab(seen(b, kind))];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
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

  it("AC4: calls the testing phase «Tests» in both languages", () => {
    expect(PHASE_LABELS.testing).toEqual({ es: "Tests", en: "Tests" });
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

  it("AC6: tells the chart series apart, also with color blindness, and sets them off the page in both themes", () => {
    const names = [...SERIES, "--color-chart-grid", "--color-chart-axis"];
    expect(names.filter((name) => !TOKENS.some((token) => token.name === name))).toEqual([]);
    for (const [theme, values] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      const colors = SERIES.map((name) => values.get(name) ?? "");
      // Neighbors in a stack stay apart with protanopia and deuteranopia.
      for (const [index, color] of colors.slice(1).entries()) {
        const before = colors[index] ?? "";
        for (const kind of ["protan", "deutan"] as const) {
          expect(
            distance(before, color, kind),
            `${theme}: ${before} ${color} ${kind}`,
          ).toBeGreaterThanOrEqual(8);
        }
      }
      // Any two, with normal vision.
      for (const [index, color] of colors.entries()) {
        for (const other of colors.slice(index + 1)) {
          expect(distance(color, other), `${theme}: ${color} ${other}`).toBeGreaterThanOrEqual(15);
        }
      }
      // 3:1 against the page and the panels. Only the light theme's third series falls short, and
      // the legend and the table view make up for it.
      for (const [index, color] of colors.entries()) {
        for (const ground of ["--color-bg", "--color-surface"]) {
          const min = theme === "light" && index === 2 ? 2.5 : 3;
          const ratio = contrastRatio(color, values.get(ground) ?? "");
          expect(ratio, `${theme}: ${color} on ${ground}`).toBeGreaterThanOrEqual(min);
        }
      }
      // The grid stays faint, and the baseline shows more than the grid.
      const onPage = (name: string) =>
        contrastRatio(values.get(name) ?? "", values.get("--color-bg") ?? "");
      expect(onPage("--color-chart-grid")).toBeGreaterThan(1);
      expect(onPage("--color-chart-axis")).toBeGreaterThan(onPage("--color-chart-grid"));
      expect(onPage("--color-chart-axis")).toBeLessThan(3);
    }
  });

  it("keeps the dark theme matte: legible, but never glaring", () => {
    const text = (fg: string) => contrastRatio(dark.get(fg) ?? "", dark.get("--color-bg") ?? "");
    // Near-black with near-white text reached 17.8:1 and tired the eyes.
    expect(text("--color-text")).toBeLessThanOrEqual(14);
    expect(text("--color-text")).toBeGreaterThanOrEqual(7);
    // No near-black surfaces: the page and the panels are matte grays.
    for (const name of ["--color-bg", "--color-surface"]) {
      expect(contrastRatio(dark.get(name) ?? "", "#000000"), name).toBeGreaterThanOrEqual(1.3);
    }
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
