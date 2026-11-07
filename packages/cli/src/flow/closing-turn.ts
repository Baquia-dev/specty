// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  type ChangeState,
  checkStatus,
  closeCommitSubject,
  closedCard,
  closedLine,
  headerOf,
  type Output,
  parseSpec,
  quickClosedLine,
  quickClosing,
  type Spec,
  serializeSpec,
  transition,
} from "@baquia-dev/specty-core";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { withArchivedMemory } from "./archive-memory";
import { verifyHints, withVerifyHints } from "./detected";
import { archive, commitArchive, commitClosing } from "./finish";
import { landingTurn } from "./full-verification";
import { absorbTarget, type Integration, integrationOf } from "./integrate";
import { type Landed, landRetrying, withIntegration } from "./land";
import { withCleanupFrom } from "./prune";
import { measureUsage, withUsage } from "./usage";
import { withoutClosing } from "./views";

// Closing on the landing turn (ARCHITECTURE §9): what `close` and the `accept` that closes do
// with the turn taken, so that no other session lands in between.

/**
 * In delegated mode, accepting a change that closes on it, a quick one, one without its closing
 * phase or one whose closing the agent sent first (`closingSent`), runs on the landing turn from before main comes in until the
 * change lands (`landingTurn`): no other session lands between its verification and its landing,
 * so it verifies once and the closing has nothing left to merge. The person's acceptance, at the
 * terminal or on the UI, takes the turn only to verify and to land, never while they answer.
 */
export async function closingTurn(
  session: Session,
  change: StoredChange,
  plan: Integration | undefined,
  run: () => Promise<Output>,
): Promise<Output> {
  const closes = session.actor === "agent" && (await closesOnAccept(session, change));
  return closes || closingSent(session, change) ? landingTurn(session, plan, run) : run();
}

/** Accepting closes a quick change, and one without its closing phase (`withoutClosing`). */
async function closesOnAccept(session: Session, change: StoredChange): Promise<boolean> {
  if (change.state.kind === "quick") return true;
  if (session.config.flow.closing) return false;
  const { spec } = parseSpec(await readSpec(change.files), { language: session.lang });
  return withoutClosing(session, change.state, spec);
}

/**
 * In delegated mode, the agent accepts a change whose closing it sent in acceptance: accepting
 * closes it too. Only that `propose` notes the closing in acceptance (`closingInAcceptance`).
 */
export function closingSent(session: Session, change: StoredChange): boolean {
  return session.actor === "agent" && change.state.closingSubmittedAt !== undefined;
}

/**
 * Before main comes into a change in acceptance whose closing was sent: the closing, uncommitted,
 * gets its commit first if main changed one of its files, as when closing (`commitClosing`), so
 * that the merge is not refused for them. Without the closing sent, nothing runs before the merge.
 */
export function closingFirst(
  session: Session,
  change: StoredChange,
): ((target: string) => Promise<void>) | undefined {
  if (change.state.closingSubmittedAt === undefined) return undefined;
  return async (target) => {
    const { spec } = parseSpec(await readSpec(change.files), { language: session.lang });
    await commitClosing(session, change, spec.title, target);
  };
}

/**
 * The change the agent accepted with its closing sent, now in `closing`: it closes as `close`
 * would, on the turn that `closingTurn` holds already, so it does not wait. `accepted` are the
 * acceptance's lines, which go before the landing's.
 */
export async function closeAccepted(
  session: Session,
  change: StoredChange,
  accepted: readonly string[],
): Promise<Output> {
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const plan = await integrationOf(session, change.state);
  return landingTurn(session, plan, () => closeOnTurn(session, change, spec, plan, accepted));
}

/**
 * The closing, on the landing turn: the main branch comes in again if it moved, the change is
 * archived, its commit made, and it lands. `accepted`, when an `accept` closes it, are its lines.
 */
export async function closeOnTurn(
  session: Session,
  change: StoredChange,
  spec: Spec,
  plan: Integration | undefined,
  accepted?: readonly string[],
): Promise<Output> {
  const { state } = change;
  // The main branch comes into the change before anything is archived: a refusal leaves it in its
  // phase. If main changed the closing's uncommitted files, the closing gets its commit first.
  const closing = (target: string) => commitClosing(session, change, spec.title, target);
  const absorbed =
    plan === undefined ? undefined : await absorbTarget(session, plan, change, "close", closing);
  if (absorbed?.ok === false) return absorbed.output;
  const moved = transition({
    phase: "closing",
    kind: state.kind,
    actor: "human",
    event: { type: "confirmClose", closingSubmitted: true },
  });
  if (!moved.ok)
    return blockedCard(headerOf(state.id, state.phase), moved.code, checkStatus(session.cards));
  // Measured before archiving, so that the consumption goes with the change.
  const usage = await measureUsage(session, change);
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
    closeCommitSubject(spec.title, session.lang),
  );
  // Read while the folder exists: landing removes a worktree of its own.
  const hints = await verifyHints(session, plan?.main ?? session.root);
  const landed = plan === undefined ? undefined : await landRetrying(session, plan);
  // An acceptance that closes says so, as the quick lane's does.
  const line = (accepted === undefined ? closedLine : quickClosedLine)(commit, session.lang);
  const lines = [...(accepted ?? []), ...(absorbed?.lines ?? [])];
  const card = closedOutput(session, state, line, lines, landed);
  const cleaned = await withCleanupFrom(session, plan?.main, card);
  return withVerifyHints(withUsage(withArchivedMemory(session, cleaned, archived), usage), hints);
}

/**
 * Quick lane, and a change without its closing phase: accepting closes the change, with its tasks'
 * summaries as its closing. As when closing,
 * it lands on the full verification's turn, so that no other session lands in between; in
 * delegated mode, this process holds it already (`closingTurn`), and it does not wait.
 */
export async function closeQuick(
  session: Session,
  change: StoredChange,
  summaries: readonly string[],
  merged: readonly string[],
): Promise<Output> {
  const plan = await integrationOf(session, change.state);
  return landingTurn(session, plan, () =>
    closeQuickOnTurn(session, change, plan, { summaries, merged }),
  );
}

async function closeQuickOnTurn(
  session: Session,
  change: StoredChange,
  plan: Integration | undefined,
  {
    summaries,
    merged,
  }: { readonly summaries: readonly string[]; readonly merged: readonly string[] },
): Promise<Output> {
  // As when closing, before it lands: main's folder is checked and main comes in again if it
  // moved since the verification. A refusal leaves the change in acceptance.
  const absorbed =
    plan === undefined ? undefined : await absorbTarget(session, plan, change, "accept");
  if (absorbed?.ok === false) return absorbed.output;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const closing = quickClosing(summaries, session.lang);
  await writeText(
    change.files.spec,
    serializeSpec({ ...spec, sections: { ...spec.sections, closing } }),
  );
  // Measured before archiving, so that the consumption goes with the change.
  const usage = await measureUsage(session, change);
  const archived = await archive(
    session,
    change,
    { ...change.state, phase: "done" },
    "change.closed",
    change.state.kind === "quick" ? { lane: "quick" } : { closing: false },
  );
  const commit = await commitArchive(
    session,
    change,
    archived,
    closeCommitSubject(spec.title, session.lang),
  );
  // Read while the folder exists: landing removes a worktree of its own.
  const hints = await verifyHints(session, plan?.main ?? session.root);
  const landed = plan === undefined ? undefined : await landRetrying(session, plan);
  const line = quickClosedLine(commit, session.lang);
  const card = closedOutput(
    session,
    change.state,
    line,
    [...merged, ...(absorbed?.lines ?? [])],
    landed,
  );
  return withVerifyHints(withUsage(withArchivedMemory(session, card, archived), usage), hints);
}

/**
 * The card of a change archived on the landing turn: `line` says how it closed, and `lines`, how
 * the main branch came in, before how it landed.
 */
function closedOutput(
  session: Session,
  state: ChangeState,
  line: string,
  lines: readonly string[],
  landed: Landed | undefined,
): Output {
  const branch = landed?.landed === true ? undefined : state.branch;
  const card = closedCard(headerOf(state.id, "done"), line, branch, session.cards);
  return withIntegration(session, card, lines, landed);
}
