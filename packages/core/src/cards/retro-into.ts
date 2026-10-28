// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { type ScopeRequestDecided, scopeDecidedLine } from "./approve";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * The cards of `specty retro --into <id>` (ARCHITECTURE §9): staged code outside the active
 * change's scope, documented as a scope request of its active task.
 */

/** Why `retro --into` documents nothing. */
export type RetroIntoRefusal =
  | { readonly reason: "no-reason"; readonly id: string }
  /** `id` is not the folder's active change; `active` is, if there is one. */
  | { readonly reason: "not-active"; readonly id: string; readonly active?: string }
  | { readonly reason: "no-task"; readonly id: string; readonly phase: Phase }
  | { readonly reason: "with-minimal" }
  | { readonly reason: "nothing-outside"; readonly id: string; readonly phase: Phase };

/** The refusals of the command line itself, before any change is read. */
type CommandRefusal = Extract<RetroIntoRefusal, { reason: "no-reason" | "with-minimal" }>;

/** A `retro --into` that creates nothing, with the way on. */
export function retroIntoRefusalCard(refusal: RetroIntoRefusal, ctx: CardContext): Output {
  return refusal.reason === "no-reason" || refusal.reason === "with-minimal"
    ? commandRefusalCard(refusal, ctx)
    : changeRefusalCard(refusal, ctx);
}

function commandRefusalCard(refusal: CommandRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return refusal.reason === "no-reason"
    ? blockedCard(
        headerOf(),
        t("Falta el motivo de los cambios preparados.", "The staged changes need a reason."),
        t(
          `vuelve a ejecutar \`${intoCommand(refusal.id, ctx)}\`; si no lo sabes, pregúntaselo al usuario.`,
          `run \`${intoCommand(refusal.id, ctx)}\` again; if you do not know it, ask the user.`,
        ),
      )
    : blockedCard(
        headerOf(),
        t("`--into` y `--minimal` no van juntos.", "`--into` and `--minimal` do not go together."),
        t(
          `usa \`${intoCommand("<id>", ctx)}\` para ampliar el cambio activo, o \`${ctx.command} retro --minimal\` para documentarlo aparte.`,
          `use \`${intoCommand("<id>", ctx)}\` to widen the active change, or \`${ctx.command} retro --minimal\` to document it separately.`,
        ),
      );
}

/** The refusals about the change named: not this folder's, without an active task, or nothing to add. */
function changeRefusalCard(
  refusal: Exclude<RetroIntoRefusal, CommandRefusal>,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const separately = t(
    `documéntalo aparte con \`${ctx.command} retro\`.`,
    `document it separately with \`${ctx.command} retro\`.`,
  );
  switch (refusal.reason) {
    case "not-active":
      return blockedCard(
        headerOf(),
        t(
          `${refusal.id} no es el cambio activo de esta carpeta.`,
          `${refusal.id} is not this folder's active change.`,
        ),
        refusal.active === undefined
          ? separately
          : t(
              `ejecuta \`${intoCommand(refusal.active, ctx)}\`, o \`${ctx.command} retro\` para documentarlo aparte.`,
              `run \`${intoCommand(refusal.active, ctx)}\`, or \`${ctx.command} retro\` to document it separately.`,
            ),
      );
    case "no-task":
      return blockedCard(
        headerOf(refusal.id, refusal.phase),
        t(
          `\`--into\` necesita una tarea activa en implementing; ${refusal.id} está en ${refusal.phase}.`,
          `\`--into\` needs an active task in implementing; ${refusal.id} is in ${refusal.phase}.`,
        ),
        separately,
      );
    case "nothing-outside":
      return blockedCard(
        headerOf(refusal.id, refusal.phase),
        t(
          `No hay código gobernado preparado fuera del alcance de ${refusal.id}.`,
          `There is no staged governed code outside the scope of ${refusal.id}.`,
        ),
        t(
          "prepara los cambios con `git add`; lo que está dentro del alcance pasa con `git commit` como cambio manual.",
          "stage the changes with `git add`; what is inside the scope passes `git commit` as a manual change.",
        ),
      );
  }
}

/** The request is waiting: the person approves it, then commits again. */
export function retroIntoRequestedCard(
  header: string,
  request: string,
  paths: readonly string[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const approve = `${ctx.command} approve --scope ${request}`;
  return {
    status: "ok",
    header,
    blocks: section(
      t(
        `SOLICITUD ${request} (documenta lo preparado)`,
        `REQUEST ${request} (documents the staged changes)`,
      ),
      paths,
    ),
    next:
      ctx.delegated === true
        ? t(
            `modo delegado: aprueba tú la solicitud con \`${approve}\`; después pide al usuario que repita \`git commit\`.`,
            `delegated mode: approve the request yourself with \`${approve}\`, then ask the user to run \`git commit\` again.`,
          )
        : t(
            `pide al usuario que apruebe la solicitud con \`${approve}\` y que después repita \`git commit\`.`,
            `ask the user to approve the request with \`${approve}\` and then run \`git commit\` again.`,
          ),
  };
}

/**
 * The request is approved and the staged code documented in `change`. `byAgent`: the agent
 * approved it in delegated mode, and cannot run `git commit` itself.
 */
export function retroIntoApprovedCard(
  header: string,
  request: ScopeRequestDecided,
  change: string,
  byAgent: boolean,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: section(undefined, [
      scopeDecidedLine("approve", request, ctx.lang),
      t(
        `Lo preparado queda documentado en ${change} y preparado junto a tu commit.`,
        `The staged changes are documented in ${change} and staged with the commit.`,
      ),
    ]),
    next: byAgent
      ? t(
          `pide al usuario que vuelva a ejecutar \`git commit\`, y sigue con \`${ctx.command} next\`.`,
          `ask the user to run \`git commit\` again, and continue with \`${ctx.command} next\`.`,
        )
      : t("vuelve a ejecutar `git commit`.", "run `git commit` again."),
  };
}

/** Why Specty rejects a request whose staged code changed before its approval; the audit keeps it. */
export function retroIntoStaleReason(lang: Lang): string {
  return translator(lang)(
    "Lo preparado cambió desde la solicitud.",
    "The staged changes changed since the request.",
  );
}

/** The staged code changed after the request: Specty rejected it, and it must be asked again. */
export function retroIntoStaleCard(
  header: string,
  request: string,
  change: string,
  byAgent: boolean,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    header,
    t(
      `Lo preparado cambió desde que se pidió ${request}: Specty rechazó la solicitud.`,
      `The staged changes changed since ${request} was asked: Specty rejected the request.`,
    ),
    byAgent
      ? t(
          `vuelve a ejecutar \`${intoCommand(change, ctx)}\`.`,
          `run \`${intoCommand(change, ctx)}\` again.`,
        )
      : t(
          `pídele a tu agente: «Documenta los cambios preparados con ${ctx.command} retro --into ${change}».`,
          `ask your agent: "Document the staged changes with ${ctx.command} retro --into ${change}".`,
        ),
  );
}

function intoCommand(id: string, ctx: CardContext): string {
  const reason = translator(ctx.lang)("<motivo>", "<reason>");
  return `${ctx.command} retro --into ${id} --reason "${reason}"`;
}
