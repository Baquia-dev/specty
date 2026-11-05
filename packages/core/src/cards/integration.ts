// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { runNext, type Translate, translator } from "./text";
import type { UnitsOutcome } from "./units";
import type { CardContext, ChangeView, IntegrationView } from "./view";

// Bringing the main branch into a change before it closes (ARCHITECTURE §9): what `next` shows
// while the merge waits, what `close` or `accept` says when it cannot finish it, and `integrate`.

/** How many of the files the agent may touch the card lists. */
const LISTED_PATHS = 20;

/** `incorporando main`, for the header while the merge waits. */
export function mergingLabel(target: string, lang: Lang): string {
  return translator(lang)(`incorporando ${target}`, `merging ${target}`);
}

/** The title of each kind of detail a refused incorporation lists. */
export function incorporationTitle(
  of: "conflicts" | "markers" | "outside" | "uncommitted" | "verification",
  lang: Lang,
): string {
  const t = translator(lang);
  switch (of) {
    case "conflicts":
      return t("CONFLICTOS", "CONFLICTS");
    case "markers":
      return t("CON MARCADORES", "WITH MARKERS");
    case "outside":
      return t("FUERA", "OUTSIDE");
    case "uncommitted":
      return t("SIN COMMIT", "UNCOMMITTED");
    case "verification":
      return t("SALIDA DE LA VERIFICACIÓN", "VERIFICATION OUTPUT");
  }
}

/**
 * `specty next` while bringing the main branch into the change waits for the agent: the merge is
 * in progress in this folder, with conflicts or with a failing verification (ARCHITECTURE §9).
 */
export function integrationCard(
  change: ChangeView,
  integration: IntegrationView,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const { target, paths } = integration;
  const conflicts = integration.reason === "conflicts";
  const rest = paths.length - LISTED_PATHS;
  return {
    status: "ok",
    header: headerOf(change.id, change.phase, mergingLabel(target, ctx.lang)),
    blocks: [
      ...section(undefined, [
        conflicts
          ? t(
              `Incorporar ${target} a este cambio dio conflictos; el merge espera en esta carpeta.`,
              `Bringing ${target} into this change hit conflicts; the merge waits in this folder.`,
            )
          : t(
              `Con ${target} incorporado, la verificación falla; el merge espera en esta carpeta.`,
              `With ${target} merged in, the verification fails; the merge waits in this folder.`,
            ),
      ]),
      ...section(incorporationTitle("conflicts", ctx.lang), integration.conflicts),
      ...section(t("PUEDES TOCAR", "YOU MAY TOUCH"), [
        ...paths.slice(0, LISTED_PATHS),
        ...(rest > 0 ? [t(`y ${rest} más`, `and ${rest} more`)] : []),
      ]),
    ],
    next: conflicts
      ? t(
          `resuelve los conflictos sin dejar marcadores (\`<<<<<<<\`) y ejecuta \`${ctx.command} integrate\`.`,
          `resolve the conflicts without leaving markers (\`<<<<<<<\`) and run \`${ctx.command} integrate\`.`,
        )
      : t(
          `arregla lo que falla y ejecuta \`${ctx.command} integrate\`.`,
          `fix what fails and run \`${ctx.command} integrate\`.`,
        ),
  };
}

/** The main branch is checked out in `holder`, which has uncommitted changes. */
export function holderDirtyLine(target: string, holder: string, lang: Lang): string {
  return translator(lang)(
    `${target} está en ${holder}, que tiene cambios sin commit: avanzarla podría pisarlos.`,
    `${target} is checked out in ${holder}, which has uncommitted changes: moving it could overwrite them.`,
  );
}

export function holderDirtyNext(
  holder: string,
  again: "close" | "accept",
  ctx: CardContext,
): string {
  return translator(ctx.lang)(
    `guarda o descarta esos cambios en ${holder} y vuelve a ejecutar \`${ctx.command} ${again}\`.`,
    `commit or discard those changes in ${holder} and run \`${ctx.command} ${again}\` again.`,
  );
}

/** The main branch changed files with uncommitted changes in the change's folder: no merge. */
export function uncommittedOverlapLine(target: string, lang: Lang): string {
  return translator(lang)(
    `${target} también cambió archivos que aquí tienen cambios sin commit: el merge los pisaría, así que no empezó.`,
    `${target} also changed files with uncommitted changes here: the merge would overwrite them, so it did not start.`,
  );
}

/** Of those files, the ones Specty manages: the guard does not let the agent edit them. */
export function personOnlyLine(paths: readonly string[], lang: Lang): string {
  const list = paths.join(", ");
  return translator(lang)(
    `Solo la persona puede hacer el commit de los cambios de ${list} o descartarlos: el guard no deja que el agente edite lo que gestiona Specty.`,
    `Only the person can commit or discard the changes to ${list}: the guard does not let the agent edit what Specty manages.`,
  );
}

/**
 * Those files get committed or their changes discarded, and then `again` runs. In delegated mode
 * the agent reads this: it does not make commits, so it asks the person, and then runs `again`.
 */
export function commitOrDiscardNext(again: "close" | "accept", ctx: CardContext): string {
  const t = translator(ctx.lang);
  const run = `\`${ctx.command} ${again}\``;
  return ctx.delegated === true
    ? t(
        `modo delegado: pide al usuario que haga el commit de esos archivos o descarte sus cambios en esta carpeta (tú no haces commits) y, cuando lo haga, vuelve a ejecutar tú ${run}.`,
        `delegated mode: ask the user to commit those files or discard their changes in this folder (you do not make commits), and once they do, run ${run} again yourself.`,
      )
    : t(
        `haz el commit de esos archivos o descarta sus cambios en esta carpeta y vuelve a ejecutar ${run}.`,
        `commit those files or discard their changes in this folder and run ${run} again.`,
      );
}

/** When the merge cannot wait for the agent: the person does it by hand. */
export function mergeByHandNext(
  target: string,
  again: "close" | "accept",
  ctx: CardContext,
): string {
  return translator(ctx.lang)(
    `incorpora ${target} a mano en esta carpeta (\`git merge ${target}\`, resuelve y haz el commit) y vuelve a ejecutar \`${ctx.command} ${again}\`.`,
    `merge ${target} by hand in this folder (\`git merge ${target}\`, resolve and commit) and run \`${ctx.command} ${again}\` again.`,
  );
}

export function targetConflictsLine(target: string, lang: Lang): string {
  return translator(lang)(
    `${target} choca con este cambio.`,
    `${target} conflicts with this change.`,
  );
}

/** The merge failed for another reason than conflicts: `detail` is git's last line. */
export function mergeFailedLine(target: string, detail: string, lang: Lang): string {
  return translator(lang)(
    `No se pudo incorporar ${target} a este cambio: ${detail}`,
    `Could not bring ${target} into this change: ${detail}`,
  );
}

export function mergedVerifyFailsLine(target: string, command: string, lang: Lang): string {
  return translator(lang)(
    `Con ${target} incorporado, \`${command}\` falla.`,
    `With ${target} merged in, \`${command}\` fails.`,
  );
}

/** The configuration that came with `target` is not valid, as `issues` says: the merge was undone. */
export function mergedConfigInvalidLine(target: string, issues: string, lang: Lang): string {
  return translator(lang)(
    `Con ${target} incorporado, .specty/config.yaml no es válida: ${issues}.`,
    `With ${target} merged in, .specty/config.yaml is not valid: ${issues}.`,
  );
}

/**
 * Only the person fixes the configuration, in `target`: the guard does not let an agent edit it.
 * In delegated mode the agent reads this, so it asks them, and then runs `again` itself.
 */
export function mergedConfigNext(
  target: string,
  again: "close" | "accept",
  ctx: CardContext,
): string {
  const t = translator(ctx.lang);
  const run = `\`${ctx.command} ${again}\``;
  return ctx.delegated === true
    ? t(
        `modo delegado: el usuario corrige .specty/config.yaml en ${target} (el guard no te deja editarla): pídeselo con el error de arriba y, cuando lo haga, vuelve a ejecutar tú ${run}.`,
        `delegated mode: the user fixes .specty/config.yaml in ${target} (the guard does not let you edit it): ask them, with the error above, and once they do, run ${run} again yourself.`,
      )
    : t(
        `corrige .specty/config.yaml en ${target} y vuelve a ejecutar ${run}.`,
        `fix .specty/config.yaml in ${target} and run ${run} again.`,
      );
}

/** What checked the merge: the full verification, nothing for an epic, or nothing configured. */
export type MergeVerification =
  /** With `verify.units`, also what each unit did. */
  | { readonly kind: "passed"; readonly command: string; readonly units?: UnitsOutcome }
  | { readonly kind: "epic" }
  | { readonly kind: "none" }
  /** The change touches no code, only free files: the merged code is the target's. */
  | { readonly kind: "no-code" };

/** The main branch came into the change: its merge, and what verified it. */
export function absorbedLine(
  target: string,
  commit: string,
  verification: MergeVerification,
  lang: Lang,
): string {
  const t = translator(lang);
  const unverified: Record<Exclude<MergeVerification["kind"], "passed">, string> = {
    epic: t(
      " sin verificar: una épica no tiene código propio",
      " without a verification: an epic has no code of its own",
    ),
    none: t(
      " sin verificar: .specty/config.yaml no tiene `verify.full` ni `verify.default`",
      " without a verification: .specty/config.yaml has neither `verify.full` nor `verify.default`",
    ),
    "no-code": t(
      ` sin verificar: el cambio no toca código, así que el código es el de ${target}`,
      ` without a verification: the change touches no code, so the code is ${target}'s`,
    ),
  };
  const verified =
    verification.kind === "passed" ? passedText(verification, t) : unverified[verification.kind];
  return t(
    `Antes, ${target} se incorporó a la rama del cambio (merge ${commit})${verified}.`,
    `First, ${target} was merged into the change's branch (merge ${commit})${verified}.`,
  );
}

/** How the full verification passed: its command or, with `verify.units`, its units. */
function passedText(
  verification: Extract<MergeVerification, { kind: "passed" }>,
  t: Translate,
): string {
  const { command, units } = verification;
  return units === undefined
    ? t(` y \`${command}\` pasó`, ` and \`${command}\` passed`)
    : t(
        " y pasaron las unidades de su verificación completa",
        " and the units of its full verification passed",
      );
}

/**
 * What did not happen, by phase: not closed, not accepted (quick) or not merged (a closed
 * change); with nothing changed, or with the merge waiting for the agent in this folder.
 */
export function notYetLine(phase: Phase, outcome: "unchanged" | "waiting", lang: Lang): string {
  const t = translator(lang);
  const notYet =
    phase === "done"
      ? t("No se incorporó", "Not merged")
      : phase === "acceptance"
        ? t("No se aceptó", "Not accepted")
        : t("No se cerró", "Not closed");
  return outcome === "unchanged"
    ? t(`${notYet} y nada cambió.`, `${notYet}, and nothing changed.`)
    : t(
        `${notYet}: el merge queda en esta carpeta para que lo resuelva el agente.`,
        `${notYet}: the merge waits in this folder for the agent to resolve it.`,
      );
}

/**
 * What comes next while an incorporation waits for the agent: the person tells the agent to go
 * on, or, in delegated mode, the agent resolves it itself and then runs `again`.
 */
export function resolveIncorporationNext(again: "close" | "accept", ctx: CardContext): string {
  const t = translator(ctx.lang);
  const { command } = ctx;
  return ctx.delegated === true
    ? t(
        `modo delegado: resuélvela tú (\`${command} next\` te dice qué falta), termínala con \`${command} integrate\` y vuelve a ejecutar \`${command} ${again}\`.`,
        `delegated mode: resolve it yourself (\`${command} next\` says what is missing), finish it with \`${command} integrate\` and run \`${command} ${again}\` again.`,
      )
    : t(
        `dile a tu agente «continúa» (ejecutará \`${command} next\`); cuando termine, vuelve a ejecutar \`${command} ${again}\`.`,
        `tell your agent "continue" (it will run \`${command} next\`); when it is done, run \`${command} ${again}\` again.`,
      );
}

export function stillResolvingLine(target: string, lang: Lang): string {
  return translator(lang)(
    `El agente aún resuelve la incorporación de ${target} en esta carpeta.`,
    `The agent is still resolving the incorporation of ${target} in this folder.`,
  );
}

/** `specty integrate` with no merge left by a closing in this folder. */
export function noIncorporationCard(header: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    header,
    t("No hay ninguna incorporación pendiente.", "There is no pending incorporation."),
    runNext(ctx),
  );
}

export function integrateRetry(ctx: CardContext): string {
  return translator(ctx.lang)(
    `corrígelo y vuelve a ejecutar \`${ctx.command} integrate\`.`,
    `fix it and run \`${ctx.command} integrate\` again.`,
  );
}

export function mergeAbortedLine(lang: Lang): string {
  return translator(lang)(
    "El merge ya no está en curso: alguien lo abortó.",
    "The merge is no longer in progress: someone aborted it.",
  );
}

export function markersLeftLine(lang: Lang): string {
  return translator(lang)("Quedan marcadores de conflicto.", "Conflict markers are left.");
}

export function outsideIncorporationLine(target: string, lang: Lang): string {
  return translator(lang)(
    `Hay cambios fuera de la incorporación de ${target}.`,
    `There are changes outside the incorporation of ${target}.`,
  );
}

export function undoOutsideNext(ctx: CardContext): string {
  return translator(ctx.lang)(
    `deshaz esos cambios y vuelve a ejecutar \`${ctx.command} integrate\`.`,
    `undo those changes and run \`${ctx.command} integrate\` again.`,
  );
}

export function commandFailsLine(command: string, lang: Lang): string {
  return translator(lang)(`\`${command}\` falla.`, `\`${command}\` fails.`);
}

export function integrationResolvedLine(target: string, commit: string, lang: Lang): string {
  return translator(lang)(
    `Incorporación de ${target} resuelta (merge ${commit}).`,
    `Incorporation of ${target} resolved (merge ${commit}).`,
  );
}

/** Who runs `again` once the merge is done: the person, or the agent itself in delegated mode. */
export function runAgainNext(again: "close" | "accept", ctx: CardContext): string {
  const t = translator(ctx.lang);
  return ctx.delegated === true
    ? t(
        `modo delegado: vuelve a ejecutar tú \`${ctx.command} ${again}\` y sigue su salida.`,
        `delegated mode: run \`${ctx.command} ${again}\` again yourself and follow its output.`,
      )
    : t(
        `pide al usuario que vuelva a ejecutar \`${ctx.command} ${again}\` y ejecuta \`${ctx.command} wait\` para esperar su decisión.`,
        `ask the user to run \`${ctx.command} ${again}\` again and run \`${ctx.command} wait\` to wait for their decision.`,
      );
}
