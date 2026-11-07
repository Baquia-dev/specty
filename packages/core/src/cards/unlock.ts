// SPDX-License-Identifier: Apache-2.0
// The unlock of an approved test (ADR 0014): the full command that asks for it, with the patch
// and the evidence it needs, and why `specty scope add` refuses one.
import { counted, type Lang } from "../i18n";
import { type Output, section } from "../output";
import { UNLOCK_LIMITS } from "../schema/state";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * The full command that asks to unlock `paths` for `task`, and what its options are; without a
 * task, as during an incorporation of the main branch, it goes without `--task`.
 */
export function unlockHow(
  paths: readonly string[],
  task: string | undefined,
  lang: Lang,
  command: string,
): { readonly command: string; readonly options: string } {
  const t = translator(lang);
  const { evidence, evidenceLines } = UNLOCK_LIMITS;
  return {
    command: t(
      `${scopeAdd(paths, task, command, "motivo")} --patch <parche> --evidence <ruta>:<desde>-<hasta>`,
      `${scopeAdd(paths, task, command, "reason")} --patch <patch> --evidence <path>:<from>-<to>`,
    ),
    options: t(
      `\`--patch\` es el cambio exacto que harás al test: un diff unificado, como lo escribe \`git diff\`, con las rutas \`a/<ruta>\` y \`b/<ruta>\`, en un archivo o, con \`--patch -\`, por la entrada estándar; también puede borrarlo. \`--evidence\` son las líneas que lo justifican, de código, de otro test o de la spec, en un archivo que git sigue: de 1 a ${evidence}, de ${evidenceLines} líneas como máximo cada una.`,
      `\`--patch\` is the exact change you will make to the test: a unified diff, as \`git diff\` writes it, with the paths \`a/<path>\` and \`b/<path>\`, in a file or, with \`--patch -\`, on standard input; it may also delete it. \`--evidence\` is the lines that justify it, of code, of another test or of the spec, in a file git tracks: from 1 to ${evidence}, of ${evidenceLines} lines at most each.`,
    ),
  };
}

/** `scope add` of `paths` for `task`, if any, with its reason to fill. */
function scopeAdd(
  paths: readonly string[],
  task: string | undefined,
  command: string,
  reason: string,
) {
  const of = task === undefined ? "" : ` --task ${task}`;
  return `${command} scope add ${paths.join(" ")}${of} --reason "<${reason}>"`;
}

/** The request `scope add` refuses: its task, none during an incorporation, and every path. */
export interface UnlockAsked {
  readonly task: string | undefined;
  readonly paths: readonly string[];
}

/** Why `specty scope add` does not ask to unlock an approved test. */
export type UnlockRefusal =
  /** Without `--patch`, without any `--evidence`, or without both. */
  | { readonly reason: "incomplete"; readonly missing: readonly ("patch" | "evidence")[] }
  /** `--patch` or `--evidence` on a request that unlocks no approved test. */
  | { readonly reason: "not-unlock" }
  | { readonly reason: "patch-unreadable"; readonly file: string }
  | { readonly reason: "patch-too-long"; readonly lines: number }
  /** `git apply` reads no diff in it: `detail` is what it says. */
  | { readonly reason: "patch-invalid"; readonly detail: string }
  /** The files it touches that are not the tests the request unlocks. */
  | { readonly reason: "patch-other-files"; readonly paths: readonly string[] }
  /** The tests that are no longer as they were locked, the version the patch is checked against. */
  | { readonly reason: "patch-changed"; readonly paths: readonly string[] }
  | { readonly reason: "patch-not-applying"; readonly detail: string }
  | { readonly reason: "evidence-too-many"; readonly count: number }
  /** Not `<path>:<from>-<to>`, with the first line from 1 and before the last. */
  | { readonly reason: "evidence-format"; readonly evidence: string }
  | { readonly reason: "evidence-too-long"; readonly evidence: string; readonly lines: number }
  | { readonly reason: "evidence-untracked"; readonly evidence: string; readonly path: string }
  /** Its file has fewer `lines` than it names. */
  | {
      readonly reason: "evidence-lines";
      readonly evidence: string;
      readonly path: string;
      readonly lines: number;
    };

/** A `specty scope add` that asks for no unlock: an invalid input, with how to ask again. */
export function unlockRefusalCard(
  refusal: UnlockRefusal,
  asked: UnlockAsked,
  header: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const how = unlockHow(asked.paths, asked.task, ctx.lang, ctx.command);
  if (refusal.reason === "incomplete") {
    return invalidCard(
      header,
      [missingLine(refusal.missing, ctx.lang), how.options],
      t(`pídelo con \`${how.command}\`.`, `ask for it with \`${how.command}\`.`),
    );
  }
  if (refusal.reason === "not-unlock") {
    const plain = (reason: string) => scopeAdd(asked.paths, asked.task, ctx.command, reason);
    return invalidCard(
      header,
      [
        t(
          "`--patch` y `--evidence` son solo para desbloquear un test aprobado, y ninguna de esas rutas lo es.",
          "`--patch` and `--evidence` are only for unlocking an approved test, and none of those paths is one.",
        ),
      ],
      t(
        `pídelo sin ellos: \`${plain("motivo")}\`.`,
        `ask for it without them: \`${plain("reason")}\`.`,
      ),
    );
  }
  return invalidCard(
    header,
    unlockProblem(refusal, ctx.lang),
    t(
      `corrígelo y vuelve a pedirlo con \`${how.command}\`.`,
      `fix it and ask again with \`${how.command}\`.`,
    ),
  );
}

/** An input `scope add` does not take: what is wrong, and what to run. */
function invalidCard(header: string, lines: readonly string[], next: string): Output {
  return { status: "invalid", header, blocks: section(undefined, lines), next };
}

/** What an incomplete unlock lacks. */
function missingLine(missing: readonly ("patch" | "evidence")[], lang: Lang): string {
  const t = translator(lang);
  const options = missing.map((option) => `\`--${option}\``);
  return missing.length > 1
    ? t(
        `Para desbloquear un test aprobado faltan ${options.join(" y ")}.`,
        `Unlocking an approved test needs ${options.join(" and ")}.`,
      )
    : t(
        `Para desbloquear un test aprobado falta ${options.join("")}.`,
        `Unlocking an approved test needs ${options.join("")}.`,
      );
}

/** Why a patch does not do, as `scope add` checks it and the approval checks it again. */
export type UnlockPatchRefusal = Extract<UnlockRefusal, { readonly reason: `patch-${string}` }>;
type EvidenceRefusal = Extract<UnlockRefusal, { readonly reason: `evidence-${string}` }>;

/** Why a patch or a piece of evidence does not do: what `scope add` says, and the approval. */
export function unlockProblem(
  refusal: UnlockPatchRefusal | EvidenceRefusal,
  lang: Lang,
): readonly string[] {
  switch (refusal.reason) {
    case "patch-changed":
      return changedLines(refusal.paths, lang);
    case "evidence-too-many":
    case "evidence-format":
    case "evidence-too-long":
    case "evidence-untracked":
    case "evidence-lines":
      return [evidenceLine(refusal, lang)];
    default:
      return [patchLine(refusal, lang)];
  }
}

/** The tests that are not as they were locked, which the patch is checked against. */
function changedLines(paths: readonly string[], lang: Lang): readonly string[] {
  const t = translator(lang);
  return [
    ...paths.map((path) =>
      t(`\`${path}\` no está como se bloqueó.`, `\`${path}\` is not as it was locked.`),
    ),
    t(
      "El parche se comprueba sobre la versión que aprobó la persona: vuelve a dejar el test así.",
      "The patch is checked against the version the person approved: put the test back that way.",
    ),
  ];
}

/** Why a patch does not do. */
function patchLine(
  refusal: Exclude<UnlockPatchRefusal, { readonly reason: "patch-changed" }>,
  lang: Lang,
): string {
  const t = translator(lang);
  switch (refusal.reason) {
    case "patch-unreadable":
      return t(
        `No se puede leer el parche \`${refusal.file}\`.`,
        `The patch \`${refusal.file}\` cannot be read.`,
      );
    case "patch-too-long":
      return t(
        `El parche tiene ${refusal.lines} líneas, y el máximo es ${UNLOCK_LIMITS.patchLines}.`,
        `The patch has ${refusal.lines} lines, and the limit is ${UNLOCK_LIMITS.patchLines}.`,
      );
    case "patch-invalid":
      return t(
        `El parche no es un diff unificado: \`git apply\` dice «${refusal.detail}».`,
        `The patch is not a unified diff: \`git apply\` says "${refusal.detail}".`,
      );
    case "patch-other-files":
      return t(
        `El parche toca archivos que no son los tests que pides desbloquear: ${refusal.paths.join(", ")}.`,
        `The patch touches files that are not the tests you ask to unlock: ${refusal.paths.join(", ")}.`,
      );
    case "patch-not-applying":
      return t(
        `El parche no se aplica a la versión bloqueada del test: \`git apply\` dice «${refusal.detail}».`,
        `The patch does not apply to the locked version of the test: \`git apply\` says "${refusal.detail}".`,
      );
  }
}

/** Why a piece of evidence does not do, or why there are too many. */
function evidenceLine(refusal: EvidenceRefusal, lang: Lang): string {
  const t = translator(lang);
  switch (refusal.reason) {
    case "evidence-too-many":
      return t(
        `Hay ${refusal.count} \`--evidence\`, y el máximo es ${UNLOCK_LIMITS.evidence}.`,
        `There are ${refusal.count} \`--evidence\`, and the limit is ${UNLOCK_LIMITS.evidence}.`,
      );
    case "evidence-format":
      return t(
        `\`${refusal.evidence}\` no es una evidencia: escríbela como \`<ruta>:<desde>-<hasta>\`, con la primera línea antes que la última.`,
        `\`${refusal.evidence}\` is not evidence: write it as \`<path>:<from>-<to>\`, with the first line before the last.`,
      );
    case "evidence-too-long":
      return t(
        `\`${refusal.evidence}\` tiene ${refusal.lines} líneas, y el máximo es ${UNLOCK_LIMITS.evidenceLines}.`,
        `\`${refusal.evidence}\` has ${refusal.lines} lines, and the limit is ${UNLOCK_LIMITS.evidenceLines}.`,
      );
    case "evidence-untracked":
      return t(
        `\`${refusal.evidence}\`: git no sigue \`${refusal.path}\`, y la evidencia solo sale de archivos que git sigue, nunca de uno ignorado.`,
        `\`${refusal.evidence}\`: git does not track \`${refusal.path}\`, and evidence only comes from files git tracks, never from an ignored one.`,
      );
    case "evidence-lines":
      return t(
        `\`${refusal.evidence}\` no existe: \`${refusal.path}\` tiene ${counted(refusal.lines, "línea", "líneas")}.`,
        `\`${refusal.evidence}\` does not exist: \`${refusal.path}\` has ${counted(refusal.lines, "line", "lines")}.`,
      );
  }
}
