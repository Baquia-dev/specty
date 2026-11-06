// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type ChangeState,
  type ChangeView,
  changeWaitsFor,
  closingInAcceptance,
  dirname,
  entriesForPaths,
  isIntegrating,
  parseGlossary,
  parseSpec,
  type Spec,
  specHash,
  type TaskView,
} from "@baquia-dev/specty-core";
import { exists, readText } from "../io/files";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { readComments } from "../store/comments";
import { readMemory } from "../store/memory";
import { acceptanceFacts } from "./acceptance";
import { type Audit, carriedOf, dataOf, readAudit } from "./carried";
import { epicSlices } from "./epic";
import { closingRemarks } from "./review-remarks";
import { listed } from "./shared";
import { taskViews } from "./task-views";
import { apartFromMain } from "./worktree";

/** Everything the cards need about a change, read from its files and from git. */
export async function changeView(session: Session, change: StoredChange): Promise<ChangeView> {
  const { state } = change;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const audit = await readAudit(change.files);
  const { tasks, commits } = await taskViews(session, spec, state, audit);
  const active = tasks.find((task) => task.status === "active");
  return {
    id: state.id,
    kind: state.kind,
    phase: state.phase,
    title: spec.title,
    specPath: session.paths.relative(change.files.spec),
    ...(state.branch !== undefined ? { branch: state.branch } : {}),
    revision: state.revision,
    tasks,
    conventions:
      active === undefined ? [] : await conventions(session, [...active.files, ...active.extras]),
    pendingScope: state.pending.scopeRequests,
    rejected: rejectedAssumptions(spec, state),
    ...(await phaseFacts(session, change, spec, { tasks, audit, commits })),
    closingSubmitted: state.closingSubmittedAt !== undefined,
    ...(state.testsSubmittedAt !== undefined ? { testsSubmitted: true } : {}),
    specChanged:
      state.phase === "implementing" &&
      state.approved !== undefined &&
      specHash(spec) !== state.approved.hash,
    ...integrationView(state),
    ...notesOf(audit),
    ...(await pathEntriesOf(session, filesAtHand(state.phase, spec, active))),
    ...(state.kind === "epic" ? await epicFacts(session, change, spec) : {}),
    ...(await glossaryView(session)),
  };
}

/** An epic's slices, and whether it lives in a worktree of its own, apart from the main folder. */
async function epicFacts(
  session: Session,
  change: StoredChange,
  spec: Spec,
): Promise<Pick<ChangeView, "slices" | "inWorktree">> {
  const slices = await epicSlices(session, change, spec);
  return (await apartFromMain(session.git)) ? { slices, inWorktree: true } : { slices };
}

/** The project's glossary (formats.md §6), when its file defines some term. */
async function glossaryView(session: Session): Promise<Pick<ChangeView, "glossary">> {
  const path = session.config.glossary;
  const entries = parseGlossary((await readText(join(session.root, path))) ?? "");
  return entries.length === 0 ? {} : { glossary: { path, entries } };
}

/** The assumptions the person rejected, each with their comment. */
function rejectedAssumptions(spec: Spec, state: ChangeState): ChangeView["rejected"] {
  return (spec.sections.assumptions?.items ?? []).flatMap((item) => {
    const decision = state.items[item.id];
    if (decision?.decision !== "rejected") return [];
    return [
      {
        id: item.id,
        text: item.text,
        ...(decision.comment !== undefined ? { comment: decision.comment } : {}),
      },
    ];
  });
}

/**
 * What the change's phase brings: the comments to answer in review, the adjustment asked for,
 * the draft's request and what it carries over, in acceptance, a review recommended first and
 * each criterion with its tests (an epic's criteria are its slices'), and, while the closing is
 * written (in delegated mode, also in acceptance), the review's remarks it does not cite yet.
 */
async function phaseFacts(
  session: Session,
  change: StoredChange,
  spec: Spec,
  read: {
    readonly tasks: readonly TaskView[];
    readonly audit: Audit;
    readonly commits: ReadonlyMap<string, string>;
  },
) {
  const { state } = change;
  const { audit } = read;
  return {
    ...(state.phase === "review" && changeWaitsFor(state) === "agent"
      ? { requested: await requested(change) }
      : {}),
    ...(state.pending.adjustment !== null ? { adjustment: state.pending.adjustment.request } : {}),
    ...(state.phase === "draft" ? await draftFacts(session, spec, audit) : {}),
    ...(state.phase === "acceptance" ? await acceptanceFacts(session, change, spec, read) : {}),
    ...(writesClosing(session, state) ? await closingRemarks(change.files, spec) : {}),
  };
}

/** The agent writes the change's closing: in `closing` or, in delegated mode, in acceptance. */
function writesClosing(session: Session, state: ChangeState): boolean {
  if (state.phase === "closing") return true;
  return state.phase === "acceptance" && closingInAcceptance(state.kind, session.delegated);
}

/** The incorporation of the target branch the agent is resolving, if any. */
function integrationView(state: ChangeState): Pick<ChangeView, "integration"> {
  if (state.integration === undefined || !isIntegrating(state)) return {};
  const { target, reason, conflicts, paths } = state.integration;
  return { integration: { target, reason, conflicts, paths } };
}

/**
 * The unresolved comments the agent must answer, once the person sent the review back
 * (`changeWaitsFor`, by `changesRequestedAt`); until then, the review is still theirs.
 */
async function requested(change: StoredChange): Promise<NonNullable<ChangeView["requested"]>> {
  return (await readComments(change.files))
    .filter((comment) => comment.resolvedInRevision === undefined)
    .map(({ id, anchor, body }) => ({ id, anchor, body }));
}

/** While drafting: the user's request, the entries it resolves and what its follows left. */
async function draftFacts(
  session: Session,
  spec: Spec,
  audit: Audit,
): Promise<Pick<ChangeView, "request" | "resolves" | "carried">> {
  return {
    ...request(audit),
    ...(await resolvesOf(session, audit)),
    ...(await carriedOf(session, spec.frontmatter.follows)),
  };
}

/** The files at hand: those the draft's spec names, or the active task's with its extensions. */
function filesAtHand(
  phase: ChangeState["phase"],
  spec: Spec,
  active: TaskView | undefined,
): string[] {
  if (phase === "draft") return listed(spec);
  return active === undefined ? [] : [...active.files, ...active.extras];
}

/**
 * The open lessons and decisions of Specty's memory about `files` (ADR 0016); the memory is read
 * only when there are files.
 */
async function pathEntriesOf(
  session: Session,
  files: readonly string[],
): Promise<Pick<ChangeView, "pathEntries">> {
  if (files.length === 0) return {};
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  const found = entriesForPaths(entries, files);
  return found.length === 0 ? {} : { pathEntries: found };
}

/** How many notes of the change's log `next`'s card shows. */
const NOTES_SHOWN = 3;

/** The last notes of the change's log (`change.noted`), oldest first; nothing without notes. */
function notesOf(audit: Audit): Pick<ChangeView, "notes"> {
  const notes = audit.flatMap((entry) => {
    const { text } = dataOf(entry);
    return entry.event === "change.noted" &&
      typeof entry.ts === "string" &&
      typeof text === "string"
      ? [{ at: entry.ts, text }]
      : [];
  });
  return notes.length === 0 ? {} : { notes: notes.slice(-NOTES_SHOWN) };
}

/** The user's literal request, from the audit, where `new --request` left it. */
function request(audit: Audit): Pick<ChangeView, "request"> {
  const data = dataOf(audit.find((entry) => entry.event === "change.created"));
  return typeof data.request === "string" ? { request: data.request } : {};
}

/**
 * The memory's entries the change took (`new --resolves`), as they are now. The memory is read
 * only for a change created with `--resolves`.
 */
async function resolvesOf(session: Session, audit: Audit): Promise<Pick<ChangeView, "resolves">> {
  const { resolves } = dataOf(audit.find((entry) => entry.event === "change.created"));
  const ids = Array.isArray(resolves) ? resolves.filter((id) => typeof id === "string") : [];
  if (ids.length === 0) return {};
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  return { resolves: entries.filter((entry) => ids.includes(entry.id)) };
}

/** Nested AGENTS.md files that apply to the given paths, closest last. */
async function conventions(session: Session, files: readonly string[]): Promise<string[]> {
  const directories = new Set(files.flatMap((file) => ancestors(dirname(file))));
  const candidates = [...directories].toSorted().map((directory) => `${directory}/AGENTS.md`);
  const found = await Promise.all(
    candidates.map(async (candidate) =>
      (await exists(join(session.root, candidate))) ? [candidate] : [],
    ),
  );
  return found.flat();
}

function ancestors(directory: string): string[] {
  if (directory === "" || directory === "." || /[*?[{]/.test(directory)) return [];
  return [...ancestors(dirname(directory)), directory];
}
