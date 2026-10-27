// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  branchName,
  type ChangeKind,
  type CommitType,
  changeCreatedLead,
  makeChangeId,
  newRefusalCard,
  nextCard,
  type Output,
  specTemplate,
  withLead,
  worktreeCreatedCard,
} from "@baquia-dev/specty-core";
import { commitState, isFinished, resolveActive } from "../flow/active";
import { freeBranch, markBranch } from "../flow/branches";
import { sliceRefusal } from "../flow/epic";
import { removeFinished } from "../flow/prune";
import { changeView } from "../flow/views";
import { addWorktree, parallelBase, prepareWorktree, worktreesHome } from "../flow/worktree";
import { entersByName } from "../install/agents";
import { freshProject } from "../install/product";
import { exists, writeText } from "../io/files";
import type { Session } from "../session";
import { initialState, type StoredChange } from "../store/changes";
import { writePointer } from "../store/local";
import { changeFiles, repoPaths } from "../store/paths";
import { dirtyGoverned } from "./next";

export interface NewOptions {
  readonly title: string;
  readonly kind: ChangeKind;
  /** What the change is, which names its branch under `git.flow`. */
  readonly type: CommitType;
  readonly follows: readonly string[];
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
  if (inWorktree) return newInWorktree(session, options, title);
  return newInFolder(session, options, title);
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

  const id = await uniqueId(session, makeChangeId(session.environment.now(), title));
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
  const id = await uniqueId(session, makeChangeId(session.environment.now(), title), home);
  const branch = await branchFor(session, options, id);
  const folder = join(home, id);
  const copied = await addWorktree(git, { folder, branch, base: base.commit });
  await markBranch(git, branch, id);
  await createChange(session, options, {
    id,
    title,
    branch,
    baseCommit: base.commit,
    dir: repoPaths(folder).changeDir(id),
  });
  const prepared = await prepareWorktree(session, folder);
  return worktreeCreatedCard(
    {
      id,
      branch,
      folder,
      from: `${base.name} (${base.commit.slice(0, 7)})`,
      ...(prepared !== undefined ? { prepared } : {}),
      copied,
      removed,
      // With Specty's worktree hooks, entering by name skips the prompt a folder outside `.claude` gets.
      byName: await entersByName(session.root),
      // Any other agent carries on in a session of its own, which the card says how to open.
      agent: session.tool,
    },
    cards,
  );
}

/** The change's branch, as `git.flow` names it (Specty's own when unset), and free. */
async function branchFor(session: Session, options: NewOptions, id: string): Promise<string> {
  const flow = session.config.git.flow ?? "specty";
  const { kind, type } = options;
  return freeBranch(session.git, branchName({ flow, kind, type, id, title: options.title.trim() }));
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
  await writeText(
    files.spec,
    specTemplate({
      kind: options.kind,
      lang: session.lang,
      title: target.title,
      follows: options.follows,
      ...(options.epic !== undefined ? { epic: options.epic } : {}),
      ...(options.slice !== undefined ? { slice: options.slice } : {}),
      ...(options.timebox !== undefined ? { timebox: options.timebox } : {}),
      ...(options.bootstrap === true ? { bootstrap: true } : {}),
    }),
  );
  const state = initialState({ id, kind: options.kind, branch, baseCommit: target.baseCommit });
  return commitState(session, { files, state, archived: false }, state, "change.created", {
    kind: options.kind,
    type: options.type,
    ...(branch !== undefined ? { branch } : {}),
    ...(options.follows.length > 0 ? { follows: options.follows } : {}),
    ...(options.epic !== undefined ? { epic: options.epic, slice: options.slice } : {}),
    ...(options.request !== undefined ? { request: options.request.trim() } : {}),
    ...(options.bootstrap === true ? { bootstrap: true } : {}),
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
