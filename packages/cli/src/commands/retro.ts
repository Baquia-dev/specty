// SPDX-License-Identifier: Apache-2.0
import {
  type ChangedFile,
  type ChangeState,
  type FileEntry,
  headerOf,
  isGoverned,
  makeChangeId,
  moduleOf,
  type Output,
  parseSpec,
  retroCreatedCard,
  retroDoneCard,
  retroReasonQuestion,
  retroRefusalCard,
  retroTitle,
  type Spec,
  serializeSpec,
  shortHash,
  specHash,
  specTemplate,
} from "@baquia-dev/specty-core";
import { commitState, isFinished } from "../flow/active";
import { finishRetro } from "../flow/finish";
import { writeText } from "../io/files";
import type { Session } from "../session";
import { initialState, loadChange, readSpec, type StoredChange } from "../store/changes";
import { readPointer, writePointer } from "../store/local";
import { changeFiles } from "../store/paths";
import { propose } from "./propose";

/**
 * `specty retro`: documents governed changes that are already staged. The agent writes the
 * spec; with `--minimal` (if enabled) the person writes a one-line reason instead.
 */
export async function retro(session: Session, minimal: boolean): Promise<Output> {
  const { cards } = session;
  const current = await readPointer(session.git, "retro");
  const existing = current === undefined ? undefined : await loadChange(session.paths, current);
  if (existing !== undefined && !isFinished(existing.state)) {
    return retroRefusalCard(
      { reason: "in-progress", id: existing.state.id, phase: existing.state.phase },
      cards,
    );
  }
  const staged = (await session.git.staged()).filter(
    (file) =>
      !file.path.startsWith(".specty/") &&
      (isGoverned(file.path, session.config) ||
        (file.from !== undefined && isGoverned(file.from, session.config))),
  );
  if (staged.length === 0) return retroRefusalCard({ reason: "nothing-staged" }, cards);
  if (minimal) return minimalRetro(session, staged);
  const change = await createRetro(session, staged);
  return retroCreatedCard(
    headerOf(change.state.id, "draft"),
    session.paths.relative(change.files.spec),
    staged.map((file) => file.path),
    cards,
  );
}

async function createRetro(
  session: Session,
  staged: readonly ChangedFile[],
): Promise<StoredChange> {
  const tree = await session.git.writeTree();
  const modules = [...new Set(staged.map((file) => moduleOf(file.path)))].join(", ");
  const id = makeChangeId(session.environment.now(), `retro ${shortHash(tree)}`);
  const files = changeFiles(session.paths.changeDir(id));
  await writeText(
    files.spec,
    specTemplate({
      kind: "retro",
      lang: session.lang,
      title: retroTitle(modules, session.lang),
      files: staged.map(entryOf),
    }),
  );
  const state = initialState({ id, kind: "retro", baseCommit: await session.git.head() });
  await writePointer(session.git, "retro", id);
  return commitState(session, { files, state, archived: false }, state, "change.created", {
    kind: "retro",
    tree,
  });
}

async function minimalRetro(session: Session, staged: readonly ChangedFile[]): Promise<Output> {
  const { terminal } = session.environment;
  if (!terminal.interactive || session.config.retro.mode !== "minimal") {
    return retroRefusalCard({ reason: "minimal-unavailable" }, session.cards);
  }
  const reason = (await terminal.ask(retroReasonQuestion(session.lang)))?.trim();
  if (reason === undefined || reason.length === 0) {
    return retroRefusalCard({ reason: "no-reason" }, session.cards);
  }
  const change = await createRetro(session, staged);
  const spec: Spec = {
    language: session.lang,
    title: parseSpec(await readSpec(change.files)).spec.title,
    frontmatter: { kind: "retro", follows: [], dependsOn: [] },
    sections: {
      goal: reason,
      reason,
      files: { none: false, items: staged.map(entryOf) },
      risks: { none: true, items: [] },
    },
  };
  await writeText(change.files.spec, serializeSpec(spec));
  const proposed = await propose(session);
  if (proposed.status !== "ok") return proposed;
  const reloaded = await loadChange(session.paths, change.state.id);
  if (reloaded === undefined) return proposed;
  const approved: ChangeState = {
    ...reloaded.state,
    approved: {
      revision: reloaded.state.revision,
      hash: specHash(spec),
      at: session.environment.now().toISOString(),
      by: (await session.git.config("user.name")) ?? "unknown",
      channel: "tty",
    },
  };
  return retroDone(session, await finishRetro(session, reloaded, approved));
}

/** The retro is documented: the person repeats their commit. */
export function retroDone(session: Session, change: StoredChange): Output {
  return retroDoneCard(change.state.id, session.cards);
}

function entryOf(file: ChangedFile): FileEntry {
  switch (file.status) {
    case "added":
      return { action: "create", path: file.path };
    case "deleted":
      return { action: "delete", path: file.path };
    case "renamed":
      return file.from === undefined
        ? { action: "create", path: file.path }
        : { action: "rename", path: file.path, from: file.from };
    case "modified":
      return { action: "modify", path: file.path };
  }
}
