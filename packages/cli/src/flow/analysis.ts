// SPDX-License-Identifier: Apache-2.0
import {
  type Analysis,
  analyzeSpec,
  type ItemPrefix,
  isGlob,
  matchesPattern,
  type ProposePhase,
  parseSpec,
  type RepoSignals,
  type Spec,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { readRevision, readSpec, type StoredChange } from "../store/changes";

/** Validates the change's spec against its history: approved and previous revisions. */
export async function analyzeChange(
  session: Session,
  change: StoredChange,
  phase: ProposePhase,
): Promise<Analysis> {
  const { state, files } = change;
  const approved = await revisionSpec(session, await readRevision(files, state.approved?.revision));
  const previous = await revisionSpec(session, await readRevision(files, state.revision));
  const doneTasks = new Set(
    Object.entries(state.tasks)
      .filter(([, task]) => task.status === "done")
      .map(([id]) => id),
  );
  const maxIds: Partial<Record<ItemPrefix, number>> = {
    ...(state.maxIds.A !== undefined ? { A: state.maxIds.A } : {}),
    ...(state.maxIds.AC !== undefined ? { AC: state.maxIds.AC } : {}),
    ...(state.maxIds.T !== undefined ? { T: state.maxIds.T } : {}),
    ...(state.maxIds.R !== undefined ? { R: state.maxIds.R } : {}),
    ...(state.maxIds.C !== undefined ? { C: state.maxIds.C } : {}),
  };
  const text = await readSpec(files);
  return analyzeSpec(
    text,
    {
      phase,
      config: session.config,
      doneTasks,
      maxIds,
      repo: await repoSignals(session, text),
      ...(approved !== undefined ? { approved } : {}),
      ...(previous !== undefined ? { previous } : {}),
    },
    { language: session.lang },
  );
}

/** What core cannot see: the files each glob of the spec matches today, for its size. */
async function repoSignals(session: Session, text: string): Promise<RepoSignals> {
  const entries = parseSpec(text, { language: session.lang }).spec.sections.files?.items ?? [];
  const globs = [...new Set(entries.map((entry) => entry.path).filter(isGlob))];
  if (globs.length === 0) return {};
  const paths = await session.git.files();
  return {
    globMatches: Object.fromEntries(
      globs.map((glob) => [glob, paths.filter((path) => matchesPattern(path, glob))]),
    ),
  };
}

async function revisionSpec(session: Session, text: string | undefined): Promise<Spec | undefined> {
  return text === undefined ? undefined : parseSpec(text, { language: session.lang }).spec;
}
