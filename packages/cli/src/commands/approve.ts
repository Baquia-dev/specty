// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  type ChangeState,
  decisionCard,
  deltaLine,
  effortLine,
  formatSizeReason,
  headerOf,
  nothingPendingCard,
  notInteractiveCard,
  type Output,
  parseSpec,
  recommendEffort,
  shortHash,
  specDelta,
  specHash,
  transition,
  translator,
} from "@baquia-dev/specty-core";
import { commitState, resolveActive } from "../flow/active";
import { analyzeChange } from "../flow/analysis";
import { changeTrailers, commitWithReceipt } from "../flow/commits";
import { finishRetro } from "../flow/finish";
import type { Session } from "../session";
import { readRevision, readSpec, type StoredChange } from "../store/changes";
import { retroDone } from "./retro";
import { decideScope } from "./scope-decision";

/** `specty approve [--scope S]`: a person approves the spec in review or a scope request. */
export async function approve(session: Session, scope: string | undefined): Promise<Output> {
  const { cards } = session;
  if (!session.environment.terminal.interactive) return notInteractiveCard("approve", cards);
  const t = translator(session.lang);
  const active = await resolveActive(session);
  if (active === undefined) {
    return blockedCard(
      headerOf(),
      t("No hay un cambio activo.", "There is no active change."),
      t(`revisa \`${cards.command} status\`.`, `check \`${cards.command} status\`.`),
    );
  }
  if (scope !== undefined) return decideScope(session, active, scope, "approve", undefined);
  if (active.state.phase !== "review")
    return nothingPendingCard(active.state.id, active.state.phase, "approve", cards);
  return approveSpec(session, active);
}

async function approveSpec(session: Session, active: StoredChange): Promise<Output> {
  const t = translator(session.lang);
  const { state, files } = active;
  const { terminal } = session.environment;
  const header = headerOf(
    state.id,
    "review",
    t(`revisión ${state.revision}`, `revision ${state.revision}`),
  );
  const spec = parseSpec(await readSpec(files), { language: session.lang }).spec;
  const last = await readRevision(files, state.revision);
  if (last === undefined || specHash(parseSpec(last).spec) !== specHash(spec)) {
    return blockedCard(
      header,
      t(
        "La spec cambió desde la última propuesta.",
        "The spec changed since it was last proposed.",
      ),
      t(
        `pídele a tu agente que ejecute \`${session.cards.command} propose\`.`,
        `ask your agent to run \`${session.cards.command} propose\`.`,
      ),
    );
  }
  const analysis = await analyzeChange(session, active, "review");
  const approvedText = await readRevision(files, state.approved?.revision);
  const delta =
    approvedText === undefined ? [] : specDelta(parseSpec(approvedText).spec, spec).entries;
  terminal.note(
    spec.title,
    [
      `${session.paths.relative(files.spec)} · ${t("revisión", "revision")} ${state.revision}`,
      `${t("Tamaño", "Size")} ${analysis.size.level}: ${analysis.size.reasons.map((reason) => formatSizeReason(reason, session.lang)).join(", ")}`,
      effortLine(recommendEffort(analysis.size.level), session.cards),
      ...delta.map((entry) => `Δ ${deltaLine(entry, session.cards)}`),
      ...analysis.diagnostics.map((entry) => `! ${entry.message}`),
    ].join("\n"),
  );

  const items: ChangeState["items"] = { ...state.items };
  for (const assumption of (spec.sections.assumptions?.items ?? []).filter(
    (item) => item.impact === "high",
  )) {
    const current = items[assumption.id];
    if (current === undefined || current.decision === "confirmed") continue;
    const choice = await terminal.choose(`${assumption.id}: ${assumption.text}`, [
      { value: "confirm", label: t("Confirmar", "Confirm") },
      { value: "reject", label: t("Rechazar", "Reject") },
    ]);
    if (choice === undefined) return postponed(session, header);
    const comment =
      choice === "reject"
        ? await terminal.ask(t("¿Por qué? (lo leerá el agente)", "Why? (the agent will read it)"))
        : undefined;
    items[assumption.id] = {
      hash: current.hash,
      decision: choice === "reject" ? "rejected" : "confirmed",
      ...(comment !== undefined && comment.trim().length > 0 ? { comment: comment.trim() } : {}),
    };
  }
  const rejected = Object.entries(items)
    .filter(([, item]) => item.decision === "rejected")
    .map(([id]) => id);
  if (rejected.length > 0) {
    await commitState(
      session,
      active,
      { ...state, items },
      "assumption.decided",
      { rejected },
      "human",
    );
    return decisionCard(
      header,
      [
        t(
          `Rechazaste ${rejected.join(", ")}; el agente debe corregir la spec.`,
          `You rejected ${rejected.join(", ")}; the agent must fix the spec.`,
        ),
      ],
      session.cards,
    );
  }
  if (
    !(await terminal.confirm(
      t(
        `¿Aprobar la revisión ${state.revision} de «${spec.title}»?`,
        `Approve revision ${state.revision} of "${spec.title}"?`,
      ),
    ))
  ) {
    return postponed(session, header);
  }
  const moved = transition({
    phase: "review",
    kind: state.kind,
    actor: "human",
    event: { type: "approve", validationErrors: analysis.valid ? 0 : 1, pendingHighImpact: 0 },
  });
  if (!moved.ok)
    return blockedCard(
      header,
      moved.code,
      t(
        `pídele a tu agente \`${session.cards.command} next\`.`,
        `ask your agent for \`${session.cards.command} next\`.`,
      ),
    );
  const finalItems = Object.fromEntries(
    Object.entries(items).map(([id, item]) => [
      id,
      item.decision === "pending" ? { ...item, decision: "implicit" as const } : item,
    ]),
  );
  const approvedState: ChangeState = {
    ...state,
    phase: moved.phase,
    items: finalItems,
    approved: {
      revision: state.revision,
      hash: analysis.hash,
      at: session.environment.now().toISOString(),
      by: (await session.git.config("user.name")) ?? "unknown",
      channel: "tty",
    },
    pending: { ...state.pending, adjustment: null },
  };
  const updated = await commitState(
    session,
    active,
    approvedState,
    "spec.approved",
    { revision: state.revision, hash: analysis.hash, channel: "tty" },
    "human",
  );
  if (state.kind === "retro")
    return retroDone(session, await finishRetro(session, updated, approvedState));
  const commit = await commitWithReceipt(session, {
    subject: `docs(spec): ${spec.title}`,
    trailers: changeTrailers(session, state.id, {
      "Specty-Spec": `r${state.revision}@${shortHash(analysis.hash)}`,
    }),
    stage: [[session.paths.relative(files.dir)]],
    only: [session.paths.relative(files.dir)],
    receipt: { change: state.id, kind: "spec" },
  });
  return decisionCard(
    headerOf(state.id, moved.phase),
    [
      t(
        `Revisión ${state.revision} aprobada (commit ${commit}).`,
        `Revision ${state.revision} approved (commit ${commit}).`,
      ),
    ],
    session.cards,
  );
}

function postponed(session: Session, header: string): Output {
  const t = translator(session.lang);
  return {
    status: "ok",
    header,
    blocks: [
      { lines: [t("Aprobación pospuesta; nada cambió.", "Approval postponed; nothing changed.")] },
    ],
    next: t(
      `cuando estés listo, ejecuta \`${session.cards.command} approve\`.`,
      `when you are ready, run \`${session.cards.command} approve\`.`,
    ),
  };
}
