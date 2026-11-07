// SPDX-License-Identifier: Apache-2.0
import type { ConfigEdit } from "./catalog";
import type { SettingValue } from "./pieces";

// The profiles of the basic mode of the view Flujo: Ligero, Equilibrado and Estricto, each a value
// for the same keys of `config.yaml`, the tests policy and limits only (formats.md §6); which one the
// configuration matches, and the edits that choose one. Pure, for the UI's main thread; their names
// and what each fixes are in `cards/settings-presets.ts`.

/** The profiles, in the page's order; a configuration that matches none is Propio (`custom`). */
export const PRESETS = ["light", "balanced", "strict"] as const;

export type Preset = (typeof PRESETS)[number];

/**
 * The keys the profiles fix, with dots, in the page's order. Not `split`, which the size already
 * outruns, nor `checks.levels`, which are errors by default; never commands, paths nor guarantees.
 */
export const PRESET_KEYS = [
  "policy.tests",
  "lines.warn",
  "lines.fail",
  "lines.tests.warn",
  "lines.tests.fail",
  "checks.functions.maxLines",
  "checks.functions.complexity",
  "checks.coverage.warn",
  "checks.coverage.error",
] as const;

type PresetKey = (typeof PRESET_KEYS)[number];

/**
 * What each profile gives its keys besides their defaults; Equilibrado is the defaults. Ligero, for
 * prototypes, asks for no tests and warns where Equilibrado blocks, blocking at the double; its
 * complexity, 20, is the default of ESLint's rule. Estricto has the tests as a contract, and a diff
 * coverage that fails where Equilibrado warns and warns from 90 %.
 */
const OWN: Readonly<Record<Preset, Readonly<Partial<Record<PresetKey, unknown>>>>> = {
  light: {
    "policy.tests": "off",
    "lines.warn": 500,
    "lines.fail": 1000,
    "lines.tests.warn": 600,
    "lines.tests.fail": 1200,
    "checks.functions.maxLines": 100,
    "checks.functions.complexity": 20,
  },
  balanced: {},
  strict: {
    "policy.tests": "contract",
    "checks.coverage.warn": 90,
    "checks.coverage.error": 80,
  },
};

/** The value of `key` in the profile: its own, or else the default (`fallback`). */
export function presetValue(preset: Preset, key: string, fallback: SettingValue): unknown {
  const own = Object.entries(OWN[preset]).find(([name]) => name === key);
  return own === undefined ? fallback(key) : own[1];
}

/**
 * The profile whose keys all have its values in `value`, the configuration with the page's edits;
 * `custom` when none does. The other keys do not count.
 */
export function presetOf(value: SettingValue, fallback: SettingValue): Preset | "custom" {
  const matches = (preset: Preset) =>
    PRESET_KEYS.every((key) => value(key) === presetValue(preset, key, fallback));
  return PRESETS.find(matches) ?? "custom";
}

/**
 * The edits that choose the profile: one per key, so they replace the page's earlier edits of its
 * keys. Each key takes the profile's value, or leaves the file where that is the default; where the
 * file (`file`, with no defaults) already gives that value, it keeps its own, so only the keys that
 * change are written.
 */
export function presetEdits(
  preset: Preset,
  file: SettingValue,
  fallback: SettingValue,
): readonly ConfigEdit[] {
  return PRESET_KEYS.map((key): ConfigEdit => {
    const path = key.split(".");
    const target = presetValue(preset, key, fallback);
    const own = file(key);
    if ((own ?? fallback(key)) === target) {
      return own === undefined ? { path } : { path, value: own };
    }
    return fallback(key) === target ? { path } : { path, value: target };
  });
}
