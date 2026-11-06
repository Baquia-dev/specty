// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { Output } from "../output";
import type { UnlockEvidence } from "../schema/state";
import type { EffortRecommendation } from "../sizing/effort";
import { formatSizeReason, type SizeResult } from "../sizing/size";
import type { DeltaEntry } from "../spec/delta";
import type { Diagnostic } from "../spec/diagnostics";
import { blockedCard, deltaLine } from "./flow";
import { checkStatus } from "./refusals";
import { cappedLines, effortLine, translator } from "./text";
import type { CardContext } from "./view";

// The texts of a person's `approve` and `reject`: of a spec and of a scope request.

/** The spec on disk is not the revision proposed: the agent proposes it again first. */
export function specChangedCard(header: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    header,
    t("La spec cambió desde la última propuesta.", "The spec changed since it was last proposed."),
    t(
      `pídele a tu agente que ejecute \`${ctx.command} propose\`.`,
      `ask your agent to run \`${ctx.command} propose\`.`,
    ),
  );
}

/** What the person sees before deciding on a spec. */
export interface ApprovalView {
  readonly specPath: string;
  readonly revision: number;
  readonly size: SizeResult;
  readonly effort: EffortRecommendation;
  /** Changes since the last approved revision. */
  readonly delta: readonly DeltaEntry[];
  readonly diagnostics: readonly Diagnostic[];
  /** Files another open change also lists, one line each. */
  readonly shared: readonly string[];
}

/** The summary above the approval's questions: revision, size, effort, delta and warnings. */
export function approvalSummary(view: ApprovalView, ctx: CardContext): string {
  const t = translator(ctx.lang);
  const reasons = view.size.reasons.map((reason) => formatSizeReason(reason, ctx.lang));
  return [
    `${view.specPath} · ${t("revisión", "revision")} ${view.revision}`,
    `${t("Tamaño", "Size")} ${view.size.level}: ${reasons.join(", ")}`,
    effortLine(view.effort, ctx),
    ...view.delta.map((entry) => `Δ ${deltaLine(entry, ctx)}`),
    ...view.diagnostics.map((entry) => `! ${entry.message}`),
    ...view.shared.map((line) => `! ${t("Compartido", "Shared")}: ${line}`),
  ].join("\n");
}

/** The two answers to a high-impact assumption. */
export function assumptionChoices(
  lang: Lang,
): readonly { readonly value: "confirm" | "reject"; readonly label: string }[] {
  const t = translator(lang);
  return [
    { value: "confirm", label: t("Confirmar", "Confirm") },
    { value: "reject", label: t("Rechazar", "Reject") },
  ];
}

/** Asked after rejecting an assumption or a scope request: the agent reads the answer. */
export function rejectionQuestion(subject: "assumption" | "scope", lang: Lang): string {
  const t = translator(lang);
  return subject === "assumption"
    ? t("¿Por qué? (lo leerá el agente)", "Why? (the agent will read it)")
    : t(
        "¿Por qué la rechazas? (lo leerá el agente)",
        "Why do you reject it? (the agent will read it)",
      );
}

/** The assumptions the person rejected: the agent fixes the spec before it is approved. */
export function rejectedAssumptionsLine(ids: readonly string[], lang: Lang): string {
  return translator(lang)(
    `Rechazaste ${ids.join(", ")}; el agente debe corregir la spec.`,
    `You rejected ${ids.join(", ")}; the agent must fix the spec.`,
  );
}

export function approveSpecQuestion(revision: number, title: string, lang: Lang): string {
  return translator(lang)(
    `¿Aprobar la revisión ${revision} de «${title}»?`,
    `Approve revision ${revision} of "${title}"?`,
  );
}

/** When the flow refuses the person's decision, the agent's `next` says why and what to do. */
export function askAgentNext(ctx: CardContext): string {
  return translator(ctx.lang)(
    `pídele a tu agente \`${ctx.command} next\`.`,
    `ask your agent for \`${ctx.command} next\`.`,
  );
}

export function specApprovedLine(revision: number, commit: string, lang: Lang): string {
  return translator(lang)(
    `Revisión ${revision} aprobada (commit ${commit}).`,
    `Revision ${revision} approved (commit ${commit}).`,
  );
}

/** The person left the approval for later: nothing changed. */
export function approvalPostponedCard(header: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: [
      { lines: [t("Aprobación pospuesta; nada cambió.", "Approval postponed; nothing changed.")] },
    ],
    next: t(
      `cuando estés listo, ejecuta \`${ctx.command} approve\`.`,
      `when you are ready, run \`${ctx.command} approve\`.`,
    ),
  };
}

/** `approve --scope` or `reject --scope` names a request the change does not have. */
export function noScopeRequestCard(scope: string, header: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    header,
    t(`No existe la solicitud ${scope}.`, `There is no request ${scope}.`),
    checkStatus(ctx),
  );
}

/** A scope request, as the person decides on it. */
export interface ScopeRequestDecided {
  readonly id: string;
  readonly task: string;
  readonly paths: readonly string[];
}

/** The lines of an unlock's patch the note shows before deciding; it says how many it leaves out. */
const NOTE_PATCH_LINES = 40;
/** The lines of each piece of an unlock's evidence the note shows before deciding. */
const NOTE_EVIDENCE_LINES = 10;

/** A scope request, as the terminal shows it before the person decides on it. */
interface ScopeRequestNoted extends ScopeRequestDecided {
  readonly reason: string;
  /** An unlock of approved tests: the exact change to them (ADR 0014); none from an older CLI. */
  readonly patch?: string | undefined;
  /** An unlock of approved tests: the lines that justify it. */
  readonly evidence?: readonly UnlockEvidence[] | undefined;
}

/**
 * The note before `approve --scope` or `reject --scope`: the paths and the reason and, of an
 * unlock, its patch and each piece of its evidence, cut so it stays short.
 */
export function scopeRequestNote(request: ScopeRequestNoted, ctx: CardContext): string {
  const t = translator(ctx.lang);
  const patch = request.patch === undefined ? [] : patchLines(request.patch);
  const evidence = request.evidence ?? [];
  const cut =
    patch.length > NOTE_PATCH_LINES ||
    evidence.some((piece) => piece.text.split("\n").length > NOTE_EVIDENCE_LINES);
  return [
    ...request.paths,
    `— ${request.reason}`,
    ...(patch.length === 0 ? [] : ["", t("El cambio al test:", "The change to the test:")]),
    ...cappedLines(patch, NOTE_PATCH_LINES, ctx.lang),
    ...(evidence.length === 0
      ? []
      : ["", t("El código que lo sustenta:", "The code that supports it:")]),
    ...evidence.flatMap((piece) => evidenceLines(piece, ctx.lang)),
    ...(cut
      ? [
          "",
          t(
            `La solicitud entera se ve en la UI: \`${ctx.command} ui\`.`,
            `The whole request shows in the UI: \`${ctx.command} ui\`.`,
          ),
        ]
      : []),
  ]
    .join("\n")
    .split("\n")
    .map(visible)
    .join("\n");
}

/** The lines of a unified diff, without the empty one after its last newline. */
function patchLines(patch: string): readonly string[] {
  const lines = patch.split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

/** A piece of evidence: where it is and its first lines, each with its number in the file. */
function evidenceLines(piece: UnlockEvidence, lang: Lang): readonly string[] {
  const lines = piece.text.split("\n");
  const width = String(piece.from + Math.min(lines.length, NOTE_EVIDENCE_LINES) - 1).length;
  const numbered = lines.map(
    (line, index) => `${String(piece.from + index).padStart(width)} │ ${line}`,
  );
  return [
    `${piece.path}:${piece.from}-${piece.to}`,
    ...cappedLines(numbered, NOTE_EVIDENCE_LINES, lang),
  ];
}

/**
 * A line as the person should read it: without the `\r` of a CRLF ending, and each character a
 * terminal acts on (control, or direction of the text) as its code, so it cannot hide or reorder
 * what the request does.
 */
function visible(line: string): string {
  const text = line.endsWith("\r") ? line.slice(0, -1) : line;
  return Array.from(text, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return actsOnTerminal(code) ? `\\u${code.toString(16).padStart(4, "0")}` : char;
  }).join("");
}

/** C0 controls but the tab, C1 controls, and the embeddings, overrides and isolates of Unicode. */
function actsOnTerminal(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x09) ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

export function scopeDecisionQuestion(
  decision: "approve" | "reject",
  request: ScopeRequestDecided,
  lang: Lang,
): string {
  const t = translator(lang);
  return decision === "approve"
    ? t(
        `¿Aprobar ${request.id} para ${request.task}?`,
        `Approve ${request.id} for ${request.task}?`,
      )
    : t(`¿Rechazar ${request.id}?`, `Reject ${request.id}?`);
}

export function scopeDecidedLine(
  decision: "approve" | "reject",
  request: ScopeRequestDecided,
  lang: Lang,
): string {
  const t = translator(lang);
  return decision === "approve"
    ? t(
        `${request.id} aprobada: ${request.paths.join(", ")} entra en el alcance de ${request.task}.`,
        `${request.id} approved: ${request.paths.join(", ")} joins the scope of ${request.task}.`,
      )
    : t(`${request.id} rechazada.`, `${request.id} rejected.`);
}
