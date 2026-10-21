// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type ChangeView,
  dirname,
  parseSpec,
  recommendTaskEffort,
  type Spec,
  specHash,
  type TaskView,
} from "@baquia-dev/specty-core";
import { exists } from "../io/files";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";

/** Everything the cards need about a change, read from its files and from git. */
export async function changeView(session: Session, change: StoredChange): Promise<ChangeView> {
  const { state } = change;
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const commits = await taskCommits(session, state.id);
  const tasks = (spec.sections.tasks?.items ?? []).map((task): TaskView => {
    const stored = state.tasks[task.id];
    const verify = task.verify ?? session.config.verify.default;
    const commit = commits.get(task.id);
    return {
      id: task.id,
      title: task.title,
      status: stored?.status ?? "pending",
      files: task.files,
      extras: stored?.scopeExtra ?? [],
      criteria: criteriaOf(spec, task.ac),
      effort: recommendTaskEffort(task, session.config),
      ...(verify !== undefined ? { verify } : {}),
      ...(stored?.summary !== undefined ? { summary: stored.summary } : {}),
      ...(commit !== undefined ? { commit } : {}),
    };
  });
  const active = tasks.find((task) => task.status === "active");
  const assumptions = spec.sections.assumptions?.items ?? [];
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
    rejected: assumptions.flatMap((item) => {
      const decision = state.items[item.id];
      if (decision?.decision !== "rejected") return [];
      return [
        {
          id: item.id,
          text: item.text,
          ...(decision.comment !== undefined ? { comment: decision.comment } : {}),
        },
      ];
    }),
    ...(state.pending.adjustment !== null ? { adjustment: state.pending.adjustment.request } : {}),
    closingSubmitted: state.closingSubmittedAt !== undefined,
    specChanged:
      state.phase === "implementing" &&
      state.approved !== undefined &&
      specHash(spec) !== state.approved.hash,
  };
}

function criteriaOf(spec: Spec, ac: readonly string[] | "none" | undefined): TaskView["criteria"] {
  if (ac === undefined || ac === "none") return [];
  const criteria = spec.sections.criteria?.items ?? [];
  return ac.flatMap((id) => criteria.filter((criterion) => criterion.id === id));
}

/** Short SHA of each task's commit, found through the `Specty-Task` trailer. */
export async function taskCommits(
  session: Session,
  changeId: string,
): Promise<ReadonlyMap<string, string>> {
  const result = await session.git.run([
    "log",
    "-n",
    "500",
    "--format=%h%x1f%(trailers:key=Specty-Change,valueonly,separator=%x2C)%x1f%(trailers:key=Specty-Task,valueonly,separator=%x2C)",
  ]);
  if (result.code !== 0) return new Map();
  const pairs = result.stdout.split("\n").flatMap((line): [string, string][] => {
    const [sha, change, task] = line.split("\x1f").map((part) => part.trim());
    return sha !== undefined && change === changeId && task !== undefined && task.length > 0
      ? [[task, sha]]
      : [];
  });
  return new Map(pairs.toReversed());
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
