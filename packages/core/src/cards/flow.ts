// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import type { EffortRecommendation } from "../sizing/effort";
import type { SizeResult } from "../sizing/size";
import { formatSizeReason } from "../sizing/size";
import type { DeltaEntry } from "../spec/delta";
import type { Diagnostic } from "../spec/diagnostics";
import { SECTION_TITLES } from "../spec/vocabulary";
import { effortLine, translator } from "./text";
import type { CardContext } from "./view";

/** A command that cannot run in the current state, with the valid way forward. */
export function blockedCard(header: string, reason: string, next: string): Output {
  return { status: "blocked", header, blocks: section(undefined, [reason]), next };
}

/** `specty propose` with validation errors. */
export function invalidSpecCard(
  header: string,
  specPath: string,
  diagnostics: readonly Diagnostic[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const line = (entry: Diagnostic) =>
    entry.line === undefined
      ? entry.message
      : t(`línea ${entry.line}: ${entry.message}`, `line ${entry.line}: ${entry.message}`);
  return {
    status: "invalid",
    header,
    blocks: [
      ...section(
        t("ERRORES", "ERRORS"),
        diagnostics.filter((entry) => entry.severity === "error").map(line),
      ),
      ...section(
        t("AVISOS", "WARNINGS"),
        diagnostics.filter((entry) => entry.severity === "warning").map(line),
      ),
    ],
    next: t(
      `corrige ${specPath} y vuelve a ejecutar \`${ctx.command} propose\`.`,
      `fix ${specPath} and run \`${ctx.command} propose\` again.`,
    ),
  };
}

export interface ProposedView {
  readonly header: string;
  readonly specPath: string;
  readonly size: SizeResult;
  readonly effort: EffortRecommendation;
  readonly warnings: readonly Diagnostic[];
  /** Changes since the last approved revision, when there is one. */
  readonly delta: readonly DeltaEntry[];
  readonly closing: boolean;
}

/** `specty propose` accepted: the spec (or the closing) waits for the user. */
export function proposedCard(view: ProposedView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const reasons = view.size.reasons.map((reason) => formatSizeReason(reason, ctx.lang)).join(", ");
  const warnings = view.warnings.map((entry) => entry.message);
  if (view.closing) {
    return {
      status: "ok",
      header: view.header,
      blocks: [
        ...section(undefined, [t("Cierre válido.", "Valid closing.")]),
        ...section(t("AVISOS", "WARNINGS"), warnings),
      ],
      next:
        ctx.delegated === true
          ? t(
              `modo delegado: confirma tú el cierre con \`${ctx.command} close\` y sigue su salida.`,
              `delegated mode: confirm the closing yourself with \`${ctx.command} close\` and follow its output.`,
            )
          : t(
              `pide al usuario que confirme el cierre con \`${ctx.command} close\` y termina tu turno.`,
              `ask the user to confirm the closing with \`${ctx.command} close\` and end your turn.`,
            ),
    };
  }
  return {
    status: "ok",
    header: view.header,
    blocks: [
      ...section(undefined, [
        t(
          `SPEC VÁLIDA · tamaño ${view.size.level} (${reasons})`,
          `VALID SPEC · size ${view.size.level} (${reasons})`,
        ),
        effortLine(view.effort, ctx),
      ]),
      ...section(
        t("CAMBIOS RESPECTO A LO APROBADO", "CHANGES SINCE THE APPROVED REVISION"),
        view.delta.map((entry) => deltaLine(entry, ctx)),
      ),
      ...section(t("AVISOS", "WARNINGS"), warnings),
    ],
    next:
      ctx.delegated === true
        ? t(
            `modo delegado: aprueba tú la spec con \`${ctx.command} approve\` y sigue su salida.`,
            `delegated mode: approve the spec yourself with \`${ctx.command} approve\` and follow its output.`,
          )
        : t(
            `dile al usuario que la spec está lista en ${view.specPath}, con su tamaño y el esfuerzo recomendado, y que la apruebe con \`${ctx.command} approve\` en su terminal; luego termina tu turno.`,
            `tell the user the spec is ready at ${view.specPath}, with its size and recommended effort, and that they approve it with \`${ctx.command} approve\` in their terminal; then end your turn.`,
          ),
  };
}

export function deltaLine(entry: DeltaEntry, ctx: CardContext): string {
  const t = translator(ctx.lang);
  const words = {
    added: t("añadido", "added"),
    removed: t("eliminado", "removed"),
    modified: t("modificado", "modified"),
  };
  const label = entry.key.startsWith("section:")
    ? sectionLabel(entry.key.slice("section:".length), ctx)
    : entry.key.replace(/^file:/, "");
  return `${label}: ${words[entry.change]}`;
}

function sectionLabel(key: string, ctx: CardContext): string {
  const titles: Readonly<Record<string, string>> = SECTION_TITLES[ctx.lang];
  return Object.hasOwn(titles, key) ? (titles[key] ?? key) : key;
}

/** `specty task done` blocked by files outside the task's scope. */
export function outOfScopeCard(
  header: string,
  task: string,
  paths: readonly string[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "blocked",
    header,
    blocks: section(t(`FUERA DEL ALCANCE DE ${task}`, `OUTSIDE THE SCOPE OF ${task}`), paths),
    next: t(
      `revierte esos cambios o pide ampliar el alcance con \`${ctx.command} scope add <ruta> --task ${task} --reason "<motivo>"\`.`,
      `revert those changes or request a scope extension with \`${ctx.command} scope add <path> --task ${task} --reason "<reason>"\`.`,
    ),
  };
}

/** `specty task done` blocked by a failing verification. */
export function verifyFailedCard(
  header: string,
  task: string,
  command: string,
  exitCode: number | undefined,
  tail: readonly string[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const code =
    exitCode === undefined
      ? t("tiempo agotado", "timed out")
      : t(`código ${exitCode}`, `exit code ${exitCode}`);
  return {
    status: "blocked",
    header,
    blocks: [
      ...section(undefined, [
        t(
          `VERIFICACIÓN FALLIDA: ${command} (${code})`,
          `VERIFICATION FAILED: ${command} (${code})`,
        ),
      ]),
      ...section(t("SALIDA", "OUTPUT"), tail),
    ],
    next: t(
      `corrige el problema y vuelve a ejecutar \`${ctx.command} task done ${task} --summary "<qué hiciste>"\`.`,
      `fix the problem and run \`${ctx.command} task done ${task} --summary "<what you did>"\` again.`,
    ),
  };
}

/** Prefixes another card with a line, keeping its header and next action. */
export function withLead(lead: string, card: Output): Output {
  return { ...card, blocks: [...section(undefined, [lead]), ...card.blocks] };
}

export function scopeRequestedCard(
  header: string,
  request: string,
  paths: readonly string[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: section(t(`SOLICITUD ${request}`, `REQUEST ${request}`), paths),
    next:
      ctx.delegated === true
        ? t(
            `modo delegado: aprueba tú la solicitud con \`${ctx.command} approve --scope ${request}\` y sigue con la tarea.`,
            `delegated mode: approve the request yourself with \`${ctx.command} approve --scope ${request}\` and continue with the task.`,
          )
        : t(
            `sigue con lo que está dentro del alcance y pide al usuario que apruebe la solicitud con \`${ctx.command} approve --scope ${request}\`.`,
            `keep working within the scope and ask the user to approve the request with \`${ctx.command} approve --scope ${request}\`.`,
          ),
  };
}

export function retroCreatedCard(
  header: string,
  specPath: string,
  staged: readonly string[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: [
      ...section(t("CAMBIOS PREPARADOS", "STAGED CHANGES"), staged),
      ...section(t("CÓMO DOCUMENTARLOS", "HOW TO DOCUMENT THEM"), [
        t("1. Lee `git diff --staged`.", "1. Read `git diff --staged`."),
        t(
          `2. Completa en ${specPath} el Objetivo (qué cambió), el Motivo (por qué; si no lo sabes, pregúntale al usuario) y los Riesgos.`,
          `2. In ${specPath}, fill in the Goal (what changed), the Reason (why; ask the user if you do not know) and the Risks.`,
        ),
        t(`3. Ejecuta \`${ctx.command} propose\`.`, `3. Run \`${ctx.command} propose\`.`),
      ]),
    ],
    next: t(
      `documenta los cambios y ejecuta \`${ctx.command} propose\`; después el usuario los confirma con \`${ctx.command} approve\` y repite su \`git commit\`.`,
      `document the changes and run \`${ctx.command} propose\`; then the user confirms them with \`${ctx.command} approve\` and repeats their \`git commit\`.`,
    ),
  };
}

export function changeHeader(id: string, phase: string, extra?: string): string {
  return headerOf(id, phase, extra);
}
