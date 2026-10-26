// SPDX-License-Identifier: Apache-2.0
import { type FileHandle, open } from "node:fs/promises";
import { join } from "node:path";
import {
  type Analysis,
  analyzeSpec,
  type ItemPrefix,
  isGeneratedText,
  isGlob,
  isGoverned,
  matchesPattern,
  type ProposePhase,
  parseSpec,
  type RepoSignals,
  type Spec,
} from "@baquia-dev/specty-core";
import { isMissing } from "../io/files";
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

/**
 * What core cannot see, for the size: the files each glob of the spec matches today, and which of
 * those files and of the listed ones are generated or binary by their content.
 */
async function repoSignals(session: Session, text: string): Promise<RepoSignals> {
  const entries = parseSpec(text, { language: session.lang }).spec.sections.files?.items ?? [];
  const listed = [...new Set(entries.map((entry) => entry.path))];
  const globs = listed.filter(isGlob);
  const paths = globs.length > 0 ? await session.git.files() : [];
  const globMatches = Object.fromEntries(
    globs.map((glob) => [glob, paths.filter((path) => matchesPattern(path, glob))]),
  );
  const candidates = new Set([
    ...listed.filter((path) => !isGlob(path)),
    ...Object.values(globMatches).flat(),
  ]);
  const generated = await generatedAmong(session, [...candidates]);
  return {
    ...(globs.length > 0 ? { globMatches } : {}),
    ...(generated.length > 0 ? { generated } : {}),
  };
}

/** How much of a file shows whether it is generated: a mark in its first lines, or a null byte. */
const HEAD_BYTES = 8192;

/**
 * The governed ones among `paths` that are generated or binary; one file at a time, as a glob may
 * match thousands. A file that does not exist yet is hand-written.
 */
async function generatedAmong(session: Session, paths: readonly string[]): Promise<string[]> {
  const generated: string[] = [];
  for (const path of paths.filter((candidate) => isGoverned(candidate, session.config))) {
    const head = await headOf(join(session.root, path));
    if (head !== undefined && isGeneratedText(head)) generated.push(path);
  }
  return generated;
}

/** The first bytes of a file, or undefined when it is missing or a folder. */
async function headOf(path: string): Promise<string | undefined> {
  let file: FileHandle | undefined;
  try {
    file = await open(path, "r");
    const { buffer, bytesRead } = await file.read(Buffer.alloc(HEAD_BYTES), 0, HEAD_BYTES, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } catch (error) {
    if (
      isMissing(error) ||
      (error instanceof Error && "code" in error && error.code === "EISDIR")
    ) {
      return undefined;
    }
    throw error;
  } finally {
    await file?.close();
  }
}

async function revisionSpec(session: Session, text: string | undefined): Promise<Spec | undefined> {
  return text === undefined ? undefined : parseSpec(text, { language: session.lang }).spec;
}
