// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  branchName,
  type ChangeKind,
  type CommitType,
  changeCreatedLead,
  duplicateCard,
  gitFailedCard,
  type MemoryEntry,
  makeChangeId,
  newRefusalCard,
  nextCard,
  type Output,
  specTemplate,
  type TemplateOptions,
  withDevPorts,
  withLead,
  worktreeCreatedCard,
} from "@baquia-dev/specty-core";
import { bindNew } from "../enforce/sessions";
import { commitState, isFinished, resolveActive } from "../flow/active";
import { freeBranch, markBranch } from "../flow/branches";
import { duplicatesOf } from "../flow/duplicates";
import { sliceRefusal } from "../flow/epic";
import { removeFinished } from "../flow/prune";
import { changeView } from "../flow/views";
import {
  addWorktree,
  apartFromMain,
  parallelBase,
  prepareWorktree,
  worktreesHome,
} from "../flow/worktree";
import { entersByName } from "../install/agents";
import { freshProject } from "../install/product";
import { exists, writeText } from "../io/files";
import { GitError, gitFailure } from "../io/git";
import type { Session } from "../session";
import { initialState, type StoredChange } from "../store/changes";
import { writePointer } from "../store/local";
import { changeFiles, repoPaths } from "../store/paths";
import { portsOf } from "../store/ports";
import { targetOf } from "./memory";
import { claimEntries, takeEntries } from "./memory-resolve";
import { dirtyGoverned } from "./next";

export interface NewOptions {
  readonly title: string;
  readonly kind: ChangeKind;
  /** What the change is, which names its branch under `git.flow`. */
  readonly type: CommitType;
  readonly follows: readonly string[];
  /** Pending items or improvements of Specty's memory the change takes (ADR 0016). */
  readonly resolves?: readonly string[];
  /** Set by `new` itself: the entries `resolves` names, as they were when checked. */
  readonly claimed?: readonly MemoryEntry[];
  /** Open changes the user said this one does not duplicate, though it looks like them. */
  readonly distinctFrom?: readonly string[];
  readonly epic?: string;
  readonly slice?: string;
  readonly timebox?: string;
  /** Create the change in a new worktree instead of switching this folder's branch. */
  readonly worktree?: boolean;
  /** With `worktree`, the branch to start from (by default, the main branch). */
  readonly from?: string;
  /** Set by `new` itself: the first change of a new project, its skeleton (ARCHITECTURE §14). */
  readonly bootstrap?: boolean;
  /** The user's literal request, kept in the audit as they wrote it. */
  readonly request?: string;
  /** Sections that come written, such as an imported change's (`specty import`). */
  readonly sections?: TemplateOptions["prefilled"];
  /** A clean, concise slug for the change id and branch. */
  readonly slug?: string;
  /** An explicit branch name for the change. */
  readonly branch?: string;
  /**
   * A subagent creates it: the conversation that runs `new` (its tool tells the session's, not the
   * subagent's) is not bound to the change, and the subagent enters it with `specty enter`.
   */
  readonly subagent?: boolean;
}

/**
 * `specty new`: creates the change, its branch and the spec skeleton. In a new project, the first
 * change is its skeleton: standard, so the scaffolding is traced, with hints of its own.
 */
export async function newChange(session: Session, options: NewOptions): Promise<Output> {
  const bootstrap = await freshProject(session);
  if (bootstrap && options.kind === "quick") {
    return newRefusalCard(
      { reason: "bootstrap-quick", title: options.title.trim() },
      session.cards,
    );
  }
  return createNew(session, bootstrap ? { ...options, bootstrap } : options);
}

async function createNew(session: Session, options: NewOptions): Promise<Output> {
  const { cards } = session;
  const title = options.title.trim();
  if (title.length === 0) return newRefusalCard({ reason: "no-title" }, cards);
  if (options.request?.trim() === "") return newRefusalCard({ reason: "empty-request" }, cards);
  const refusal = await sliceRefusal(session, options.epic, options.slice);
  if (refusal !== undefined) return refusal;
  // Every change gets a worktree of its own unless the repository turned that off.
  const { git: settings } = session.config;
  const inWorktree = options.worktree === true || (settings.worktrees && settings.branchPerChange);
  if (options.from !== undefined && !inWorktree) {
    return newRefusalCard({ reason: "from-without-worktree", from: options.from }, cards);
  }
  const claim = await claimed(session, options);
  if ("refusal" in claim) return claim.refusal;
  if (inWorktree) return newInWorktree(session, claim.options, title);
  return newInFolder(session, claim.options, title);
}

/** `options` with the entries `--resolves` takes, checked before anything is created. */
async function claimed(
  session: Session,
  options: NewOptions,
): Promise<{ readonly options: NewOptions } | { readonly refusal: Output }> {
  const ids = options.resolves ?? [];
  const claim = ids.length === 0 ? { entries: [] } : await claimEntries(session, ids);
  if ("refusal" in claim) return claim;
  // Another open change it may duplicate stops it too (ADR 0016): the user decides.
  const duplicates = await duplicatesOf(session, {
    title: options.title.trim(),
    ...(options.request !== undefined ? { request: options.request.trim() } : {}),
    follows: options.follows,
    ...(options.epic !== undefined ? { epic: options.epic } : {}),
    distinctFrom: options.distinctFrom ?? [],
  });
  if (duplicates.length > 0) return { refusal: duplicateCard(duplicates, session.cards) };
  return { options: claim.entries.length > 0 ? { ...options, claimed: claim.entries } : options };
}

/** Without worktrees: the change starts in this folder, which must hold no other one. */
async function newInFolder(session: Session, options: NewOptions, title: string): Promise<Output> {
  const { cards } = session;
  const settings = session.config.git;
  const active = await resolveActive(session);
  if (active !== undefined && !isFinished(active.state)) {
    return newRefusalCard(
      {
        reason: "in-progress",
        id: active.state.id,
        phase: active.state.phase,
        branchPerChange: settings.branchPerChange,
      },
      cards,
    );
  }
  const dirty = await dirtyGoverned(session);
  if (dirty.length > 0) return nextCard({ dirty }, cards);

  const changeTitle = options.slug?.trim() ? options.slug : title;
  const id = await uniqueId(session, makeChangeId(session.environment.now(), changeTitle));
  const branch = settings.branchPerChange ? await branchFor(session, options, id) : undefined;
  if (branch !== undefined) {
    await session.git.output(["switch", "-q", "-c", branch]);
    await markBranch(session.git, branch, id);
  } else await writePointer(session.git, "active", id);
  const created = await createChange(session, options, {
    id,
    title,
    branch,
    baseCommit: await session.git.head(),
    dir: session.paths.changeDir(id),
  });
  return withLead(
    changeCreatedLead(id, branch, cards),
    nextCard({ change: await changeView(session, created), dirty: [] }, cards),
  );
}

/**
 * `specty new --worktree`: the change gets its own branch and folder, so another session can keep
 * working here. This folder's change and uncommitted code are not looked at: nothing here moves.
 */
async function newInWorktree(
  session: Session,
  options: NewOptions,
  title: string,
): Promise<Output> {
  const { cards, git } = session;
  if (!session.config.git.branchPerChange) {
    return newRefusalCard({ reason: "worktree-without-branches" }, cards);
  }
  const base = await parallelBase(git, options.from, session.config.git.target);
  if (base.commit === undefined) {
    return newRefusalCard({ reason: "unknown-base", base: base.name }, cards);
  }
  // Folders of changes already closed (and incorporated) or cancelled are no longer needed.
  const { removed } = await removeFinished(session);
  const home = await worktreesHome(git);
  const changeTitle = options.slug?.trim() ? options.slug : title;
  const id = await uniqueId(session, makeChangeId(session.environment.now(), changeTitle), home);
  const branch = await branchFor(session, options, id);
  const folder = join(home, id);
  const { hooks, workspace } = await addWorktree(git, { folder, branch, base: base.commit });
  const unmarked = await markOrUndo(session, { folder, branch, id });
  if (unmarked !== undefined) return unmarked;
  await createChange(session, options, {
    id,
    title,
    branch,
    baseCommit: base.commit,
    dir: repoPaths(folder).changeDir(id),
  });
  const prepared = await prepareWorktree(session, folder);
  // The conversation that creates it works there, even before it enters it; a subagent's command
  // names the session that launched it, which stays where it was.
  if (options.subagent !== true) await bindNew(session, folder, options.epic);
  const card = worktreeCreatedCard(
    {
      id,
      branch,
      folder,
      from: `${base.name} (${base.commit.slice(0, 7)})`,
      ...(prepared !== undefined ? { prepared } : {}),
      copied: hooks,
      ...(workspace !== undefined ? { workspace } : {}),
      removed,
      // With Specty's worktree hooks, entering by name skips the prompt a folder outside `.claude` gets.
      byName: await entersByName(session.root),
      // Any other agent carries on in a session of its own, which the card says how to open.
      agent: session.tool,
      ...(options.subagent === true ? { subagent: true } : {}),
      // Claude Code's session does not enter one worktree from another: it leaves this one first.
      ...((await apartFromMain(git)) ? { fromWorktree: true } : {}),
    },
    cards,
  );
  // Its development servers get ports of their own (`dev.ports`), apart from other folders'.
  return withDevPorts(card, await portsOf(session, folder), session.lang);
}

/**
 * Ties the new worktree's branch to its change; `markBranch` already tries again while another
 * process holds git's configuration. If git still cannot, the folder and the branch `new` has just
 * made go again, so no folder is left without its change and running `new` again gives the same
 * id; the card says what failed and what was undone. Any other error goes on up.
 */
async function markOrUndo(
  session: Session,
  made: { readonly folder: string; readonly branch: string; readonly id: string },
): Promise<Output | undefined> {
  const { git } = session;
  try {
    await markBranch(git, made.branch, made.id);
    return undefined;
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    // `--force`: the folder holds the agent's hook files, copied there unversioned.
    await git.run(["worktree", "remove", "--force", made.folder]);
    await git.run(["branch", "-D", made.branch]);
    return gitFailedCard(gitFailure(error), session.cards, made);
  }
}

/**
 * The change's branch, as `git.branchPattern` or else `git.flow` names it (Specty's own when
 * neither is set), and free.
 */
async function branchFor(session: Session, options: NewOptions, id: string): Promise<string> {
  if (options.branch !== undefined && options.branch.trim().length > 0) {
    return freeBranch(session.git, options.branch.trim());
  }
  const { flow = "specty", branchPattern } = session.config.git;
  const { kind, type } = options;
  const title = (options.slug?.trim() ? options.slug : options.title).trim();
  const pattern = branchPattern !== undefined ? { pattern: branchPattern } : {};
  return freeBranch(session.git, branchName({ flow, kind, type, id, title, ...pattern }));
}

/** Writes the spec skeleton and the initial state of a new change in `target.dir`. */
async function createChange(
  session: Session,
  options: NewOptions,
  target: {
    readonly id: string;
    readonly title: string;
    readonly branch: string | undefined;
    readonly baseCommit: string | undefined;
    readonly dir: string;
  },
): Promise<StoredChange> {
  const { id, branch } = target;
  const files = changeFiles(target.dir);
  await writeText(files.spec, skeleton(session, options, target.title));
  const state = initialState({ id, kind: options.kind, branch, baseCommit: target.baseCommit });
  const created = await commitState(
    session,
    { files, state, archived: false },
    state,
    "change.created",
    createdData(options, branch),
  );
  await takeEntries(session, targetOf(session, id), id, options.claimed ?? []);
  return created;
}

/** What `change.created` records: the change's lane, branch and origin, only what it has. */
function createdData(options: NewOptions, branch: string | undefined): Record<string, unknown> {
  const claimed = options.claimed ?? [];
  const distinct = options.distinctFrom ?? [];
  return {
    kind: options.kind,
    type: options.type,
    ...(branch !== undefined ? { branch } : {}),
    ...(options.follows.length > 0 ? { follows: options.follows } : {}),
    ...(claimed.length > 0 ? { resolves: claimed.map((entry) => entry.id) } : {}),
    ...(distinct.length > 0 ? { distinctFrom: distinct } : {}),
    ...(options.epic !== undefined ? { epic: options.epic, slice: options.slice } : {}),
    ...(options.request !== undefined ? { request: options.request.trim() } : {}),
    ...(options.bootstrap === true ? { bootstrap: true } : {}),
  };
}

/** The spec's skeleton: its frontmatter and title, and the sections that come written. */
function skeleton(session: Session, options: NewOptions, title: string): string {
  return specTemplate({
    kind: options.kind,
    lang: session.lang,
    title,
    follows: options.follows,
    ...(options.epic !== undefined ? { epic: options.epic } : {}),
    ...(options.slice !== undefined ? { slice: options.slice } : {}),
    ...(options.timebox !== undefined ? { timebox: options.timebox } : {}),
    ...(options.bootstrap === true ? { bootstrap: true } : {}),
    ...(options.sections !== undefined ? { prefilled: options.sections } : {}),
  });
}

/** An id no change, branch or worktree folder (`home`) uses yet. */
async function uniqueId(
  session: Session,
  base: string,
  home?: string,
  attempt = 1,
): Promise<string> {
  const candidate = attempt === 1 ? base : `${base}-${attempt}`;
  const taken =
    (await exists(session.paths.changeDir(candidate))) ||
    (home !== undefined && (await exists(join(home, candidate)))) ||
    (await session.git.run(["rev-parse", "--verify", "-q", `refs/heads/specty/${candidate}`]))
      .code === 0;
  return taken ? uniqueId(session, base, home, attempt + 1) : candidate;
}
