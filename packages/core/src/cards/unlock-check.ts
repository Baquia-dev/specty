// SPDX-License-Identifier: Apache-2.0
// What is checked of an approved unlock (ADR 0014): `specty task done` takes each unlocked test
// only as its approved patch leaves it, and Specty rejects an unlock whose patch no longer holds
// when the person approves it.
import type { Lang } from "../i18n";
import { type Output, section } from "../output";
import { cappedLines, translator } from "./text";
import { type UnlockPatchRefusal, unlockHow, unlockProblem } from "./unlock";
import type { CardContext } from "./view";

/** The lines of each difference the card shows; it says how many it leaves out. */
const MISMATCH_DIFF_LINES = 40;

/** An unlocked test that `task done` does not take as its approved patch leaves it. */
export type UnlockMismatch =
  /** `diff` goes from what the patch leaves (`-`) to the test as it is (`+`), from its first hunk. */
  | {
      readonly kind: "different";
      readonly path: string;
      readonly request: string;
      readonly diff: readonly string[];
    }
  /** The patch deletes it, and it is still there. */
  | { readonly kind: "kept"; readonly path: string; readonly request: string }
  /** The patch keeps it, and it is gone. */
  | { readonly kind: "missing"; readonly path: string; readonly request: string }
  /**
   * Its version in the last commit is not the locked one or, with `detail` (what `git apply`
   * says), the patch does not apply to it.
   */
  | {
      readonly kind: "unverifiable";
      readonly path: string;
      readonly request: string;
      readonly detail?: string;
    };

/** A `task done` that completes nothing: an unlocked test is not as its approved patch leaves it. */
export function unlockMismatchCard(
  mismatches: readonly UnlockMismatch[],
  task: string,
  header: string,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const differences = mismatches.flatMap((mismatch) =>
    mismatch.kind === "different"
      ? section(
          t(
            `DIFERENCIA CON EL PARCHE DE ${mismatch.request} (${mismatch.path})`,
            `DIFFERENCE FROM THE PATCH OF ${mismatch.request} (${mismatch.path})`,
          ),
          cappedLines(mismatch.diff, MISMATCH_DIFF_LINES, ctx.lang),
        )
      : [],
  );
  const legend =
    differences.length > 0
      ? [
          t(
            "En cada diferencia, `-` es como lo deja el parche y `+`, como está.",
            "In each difference, `-` is how the patch leaves it and `+`, how it is.",
          ),
        ]
      : [];
  const lines = [...mismatches.map((mismatch) => mismatchLine(mismatch, ctx.lang)), ...legend];
  return {
    status: "blocked",
    header,
    blocks: [...section(undefined, lines), ...differences],
    next: mismatchNext(mismatches, task, ctx),
  };
}

/** What is wrong with one unlocked test. */
function mismatchLine(mismatch: UnlockMismatch, lang: Lang): string {
  const t = translator(lang);
  const { path, request } = mismatch;
  switch (mismatch.kind) {
    case "different":
      return t(
        `\`${path}\` no quedó como lo deja el parche aprobado en ${request}.`,
        `\`${path}\` is not as the patch approved in ${request} leaves it.`,
      );
    case "kept":
      return t(
        `\`${path}\` sigue ahí, y el parche aprobado en ${request} lo borra.`,
        `\`${path}\` is still there, and the patch approved in ${request} deletes it.`,
      );
    case "missing":
      return t(
        `\`${path}\` ya no está, y el parche aprobado en ${request} no lo borra.`,
        `\`${path}\` is gone, and the patch approved in ${request} does not delete it.`,
      );
    case "unverifiable":
      return mismatch.detail === undefined
        ? t(
            `Specty no puede comprobar \`${path}\`: su versión en el último commit no es la que se bloqueó.`,
            `Specty cannot check \`${path}\`: its version in the last commit is not the one that was locked.`,
          )
        : t(
            `Specty no puede comprobar \`${path}\`: el parche aprobado en ${request} no se aplica a su versión bloqueada, y \`git apply\` dice «${mismatch.detail}».`,
            `Specty cannot check \`${path}\`: the patch approved in ${request} does not apply to its locked version, and \`git apply\` says "${mismatch.detail}".`,
          );
  }
}

/** Leave each test as its patch, or ask for another unlock; without a locked version, stop. */
function mismatchNext(mismatches: readonly UnlockMismatch[], task: string, ctx: CardContext) {
  const t = translator(ctx.lang);
  if (mismatches.some((mismatch) => mismatch.kind === "unverifiable")) {
    return t(
      `para y explícaselo al usuario: Specty no completa ${task} sin comprobar cada test desbloqueado sobre su versión bloqueada.`,
      `stop and explain it to the user: Specty does not complete ${task} without checking each unlocked test against its locked version.`,
    );
  }
  const paths = [...new Set(mismatches.map((mismatch) => mismatch.path))];
  const how = unlockHow(paths, task, ctx.lang, ctx.command);
  const done = `\`${ctx.command} task done ${task}\``;
  return t(
    `deja cada test como lo deja su parche y vuelve a ejecutar ${done}. Si el parche no basta, vuelve a dejar el test como se bloqueó (\`git show HEAD:<ruta>\`) y pide otro desbloqueo con el cambio completo, que sustituye al anterior: \`${how.command}\`.`,
    `leave each test as its patch leaves it and run ${done} again. If the patch is not enough, put the test back as it was locked (\`git show HEAD:<path>\`) and ask for another unlock with the whole change, which replaces the previous one: \`${how.command}\`.`,
  );
}

/** What `scope.decided` keeps when Specty rejects an unlock whose patch no longer holds. */
export function unlockStaleReason(refusal: UnlockPatchRefusal, lang: Lang): string {
  const t = translator(lang);
  const why = t(
    "Su parche ya no valía al aprobarla.",
    "Its patch no longer held when it was approved.",
  );
  return [why, ...unlockProblem(refusal, lang)].join(" ");
}

/** The person approved an unlock whose patch no longer holds: Specty rejected it instead. */
export function unlockStaleCard(
  header: string,
  request: string,
  refusal: UnlockPatchRefusal,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "blocked",
    header,
    blocks: section(undefined, [
      ...unlockProblem(refusal, ctx.lang),
      t(
        `Specty rechazó ${request}: su parche ya no vale para la versión bloqueada del test.`,
        `Specty rejected ${request}: its patch no longer holds for the locked version of the test.`,
      ),
    ]),
    next: t(
      "pídele a tu agente que deje el test como se bloqueó y vuelva a pedir el desbloqueo.",
      "ask your agent to put the test back as it was locked and ask for the unlock again.",
    ),
  };
}
