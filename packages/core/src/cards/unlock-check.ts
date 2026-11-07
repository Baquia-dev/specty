// SPDX-License-Identifier: Apache-2.0
// What is checked of an approved unlock (ADR 0014): `specty task done` takes each unlocked test
// only as its approved patch leaves it, `specty integrate` takes each approved test only as it
// was approved, as git merges it with the main branch's or as its unlock's patch leaves it, and
// Specty rejects an unlock whose patch no longer holds when the person approves it.
import type { Lang } from "../i18n";
import { type Output, type OutputBlock, section } from "../output";
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
  return {
    status: "blocked",
    header,
    blocks: mismatchBlocks(mismatches, ctx),
    next: mismatchNext(mismatches, task, ctx),
  };
}

/** What `specty integrate` finds of the approved tests while the main branch is incorporated. */
export interface IncorporationLocked {
  /** Changed without the person's unlock: neither as approved nor as git merges them. */
  readonly changed: readonly string[];
  /** Unlocked for the incorporation, and not as their approved patch leaves them. */
  readonly mismatches: readonly UnlockMismatch[];
}

/** Why `specty integrate` does not commit the merge of `target`: what to show, and what to do. */
export function lockedIncorporationProblem(
  found: IncorporationLocked,
  target: string,
  ctx: CardContext,
): { readonly reason: string; readonly details: readonly OutputBlock[]; readonly next: string } {
  const t = translator(ctx.lang);
  const mismatches = mismatchBlocks(found.mismatches, ctx);
  if (found.changed.length === 0) {
    return {
      reason: t(
        "Un test desbloqueado para la incorporación no quedó como lo deja su parche.",
        "A test unlocked for the incorporation is not as its patch leaves it.",
      ),
      details: mismatches,
      next: mismatchNext(found.mismatches, undefined, ctx),
    };
  }
  const how = unlockHow(found.changed, undefined, ctx.lang, ctx.command);
  const again = `\`${ctx.command} integrate\``;
  return {
    reason: t(
      `La incorporación de ${target} cambió tests aprobados sin el desbloqueo de la persona: solo pueden quedar como se aprobaron o como git los funde con los de ${target}, con cada conflicto resuelto tomando un lado o los dos.`,
      `The incorporation of ${target} changed approved tests without the person's unlock: they may only stay as they were approved or as git merges them with ${target}'s, with each conflict resolved taking one side or both.`,
    ),
    details: [...section(t("TESTS APROBADOS", "APPROVED TESTS"), found.changed), ...mismatches],
    next: t(
      `deja cada uno como se aprobó (\`git show HEAD:<ruta>\`) o, si ${target} también lo cambió, como lo funde git, y vuelve a ejecutar ${again}. Si con lo que trae ${target} el test tiene que cambiar, pide su desbloqueo sin abortar el merge, con el parche desde su versión aprobada: \`${how.command}\`, que solo decide la persona. ${how.options}`,
      `leave each one as it was approved (\`git show HEAD:<path>\`) or, if ${target} changed it too, as git merges it, and run ${again} again. If the test has to change with what ${target} brings, ask for its unlock without aborting the merge, with the patch from its approved version: \`${how.command}\`, which only the person decides. ${how.options}`,
    ),
  };
}

/** What is wrong with each unlocked test and, for one that differs, the difference. */
function mismatchBlocks(mismatches: readonly UnlockMismatch[], ctx: CardContext): OutputBlock[] {
  if (mismatches.length === 0) return [];
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
  return [...section(undefined, lines), ...differences];
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

/**
 * Leave each test as its patch, or ask for another unlock; without a locked version, stop. Without
 * a task, for the incorporation of the main branch, which `specty integrate` commits.
 */
function mismatchNext(
  mismatches: readonly UnlockMismatch[],
  task: string | undefined,
  ctx: CardContext,
) {
  const t = translator(ctx.lang);
  if (mismatches.some((mismatch) => mismatch.kind === "unverifiable")) {
    const finish =
      task === undefined
        ? t("hace el commit de la incorporación", "commit the incorporation")
        : t(`completa ${task}`, `complete ${task}`);
    return t(
      `para y explícaselo al usuario: Specty no ${finish} sin comprobar cada test desbloqueado sobre su versión bloqueada.`,
      `stop and explain it to the user: Specty does not ${finish} without checking each unlocked test against its locked version.`,
    );
  }
  const paths = [...new Set(mismatches.map((mismatch) => mismatch.path))];
  const how = unlockHow(paths, task, ctx.lang, ctx.command);
  const done = `\`${ctx.command} ${task === undefined ? "integrate" : `task done ${task}`}\``;
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
