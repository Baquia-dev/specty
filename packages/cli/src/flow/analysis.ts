// SPDX-License-Identifier: Apache-2.0
import {
  type Analysis,
  analyzeSpec,
  type ItemPrefix,
  type ProposePhase,
  parseSpec,
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
  return analyzeSpec(
    await readSpec(files),
    {
      phase,
      config: session.config,
      doneTasks,
      maxIds,
      ...(approved !== undefined ? { approved } : {}),
      ...(previous !== undefined ? { previous } : {}),
    },
    { language: session.lang },
  );
}

async function revisionSpec(session: Session, text: string | undefined): Promise<Spec | undefined> {
  return text === undefined ? undefined : parseSpec(text, { language: session.lang }).spec;
}
