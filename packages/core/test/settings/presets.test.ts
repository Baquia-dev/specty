// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type ConfigEdit,
  PRESET_KEYS,
  PRESETS,
  presetEdits,
  presetOf,
  presetText,
  presetValue,
  settingChanges,
  settingOf,
} from "../../src/light";
import { DEFAULT_CONFIG, resolveConfig } from "../../src/schema/config";

/** The value at a key with dots, inside maps; none when a key on the way is missing. */
function valueAt(source: unknown, key: string): unknown {
  let value = source;
  for (const part of key.split(".")) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = Object.entries(value).find(([name]) => name === part)?.[1];
  }
  return value;
}

const defaults = (key: string): unknown => valueAt(DEFAULT_CONFIG, key);

/** The value of a key in the file `input` itself, with no default. */
const reading =
  (input: unknown) =>
  (key: string): unknown =>
    valueAt(input, key);

/** The value Specty uses with the file `input`: the file's, else the default. */
const using =
  (input: unknown) =>
  (key: string): unknown =>
    valueAt(input, key) ?? defaults(key);

function isMap(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `input` with `edit` applied: its value at its keys, or its key removed, with no empty map left. */
function edited(input: unknown, edit: ConfigEdit): unknown {
  const [key, ...rest] = edit.path;
  const map = isMap(input) ? input : {};
  if (key === undefined) return input;
  const { [key]: old, ...others } = map;
  const value = rest.length === 0 ? edit.value : edited(old, { ...edit, path: rest });
  const gone = value === undefined || (isMap(value) && Object.keys(value).length === 0);
  return gone && (rest.length > 0 || edit.value === undefined)
    ? others
    : { ...others, [key]: value };
}

const applied = (input: unknown, edits: readonly ConfigEdit[]): unknown =>
  edits.reduce(edited, input);

const EMPTY = { version: 1 };

/** The file Specty writes for `preset` from an empty one. */
const fileOf = (preset: (typeof PRESETS)[number]): unknown =>
  applied(EMPTY, presetEdits(preset, reading(EMPTY), defaults));

/** A project like this repository: its commands, tests as contract and a build after landing. */
const PROJECT = {
  version: 1,
  verify: { default: "pnpm test", full: "pnpm check", timeoutSec: 2000 },
  policy: { tests: "contract" },
  git: { afterLanding: "pnpm build" },
};

/** The value of each key of the profiles in `preset`. */
const table = (preset: (typeof PRESETS)[number]) =>
  Object.fromEntries(PRESET_KEYS.map((key) => [key, presetValue(preset, key, defaults)]));

describe("the profiles of the basic mode", () => {
  it("AC1: are Ligero, Equilibrado and Estricto, in this order", () => {
    expect(PRESETS).toEqual(["light", "balanced", "strict"]);
  });

  it("AC7: fix nine keys, the tests policy and limits of lines, functions and coverage: no command, path nor guarantee", () => {
    expect(PRESET_KEYS).toEqual([
      "policy.tests",
      "lines.warn",
      "lines.fail",
      "lines.tests.warn",
      "lines.tests.fail",
      "checks.functions.maxLines",
      "checks.functions.complexity",
      "checks.coverage.warn",
      "checks.coverage.error",
    ]);
    for (const key of PRESET_KEYS) {
      const setting = settingOf(key.split("."));
      expect(setting, key).toBeDefined();
      expect(setting?.command, key).toBeUndefined();
      expect(setting?.guarantee, key).toBeUndefined();
      expect(["list", "command", "text"], key).not.toContain(setting?.kind);
    }
  });

  it("AC1, AC7: Equilibrado gives each key its default, and Ligero and Estricto their own values", () => {
    expect(table("balanced")).toEqual({
      "policy.tests": "recommended",
      "lines.warn": 300,
      "lines.fail": 500,
      "lines.tests.warn": 400,
      "lines.tests.fail": 600,
      "checks.functions.maxLines": 50,
      "checks.functions.complexity": 10,
      "checks.coverage.warn": 80,
      "checks.coverage.error": undefined,
    });
    expect(table("light")).toEqual({
      "policy.tests": "off",
      "lines.warn": 500,
      "lines.fail": 1000,
      "lines.tests.warn": 600,
      "lines.tests.fail": 1200,
      "checks.functions.maxLines": 100,
      "checks.functions.complexity": 20,
      "checks.coverage.warn": 80,
      "checks.coverage.error": undefined,
    });
    expect(table("strict")).toEqual({
      "policy.tests": "contract",
      "lines.warn": 300,
      "lines.fail": 500,
      "lines.tests.warn": 400,
      "lines.tests.fail": 600,
      "checks.functions.maxLines": 50,
      "checks.functions.complexity": 10,
      "checks.coverage.warn": 90,
      "checks.coverage.error": 80,
    });
  });

  it("AC7: applied to a file, any profile gives a valid configuration that changes only its settings", () => {
    const allowed = new Set(PRESET_KEYS.map((key) => settingOf(key.split("."))?.key));
    for (const preset of PRESETS) {
      for (const file of [EMPTY, PROJECT]) {
        const edits = presetEdits(preset, reading(file), defaults);
        for (const edit of edits) expect(settingOf(edit.path), edit.path.join(".")).toBeDefined();
        const after = applied(file, edits);
        expect(resolveConfig(after).ok, preset).toBe(true);
        for (const change of settingChanges(file, after)) {
          expect(allowed.has(change.key), change.key).toBe(true);
        }
      }
    }
  });
});

describe("the profile that matches the configuration", () => {
  it("AC1: is Equilibrado with the defaults, and Propio when none matches", () => {
    expect(presetOf(using(EMPTY), defaults)).toBe("balanced");
    expect(presetOf(using(PROJECT), defaults)).toBe("custom");
    expect(presetOf(using({ ...EMPTY, lines: { fail: false } }), defaults)).toBe("custom");
    expect(presetOf(using({ ...EMPTY, checks: { coverage: { error: 50 } } }), defaults)).toBe(
      "custom",
    );
  });

  it("AC2: is the profile whose keys have its values, though other keys differ from the defaults", () => {
    for (const preset of PRESETS) {
      const file = fileOf(preset);
      const others = isMap(file) ? file : {};
      const value = using({
        ...others,
        subagents: false,
        verify: { timeoutSec: 2000 },
        split: { maxModules: 3 },
      });
      expect(presetOf(value, defaults)).toBe(preset);
    }
    const explicit = { ...EMPTY, policy: { tests: "recommended" }, lines: { warn: 300 } };
    expect(presetOf(using(explicit), defaults)).toBe("balanced");
  });
});

describe("choosing a profile", () => {
  it("AC5: gives each key the profile's value, takes out the defaults and keeps the file's own values", () => {
    expect(presetEdits("light", reading(EMPTY), defaults)).toEqual([
      { path: ["policy", "tests"], value: "off" },
      { path: ["lines", "warn"], value: 500 },
      { path: ["lines", "fail"], value: 1000 },
      { path: ["lines", "tests", "warn"], value: 600 },
      { path: ["lines", "tests", "fail"], value: 1200 },
      { path: ["checks", "functions", "maxLines"], value: 100 },
      { path: ["checks", "functions", "complexity"], value: 20 },
      { path: ["checks", "coverage", "warn"] },
      { path: ["checks", "coverage", "error"] },
    ]);
    const file = { ...EMPTY, policy: { tests: "recommended" }, lines: { warn: 300, fail: 800 } };
    const edits = presetEdits("balanced", reading(file), defaults);
    expect(edits.slice(0, 3)).toEqual([
      { path: ["policy", "tests"], value: "recommended" },
      { path: ["lines", "warn"], value: 300 },
      { path: ["lines", "fail"] },
    ]);
    expect(settingChanges(file, applied(file, edits))).toEqual([
      { key: "lines.fail", before: 800 },
    ]);
  });

  it("AC5: writes only the keys that change: Estricto from the defaults sets the tests policy and the coverage", () => {
    expect(fileOf("strict")).toEqual({
      version: 1,
      policy: { tests: "contract" },
      checks: { coverage: { warn: 90, error: 80 } },
    });
    expect(fileOf("balanced")).toEqual(EMPTY);
  });

  it("AC6: the profile the file has leaves nothing to save, and another one replaces the earlier's values", () => {
    for (const preset of PRESETS) {
      const file = fileOf(preset);
      const edits = presetEdits(preset, reading(file), defaults);
      expect(settingChanges(file, applied(file, edits)), preset).toEqual([]);
      for (const other of PRESETS) {
        const after = applied(file, presetEdits(other, reading(file), defaults));
        expect(after, `${preset} → ${other}`).toEqual(fileOf(other));
      }
    }
  });
});

describe("what each profile says", () => {
  it("AC1, AC9: names each profile and Propio, with what it fixes, in Spanish and in English", () => {
    const choices = [...PRESETS, "custom"] as const;
    expect(choices.map((preset) => presetText(preset, defaults, "es"))).toEqual([
      {
        name: "Ligero",
        description:
          "Para prototipos: sin tests exigidos, archivos de hasta 1000 líneas de código y funciones de hasta 100 líneas o complejidad 20.",
      },
      {
        name: "Equilibrado",
        description:
          "Los valores por defecto: tests recomendados, archivos de hasta 500 líneas de código, funciones de hasta 50 líneas o complejidad 10 y cobertura del diff que avisa por debajo del 80 %.",
      },
      {
        name: "Estricto",
        description:
          "Tests como contrato, aprobados antes del código, y cobertura del diff que falla por debajo del 80 % y avisa por debajo del 90 %.",
      },
      {
        name: "Propio",
        description:
          "Lo que armes en Avanzado: cambiar un ajuste de un perfil lo convierte en propio.",
      },
    ]);
    expect(choices.map((preset) => presetText(preset, defaults, "en"))).toEqual([
      {
        name: "Light",
        description:
          "For prototypes: no tests required, files of up to 1000 lines of code and functions of up to 100 lines or complexity 20.",
      },
      {
        name: "Balanced",
        description:
          "The defaults: tests recommended, files of up to 500 lines of code, functions of up to 50 lines or complexity 10 and diff coverage that warns below 80%.",
      },
      {
        name: "Strict",
        description:
          "Tests as a contract, approved before the code, and diff coverage that fails below 80% and warns below 90%.",
      },
      {
        name: "Custom",
        description: "What you build in Advanced: changing a setting of a profile makes it custom.",
      },
    ]);
  });

  it("AC1: says Equilibrado's values from the defaults it is given", () => {
    const fallback = (key: string): unknown => (key === "lines.fail" ? 600 : defaults(key));
    expect(presetText("balanced", fallback, "es").description).toContain(
      "archivos de hasta 600 líneas de código",
    );
  });
});
