// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { duration } from "./audit";
import { translator } from "./text";

// The texts of a full verification in units (`verify.units`): what each unit did.

/** A unit of the full verification that ran, and how long it took. */
export interface UnitTime {
  readonly name: string;
  readonly ms: number;
}

/** What the units of a full verification did, in order (formats.md §4, `change.verified`). */
export interface UnitsOutcome {
  /** Those that had passed already on this code, in this change or in another of the clone. */
  readonly reused: readonly string[];
  /** Those that ran and passed. */
  readonly passed: readonly UnitTime[];
  /** The one that failed, if one did: none after it ran. */
  readonly failed?: UnitTime;
  /** Those that did not run because an earlier one failed. */
  readonly skipped: readonly string[];
}

/** `cli (2 min 5 s), ui (41 s)`. */
const timed = (units: readonly UnitTime[]): string =>
  units.map(({ name, ms }) => `${name} (${duration(ms)})`).join(", ");

/**
 * What the units did, a line for each kind: those reused, those that ran and passed with their
 * time, the one that failed and those that did not run after it; a kind without units, no line.
 */
export function unitsLines(outcome: UnitsOutcome, lang: Lang): string[] {
  const t = translator(lang);
  const { reused, passed, failed, skipped } = outcome;
  const names = (units: readonly string[]) => units.join(", ");
  return [
    ...(reused.length === 0
      ? []
      : [
          t(
            `Reutilizadas (ya pasaron con este mismo código): ${names(reused)}.`,
            `Reused (they already passed on this same code): ${names(reused)}.`,
          ),
        ]),
    ...(passed.length === 0
      ? []
      : [t(`Ejecutadas y correctas: ${timed(passed)}.`, `Run and passed: ${timed(passed)}.`)]),
    ...(failed === undefined
      ? []
      : [t(`Falló: ${timed([failed])}.`, `Failed: ${timed([failed])}.`)]),
    ...(skipped.length === 0
      ? []
      : [
          t(
            `Sin ejecutar tras el fallo: ${names(skipped)}.`,
            `Not run after the failure: ${names(skipped)}.`,
          ),
        ]),
  ];
}

/** Every unit of the full verification already passed on this same code: none runs again. */
export function unitsReusedNote(
  names: readonly string[],
  lang: Lang,
): { readonly title: string; readonly text: string } {
  const t = translator(lang);
  const list = names.join(", ");
  return {
    title: t("Verificación completa", "Full verification"),
    text: t(
      `Todas las unidades ya pasaron con este mismo código, en este cambio o en otro del clon: ${list}. No se repite ninguna.`,
      `Every unit already passed on this same code, in this change or another of the clone: ${list}. None runs again.`,
    ),
  };
}
