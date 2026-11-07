// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { SettingValue } from "../settings/pieces";
import { type Preset, presetValue } from "../settings/presets";
import { translator } from "./text";

// What the profiles of the basic mode say (`settings/presets.ts`): each one's name and what it
// fixes, with its values, and Propio's.

/** A profile's name and what it fixes. */
interface PresetText {
  readonly name: string;
  readonly description: string;
}

/** A text in Spanish and in English. */
type Sentence = readonly [string, string];

const NAMES: Readonly<Record<Preset | "custom", Sentence>> = {
  light: ["Ligero", "Light"],
  balanced: ["Equilibrado", "Balanced"],
  strict: ["Estricto", "Strict"],
  custom: ["Propio", "Custom"],
};

const CUSTOM: Sentence = [
  "Lo que armes en Avanzado: cambiar un ajuste de un perfil lo convierte en propio.",
  "What you build in Advanced: changing a setting of a profile makes it custom.",
];

/** What the profile fixes, with the values `value` gives its keys. */
function fixes(preset: Preset, value: SettingValue): Sentence {
  const fail = String(value("lines.fail"));
  const lines = String(value("checks.functions.maxLines"));
  const complexity = String(value("checks.functions.complexity"));
  const warn = String(value("checks.coverage.warn"));
  const error = String(value("checks.coverage.error"));
  if (preset === "light") {
    return [
      `Para prototipos: sin tests exigidos, archivos de hasta ${fail} líneas de código y funciones de hasta ${lines} líneas o complejidad ${complexity}.`,
      `For prototypes: no tests required, files of up to ${fail} lines of code and functions of up to ${lines} lines or complexity ${complexity}.`,
    ];
  }
  if (preset === "strict") {
    return [
      `Tests como contrato, aprobados antes del código, y cobertura del diff que falla por debajo del ${error} % y avisa por debajo del ${warn} %.`,
      `Tests as a contract, approved before the code, and diff coverage that fails below ${error}% and warns below ${warn}%.`,
    ];
  }
  return [
    `Los valores por defecto: tests recomendados, archivos de hasta ${fail} líneas de código, funciones de hasta ${lines} líneas o complejidad ${complexity} y cobertura del diff que avisa por debajo del ${warn} %.`,
    `The defaults: tests recommended, files of up to ${fail} lines of code, functions of up to ${lines} lines or complexity ${complexity} and diff coverage that warns below ${warn}%.`,
  ];
}

/**
 * The name of a profile, or of Propio, and what it fixes, with its values: its own or, else, the
 * defaults (`fallback`).
 */
export function presetText(
  preset: Preset | "custom",
  fallback: SettingValue,
  lang: Lang,
): PresetText {
  const t = translator(lang);
  const description =
    preset === "custom" ? CUSTOM : fixes(preset, (key) => presetValue(preset, key, fallback));
  return { name: t(...NAMES[preset]), description: t(...description) };
}
