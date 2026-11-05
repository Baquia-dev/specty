// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { MemoryEntry } from "../memory/entries";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { duration } from "./audit";
import { translator } from "./text";
import type { CardContext } from "./view";

// `specty verify --fresh`: every unit of the full verification, without the record of those that
// passed already, and each that fails run once more, to tell a flaky one from a real failure.

/** What became of a unit: it passed, it failed and passed when run again, or it failed twice. */
export type FreshResult = "passed" | "flaky" | "failed";

/** A unit of `verify.units`, or `verify.full` without units, which has no name. */
export interface FreshTarget {
  readonly name?: string;
  readonly command: string;
}

/** A unit after a fresh verification. */
export interface FreshUnit extends FreshTarget {
  readonly result: FreshResult;
  /** How long each attempt took: one, or two when the first failed. */
  readonly ms: readonly number[];
  /**
   * With a failure, the last lines of the output of the attempt that failed: the first when it
   * is flaky, the second when it failed twice.
   */
  readonly output: readonly string[];
}

/** What a fresh verification did. */
export interface FreshOutcome {
  readonly units: readonly FreshUnit[];
  /** The names of the units it put into the clone's record. */
  readonly recorded: readonly string[];
  /** The entries it left in the memory. */
  readonly remembered: readonly MemoryEntry[];
}

/** Why `specty verify` runs nothing: without `--fresh`, or with no full verification at all. */
export type FreshRefusal = { readonly reason: "no-flag" } | { readonly reason: "no-verification" };

/** How a fresh verification names a unit: its name, or `verify.full`. */
const labelOf = (target: FreshTarget): string => target.name ?? "verify.full";

/** The line before each attempt: what runs, or what runs once more after it failed. */
export function freshProgressLine(target: FreshTarget, again: boolean, lang: Lang): string {
  const t = translator(lang);
  const label = labelOf(target);
  const command = `\`${target.command}\``;
  return again
    ? t(
        `${label} falló: se repite una vez (${command})…`,
        `${label} failed: running it once more (${command})…`,
      )
    : t(`Ejecutando ${label} (${command})…`, `Running ${label} (${command})…`);
}

/**
 * What the memory keeps of a unit that did not pass at the first attempt, written for someone
 * without the conversation: a lesson of its files when it is flaky, a pending item when it failed
 * twice. It leaves out the output, so the same finding reads the same and is not added twice.
 */
export function freshMemoryText(
  target: FreshTarget,
  result: Exclude<FreshResult, "passed">,
  lang: Lang,
): string {
  const t = translator(lang);
  const command = target.command;
  const whose =
    target.name === undefined
      ? t(`La verificación completa (\`${command}\`)`, `The full verification (\`${command}\`)`)
      : t(
          `La unidad \`${target.name}\` de la verificación completa (\`${command}\`)`,
          `Unit \`${target.name}\` of the full verification (\`${command}\`)`,
        );
  if (result === "failed")
    return target.name === undefined
      ? t(
          `${whose} falló dos veces seguidas en una verificación fresca. Arréglala.`,
          `${whose} failed twice in a row in a fresh verification. Fix it.`,
        )
      : t(
          `${whose} falló dos veces seguidas en una verificación fresca. Arréglala; si el fallo no es del código, revisa su comando y sus \`paths\` en \`.specty/config.yaml\`.`,
          `${whose} failed twice in a row in a fresh verification. Fix it; if the failure is not in the code, review its command and its \`paths\` in \`.specty/config.yaml\`.`,
        );
  const flaky = t(
    `${whose} falló y pasó al repetirla en una verificación fresca: tiene tests inestables.`,
    `${whose} failed and passed when run again in a fresh verification: it has flaky tests.`,
  );
  return target.name === undefined
    ? `${flaky} ${t("Búscalos y arréglalos.", "Find them and fix them.")}`
    : `${flaky} ${t(
        "Si falla en un cambio que toca sus archivos, repítela antes de buscar el error en el cambio, y arregla el test inestable cuando des con él.",
        "If it fails in a change that touches its files, run it again before looking for the error in the change, and fix the flaky test once you find it.",
      )}`;
}

/**
 * `specty verify --fresh`: the result and the time of each unit, the output of each failure, the
 * units it put into the record and the entries it left in the memory. It fails when a unit
 * failed twice.
 */
export function freshCard(outcome: FreshOutcome, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { units, recorded } = outcome;
  const failed = units.filter(({ result }) => result === "failed").map(labelOf);
  const record =
    recorded.length === 0
      ? []
      : [
          t(
            `Anotadas en el registro del clon, no se repiten con este código: ${recorded.join(", ")}.`,
            `Put into the clone's record, they do not run again on this code: ${recorded.join(", ")}.`,
          ),
        ];
  return {
    status: failed.length === 0 ? "ok" : "invalid",
    header: headerOf(t("verificación fresca", "fresh verification")),
    blocks: [
      ...section(
        t("VERIFICACIÓN FRESCA, SIN EL REGISTRO", "FRESH VERIFICATION, WITHOUT THE RECORD"),
        [...units.map((unit) => unitLine(unit, ctx.lang)), ...record],
      ),
      ...units.flatMap((unit) =>
        section(
          t(`SALIDA DEL FALLO DE ${labelOf(unit)}`, `OUTPUT OF THE FAILURE OF ${labelOf(unit)}`),
          unit.result === "passed" ? [] : unit.output,
        ),
      ),
      ...memoryBlock(outcome, ctx.lang),
    ],
    next:
      failed.length === 0
        ? t(`sigue con \`${ctx.command} next\`.`, `go on with \`${ctx.command} next\`.`)
        : t(
            `corrige el fallo de ${failed.join(", ")} (su salida está arriba) y vuelve a ejecutar \`${ctx.command} verify --fresh\`.`,
            `fix the failure of ${failed.join(", ")} (its output is above) and run \`${ctx.command} verify --fresh\` again.`,
          ),
  };
}

/** `b · inestable: falló y pasó al repetirla · 3 s + 2 s`. */
function unitLine(unit: FreshUnit, lang: Lang): string {
  const t = translator(lang);
  const result = {
    passed: t("correcta", "passed"),
    flaky: t("inestable: falló y pasó al repetirla", "flaky: failed and passed when run again"),
    failed: t("falló las dos veces", "failed twice"),
  }[unit.result];
  return `${labelOf(unit)} · ${result} · ${unit.ms.map(duration).join(" + ")}`;
}

/**
 * The entries the fresh verification left in the memory, each with the unit it is about: the one
 * whose text it has. None, no block.
 */
function memoryBlock(outcome: FreshOutcome, lang: Lang): OutputBlock[] {
  const t = translator(lang);
  const lines = outcome.units.flatMap((unit) => {
    if (unit.result === "passed") return [];
    const text = freshMemoryText(unit, unit.result, lang);
    const entry = outcome.remembered.find((remembered) => remembered.text.trim() === text);
    if (entry === undefined) return [];
    const kind = entry.kind === "lesson" ? t("lección", "lesson") : t("pendiente", "pending");
    return [`${entry.id} · ${kind} · ${labelOf(unit)}`];
  });
  return section(t("EN LA MEMORIA", "IN THE MEMORY"), lines);
}

/** Why `specty verify` ran nothing, and what to run instead. */
export function freshRefusalCard(refusal: FreshRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { command } = ctx;
  const [reason, next] =
    refusal.reason === "no-flag"
      ? [
          t(
            `\`${command} verify\` solo ejecuta, por ahora, la verificación fresca: todas las unidades, sin el registro de las que ya pasaron.`,
            `\`${command} verify\` only runs, for now, the fresh verification: every unit, without the record of those that passed.`,
          ),
          t(`ejecuta \`${command} verify --fresh\`.`, `run \`${command} verify --fresh\`.`),
        ]
      : [
          t(
            "No hay verificación completa que ejecutar: `.specty/config.yaml` no da `verify.full` ni `verify.units`.",
            "There is no full verification to run: `.specty/config.yaml` gives neither `verify.full` nor `verify.units`.",
          ),
          t(
            "define `verify.full` o `verify.units` en `.specty/config.yaml` (docs/formats.md §6) y vuelve a ejecutarlo.",
            "set `verify.full` or `verify.units` in `.specty/config.yaml` (docs/formats.md §6) and run it again.",
          ),
        ];
  return { status: "invalid", header: headerOf(), blocks: section(undefined, [reason]), next };
}
