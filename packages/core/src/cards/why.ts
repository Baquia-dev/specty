// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { translator } from "./text";
import type { CardContext, CriterionView } from "./view";

/** Where a file or a line comes from (`specty why`, ARCHITECTURE §13): its commits, newest first. */
export interface WhyView {
  /** As it was asked: `src/app.ts:12`, or a file. */
  readonly target: string;
  /** The line is in no commit yet. */
  readonly uncommitted?: boolean;
  readonly commits: readonly WhyCommit[];
}

export interface WhyCommit {
  /** Short hash. */
  readonly commit: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly author: string;
  readonly subject: string;
  /** The Specty change its trailers name; none for a commit made outside Specty. */
  readonly change?: {
    readonly id: string;
    /** Undefined when the change is not in this folder. */
    readonly title?: string;
    readonly task?: { readonly id: string; readonly title?: string };
    /** The criteria the task covers, with their text. */
    readonly criteria: readonly CriterionView[];
    /** `Specty-Spec`: `r2@4be1c2d`, the revision the task implemented. */
    readonly spec?: string;
  };
}

/** The why card: each commit, and the change, task, criteria and spec revision behind it. */
export function whyCard(view: WhyView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const first = view.commits[0];
  if (view.uncommitted === true || first === undefined) {
    return {
      status: "ok",
      header: headerOf("why"),
      blocks: section(undefined, [
        t(
          `${view.target}: la línea aún no está en ningún commit.`,
          `${view.target}: the line is in no commit yet.`,
        ),
      ]),
      next: t(
        `cuando su tarea haga el commit (\`${ctx.command} task done\`), vuelve a preguntar.`,
        `once its task makes the commit (\`${ctx.command} task done\`), ask again.`,
      ),
    };
  }
  return {
    status: "ok",
    header: headerOf("why"),
    blocks: section(
      view.target,
      view.commits.flatMap((entry) => [
        `${entry.commit} · ${entry.date} · ${entry.author} · ${entry.subject}`,
        ...behind(entry, ctx).map((line) => `  ${line}`),
      ]),
    ),
    next: t(
      `para ver el commit entero, \`git show ${first.commit}\`.`,
      `to see the whole commit, \`git show ${first.commit}\`.`,
    ),
  };
}

/** What a commit belongs to: its change, its task and the criteria it covers, and the spec. */
function behind(entry: WhyCommit, ctx: CardContext): string[] {
  const t = translator(ctx.lang);
  const { change } = entry;
  if (change === undefined)
    return [t("No es de ningún cambio de Specty.", "It belongs to no Specty change.")];
  const revision = /^r(\d+)@(\w+)$/.exec(change.spec ?? "");
  return [
    change.title === undefined
      ? t(
          `Cambio ${change.id} (no está en esta carpeta)`,
          `Change ${change.id} (not in this folder)`,
        )
      : t(`Cambio ${change.id}: ${change.title}`, `Change ${change.id}: ${change.title}`),
    ...(change.task === undefined
      ? []
      : [
          change.task.title === undefined
            ? t(`Tarea ${change.task.id}`, `Task ${change.task.id}`)
            : t(
                `Tarea ${change.task.id}: ${change.task.title}`,
                `Task ${change.task.id}: ${change.task.title}`,
              ),
        ]),
    ...change.criteria.map((criterion) => `${criterion.id}: ${criterion.text}`),
    ...(revision === null
      ? []
      : [
          t(
            `Spec: revisión ${revision[1]} (${revision[2]})`,
            `Spec: revision ${revision[1]} (${revision[2]})`,
          ),
        ]),
  ];
}
