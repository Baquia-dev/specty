// SPDX-License-Identifier: Apache-2.0
// The prototype's traceability, from the sample diffs of «Panel de asistencia por curso»: what each
// task added comes from its commit, and the rest from the commit the change started from. The
// titles and criteria of its spec are written here: the main thread does not load core's parser.
import type { WhyCommit } from "@baquia-dev/specty-core";
import { type DiffFile, parseDiff } from "./diff";
import { ActionError, type Bilingual, type ChangeRecord } from "./records";
import { sampleDiff } from "./sample-diffs";
import type { TraceBlock, TraceRecord } from "./trace";

const SAMPLE = "20261018-asistencia-curso";
const TITLE = "Panel de asistencia por curso";

interface SampleTask {
  readonly id: string;
  readonly title: string;
  readonly criteria: readonly { readonly id: string; readonly text: string }[];
}

const AC1 = {
  id: "AC1",
  text: "CUANDO el coordinador abre el panel ENTONCES ve el porcentaje semanal por curso.",
};
const AC2 = {
  id: "AC2",
  text: "CUANDO un estudiante supera tres ausencias en la semana ENTONCES aparece destacado.",
};
/** The sample's tasks, as its spec has them, in order. */
const TASKS: readonly SampleTask[] = [
  { id: "T1", title: "Agregados semanales", criteria: [AC1] },
  { id: "T2", title: "Panel con estudiantes destacados", criteria: [AC1, AC2] },
];

const NO_COMMITS: Bilingual = {
  es: "Este cambio aún no tiene commits.",
  en: "This change has no commits yet.",
};
const NOT_ITS_OWN: Bilingual = {
  es: "Ese archivo no es de este cambio.",
  en: "That file is not this change's.",
};

/** A file of the sample's diffs and the commit of the task that left it. */
interface Left {
  readonly file: DiffFile;
  readonly commit: WhyCommit;
}

/** The files the sample change left, in its tasks' order; any other change has no commits. */
export function sampleTraceFiles(
  records: readonly ChangeRecord[],
  change: string,
): Promise<readonly string[]> {
  const left = leftBy(records, change);
  return left === undefined
    ? Promise.reject(new ActionError(NO_COMMITS))
    : Promise.resolve(left.files.map(({ file }) => file.path));
}

/** `path` as the sample change left it, in blocks with the commit of each. */
export function sampleTrace(
  records: readonly ChangeRecord[],
  change: string,
  path: string,
): Promise<TraceRecord> {
  const left = leftBy(records, change);
  if (left === undefined) return Promise.reject(new ActionError(NO_COMMITS));
  const found = left.files.find(({ file }) => file.path === path);
  if (found === undefined) return Promise.reject(new ActionError(NOT_ITS_OWN));
  const lines = found.file.hunks.flatMap((hunk) =>
    hunk.lines.filter((line) => line.kind !== "removed"),
  );
  return Promise.resolve({
    path,
    commit: left.last,
    lines: lines.map((line) => line.text),
    blocks: blocksOf(lines.map((line) => (line.kind === "added" ? found.commit : left.base))),
  });
}

/** The sample change's files with their commits, its last commit and the one it started from. */
function leftBy(records: readonly ChangeRecord[], change: string) {
  const record = records.find((item) => item.state.id === change);
  if (record === undefined || change !== SAMPLE) return undefined;
  const { tasks } = record.state;
  const base: WhyCommit = {
    commit: tasks.T1?.baseCommit ?? "0000000",
    date: "2026-10-11",
    author: "Ana Gómez",
    subject: "Primera versión del registro de asistencia",
  };
  const files: Left[] = TASKS.flatMap((task) =>
    parseDiff(sampleDiff(change, task.id)).map((file) => ({
      file,
      commit: taskCommit(task, tasks[task.id]?.commit ?? "0000000", tasks[task.id]?.doneAt),
    })),
  );
  return { files, base: base, last: tasks.T2?.commit ?? base.commit };
}

function taskCommit(task: SampleTask, commit: string, doneAt: string | undefined): WhyCommit {
  return {
    commit,
    date: (doneAt ?? "2026-10-18").slice(0, 10),
    author: "Ana Gómez",
    subject: `feat(attendance): ${task.title}`,
    change: {
      id: SAMPLE,
      title: TITLE,
      task: { id: task.id, title: task.title },
      criteria: task.criteria,
    },
  };
}

/** The lines in a row from the same commit, as one block each. */
function blocksOf(owners: readonly WhyCommit[]): TraceBlock[] {
  const blocks: TraceBlock[] = [];
  owners.forEach((commit, index) => {
    const last = blocks.at(-1);
    if (last?.commit === commit) blocks[blocks.length - 1] = { ...last, end: index + 1 };
    else blocks.push({ start: index + 1, end: index + 1, commit });
  });
  return blocks;
}
