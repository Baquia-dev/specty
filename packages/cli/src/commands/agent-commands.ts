// SPDX-License-Identifier: Apache-2.0
import {
  CHANGE_KINDS,
  type ChangeKind,
  newRefusalCard,
  type Output,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { bareCards, type Session } from "../session";
import { adjust } from "./adjust";
import { enter } from "./enter";
import { integrate } from "./integrate";
import { type NewOptions, newChange } from "./new";
import { next } from "./next";
import { propose } from "./propose";
import { retro } from "./retro";
import { review } from "./review";
import { scopeAdd } from "./scope";
import { taskDone } from "./task";

type Run = (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>;

/**
 * Registers the agent's commands (ARCHITECTURE §6): the flow it follows and the work of its
 * tasks. `refuse` shows what is refused before any session opens, such as an unknown kind.
 */
export function agentCommands(
  program: Command,
  run: Run,
  env: NodeJS.ProcessEnv,
  refuse: (output: Output) => void,
): void {
  program.command("next").description("what to do now").action(run(next));
  program
    .command("enter")
    .description("go on in a change's folder from this conversation")
    .argument("<id>")
    .action((id: string) => run((session) => enter(session, id))());
  newCommand(program, run, env, refuse);
  program
    .command("propose")
    .description("validate the spec and send it to review")
    .action(run(propose));
  program
    .command("review")
    .description("an independent review of the spec, by the command the person set up")
    .action(run(review));
  taskCommands(program, run);
  program
    .command("integrate")
    .description("finish the merge of the main branch a closing left here")
    .action(run(integrate));
  program
    .command("adjust")
    .description("record the user's adjustment request")
    .argument("<request>")
    .action((request: string) => run((session) => adjust(session, request))());
  program
    .command("retro")
    .description("document staged changes made without a spec")
    .option("--minimal", "write a one-line reason yourself (person only)")
    .action((options: { minimal?: boolean }) =>
      run((session) => retro(session, options.minimal === true))(),
    );
}

/** `specty new`'s options as commander reads them. */
interface NewFlags {
  readonly kind: string;
  readonly follows?: string[];
  readonly epic?: string;
  readonly slice?: string;
  readonly timebox?: string;
  readonly worktree?: boolean;
  readonly from?: string;
  readonly request?: string;
}

/** `specty new`, which refuses an unknown kind before any session opens. */
function newCommand(
  program: Command,
  run: Run,
  env: NodeJS.ProcessEnv,
  refuse: (output: Output) => void,
): void {
  program
    .command("new")
    .description("create a change and its spec")
    .argument("<title>")
    .option("--kind <kind>", `one of ${CHANGE_KINDS.join(", ")}`, "standard")
    .option("--follows <ids...>", "changes this one continues")
    .option("--epic <id>")
    .option("--slice <id>")
    .option("--timebox <duration>", "spike time limit, for example 2h")
    .option("--worktree", "create the change in a new worktree, so this folder keeps its work")
    .option("--from <branch>", "with --worktree, the branch to start from (default: the main one)")
    .option("--request <text>", "the user's literal request, kept in the audit as written")
    .action((title: string, options: NewFlags) => {
      const kind = CHANGE_KINDS.find((candidate) => candidate === options.kind);
      if (kind === undefined) {
        refuse(newRefusalCard({ reason: "unknown-kind", kind: options.kind }, bareCards(env)));
        return Promise.resolve();
      }
      return run((session) => newChange(session, newOptions(title, kind, options)))();
    });
}

function newOptions(title: string, kind: ChangeKind, options: NewFlags): NewOptions {
  return {
    title,
    kind,
    follows: options.follows ?? [],
    ...(options.epic !== undefined ? { epic: options.epic } : {}),
    ...(options.slice !== undefined ? { slice: options.slice } : {}),
    ...(options.timebox !== undefined ? { timebox: options.timebox } : {}),
    worktree: options.worktree === true,
    ...(options.from !== undefined ? { from: options.from } : {}),
    ...(options.request !== undefined ? { request: options.request } : {}),
  };
}

/** The work of a task: completing it, and widening its scope. */
function taskCommands(program: Command, run: Run): void {
  program
    .command("task")
    .description("task commands")
    .command("done")
    .argument("<id>")
    .option("--summary <text>", "what the task did", "")
    .option(
      "--finding <text>",
      "something the next tasks or changes should know; repeatable",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .action((id: string, options: { summary: string; finding: string[] }) =>
      run((session) => taskDone(session, id, options.summary, options.finding))(),
    );
  program
    .command("scope")
    .description("scope commands")
    .command("add")
    .argument("<paths...>")
    .option("--task <id>")
    .option("--reason <text>", "why the task needs the paths", "")
    .action((paths: string[], options: { task?: string; reason: string }) =>
      run((session) => scopeAdd(session, paths, options.reason, options.task))(),
    );
}
