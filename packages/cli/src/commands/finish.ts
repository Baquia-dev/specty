// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  closedCard,
  headerOf,
  nothingPendingCard,
  type Output,
  parseSpec,
  transition,
  translator,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { archive, commitArchive } from "../flow/finish";
import { absorbTarget, integrationOf, landChange, withIntegration } from "../flow/integrate";
import type { Session } from "../session";
import { readSpec } from "../store/changes";
import { writePointer } from "../store/local";
import { humanChange, postponed } from "./human";

export async function close(session: Session): Promise<Output> {
  const guard = await humanChange(session, "close");
  if (guard.kind === "output") return guard.output;
  const { change } = guard;
  const t = translator(session.lang);
  const { state } = change;
  if (state.phase !== "closing" || state.closingSubmittedAt === undefined) {
    return nothingPendingCard(state.id, state.phase, "close", session.cards);
  }
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  session.environment.terminal.note(spec.title, spec.sections.closing ?? "");
  if (
    !(await session.environment.terminal.confirm(
      t("¿Confirmar el cierre?", "Confirm the closing?"),
    ))
  )
    return postponed(session, state);
  // The main branch comes into the change before anything is archived: a refusal changes nothing.
  const plan = await integrationOf(session, state);
  const absorbed =
    plan === undefined ? undefined : await absorbTarget(session, plan, state, "close");
  if (absorbed?.ok === false) return absorbed.output;
  const moved = transition({
    phase: "closing",
    kind: state.kind,
    actor: "human",
    event: { type: "confirmClose", closingSubmitted: true },
  });
  if (!moved.ok)
    return blockedCard(
      headerOf(state.id, state.phase),
      moved.code,
      t(
        `revisa \`${session.cards.command} status\`.`,
        `check \`${session.cards.command} status\`.`,
      ),
    );
  const archived = await archive(
    session,
    change,
    { ...state, phase: moved.phase },
    "change.closed",
    {},
  );
  const commit = await commitArchive(
    session,
    change,
    archived,
    `docs(spec): ${t("cerrar", "close")} ${spec.title}`,
  );
  const landed = plan === undefined ? undefined : await landChange(session, plan);
  return withIntegration(
    session,
    closedCard(
      headerOf(state.id, "done"),
      t(
        `Cambio cerrado y archivado (commit ${commit}).`,
        `Change closed and archived (commit ${commit}).`,
      ),
      landed?.landed === true ? undefined : state.branch,
      session.cards,
    ),
    absorbed?.lines ?? [],
    landed,
  );
}

/** `specty cancel`: a person abandons the change; it is archived as cancelled. */
export async function cancel(session: Session, reason: string | undefined): Promise<Output> {
  const guard = await humanChange(session, "cancel");
  if (guard.kind === "output") return guard.output;
  const { change } = guard;
  const t = translator(session.lang);
  const { state } = change;
  const { terminal } = session.environment;
  if (isFinished(state)) return nothingPendingCard(state.id, state.phase, "cancel", session.cards);
  const why = reason ?? (await terminal.ask(t("¿Por qué lo cancelas?", "Why do you cancel it?")));
  if (!(await terminal.confirm(t(`¿Cancelar ${state.id}?`, `Cancel ${state.id}?`))))
    return postponed(session, state);
  const moved = transition({
    phase: state.phase,
    kind: state.kind,
    actor: "human",
    event: { type: "cancel" },
  });
  if (!moved.ok)
    return blockedCard(
      headerOf(state.id, state.phase),
      moved.code,
      t(
        `revisa \`${session.cards.command} status\`.`,
        `check \`${session.cards.command} status\`.`,
      ),
    );
  const archived = await archive(
    session,
    change,
    { ...state, phase: moved.phase },
    "change.cancelled",
    {
      ...(why !== undefined && why.trim().length > 0 ? { reason: why.trim() } : {}),
    },
  );
  if (state.kind === "retro") await writePointer(session.git, "retro", undefined);
  const commit = await commitArchive(
    session,
    change,
    archived,
    `docs(spec): ${t("cancelar", "cancel")} ${state.id}`,
  );
  return closedCard(
    headerOf(state.id, "cancelled"),
    t(
      `Cambio cancelado y archivado (commit ${commit}).`,
      `Change cancelled and archived (commit ${commit}).`,
    ),
    state.branch,
    session.cards,
  );
}

/** Quick lane: accepting closes the change, with the task summary as its closing. */
