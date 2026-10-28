// SPDX-License-Identifier: Apache-2.0
import {
  CHANGE_KINDS,
  type ChangeKind,
  COMMIT_TYPES,
  type CommitType,
  type NewRefusal,
  newRefusalCard,
  type Output,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { withChangeLock } from "../flow/active";
import { bareCards, type Session } from "../session";
import { adjust } from "./adjust";
import { enter } from "./enter";
import { integrate } from "./integrate";
import { type NewOptions, newChange } from "./new";
import { next } from "./next";
import { propose } from "./propose";
import { retro } from "./retro";
import { retroInto } from "./retro-into";
import { review } from "./review";
import { scopeAdd } from "./scope";
import { taskDone } from "./task";

type Run = (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>;

/** A command that changes its folder's change runs with that change locked (ARCHITECTURE §9). */
const locked = (run: Run, command: string) => (handler: (session: Session) => Promise<Output>) =>
  run((session) => withChangeLock(session, command, () => handler(session)));

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
  program.command("next").description("what to do now").action(locked(run, "next")(next));
  program
    .command("enter")
    .description("go on in a change's folder from this conversation")
    .argument("<id>")
    .action((id: string) => run((session) => enter(session, id))());
  newCommand(program, run, env, refuse);
  program
    .command("propose")
    .description("validate the spec and send it to review")
    .action(locked(run, "propose")(propose));
  program
    .command("review")
    .description("an independent review of the spec, by the command the person set up")
    .action(locked(run, "review")(review));
  taskCommands(program, run);
  program
    .command("integrate")
    .description("finish the merge of the main branch a closing left here")
    .action(locked(run, "integrate")(integrate));
  program
    .command("adjust")
    .description("record the user's adjustment request")
    .argument("<request>")
    .action((request: string) => locked(run, "adjust")((session) => adjust(session, request))());
  program
    .command("retro")
    .description("document staged changes made without a spec")
    .option("--minimal", "write a one-line reason yourself (person only)")
    .option("--into <id>", "document them as a scope request of the active change")
    .option("--reason <text>", "with --into: why they were made")
    .action((options: { minimal?: boolean; into?: string; reason?: string }) =>
      locked(
        run,
        "retro",
      )((session) =>
        options.into === undefined
          ? retro(session, options.minimal === true)
          : retroInto(session, options.into, options.reason ?? "", options.minimal === true),
      )(),
    );
}

/** `specty new`'s options as commander reads them. */
interface NewFlags {
  readonly kind: string;
  readonly type: string;
  readonly follows?: string[];
  readonly epic?: string;
  readonly slice?: string;
  readonly timebox?: string;
  readonly worktree?: boolean;
  readonly from?: string;
  readonly request?: string;
}

/** `specty new`, which refuses an unknown kind or type before any session opens. */
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
    .option(
      "--type <type>",
      `what the change is, which names its branch under git.flow: one of ${COMMIT_TYPES.join(", ")}`,
      "feat",
    )
    .option("--follows <ids...>", "changes this one continues")
    .option("--epic <id>")
    .option("--slice <id>")
    .option("--timebox <duration>", "spike time limit, for example 2h")
    .option("--worktree", "create the change in a new worktree, so this folder keeps its work")
    .option("--from <branch>", "with --worktree, the branch to start from (default: the main one)")
    .option("--request <text>", "the user's literal request, kept in the audit as written")
    .action((title: string, options: NewFlags) => {
      const given = kindAndType(options);
      if ("reason" in given) {
        refuse(newRefusalCard(given, bareCards(env)));
        return Promise.resolve();
      }
      return run((session) => newChange(session, newOptions(title, given, options)))();
    });
}

interface KindAndType {
  readonly kind: ChangeKind;
  readonly type: CommitType;
}

/** The kind and type `new` was given, or why they are refused. */
function kindAndType(options: NewFlags): KindAndType | NewRefusal {
  const kind = CHANGE_KINDS.find((candidate) => candidate === options.kind);
  if (kind === undefined) return { reason: "unknown-kind", kind: options.kind };
  const type = COMMIT_TYPES.find((candidate) => candidate === options.type);
  if (type === undefined) return { reason: "unknown-type", type: options.type };
  return { kind, type };
}

function newOptions(title: string, given: KindAndType, options: NewFlags): NewOptions {
  return {
    title,
    kind: given.kind,
    type: given.type,
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
      locked(
        run,
        "task done",
      )((session) => taskDone(session, id, options.summary, options.finding))(),
    );
  program
    .command("scope")
    .description("scope commands")
    .command("add")
    .argument("<paths...>")
    .option("--task <id>")
    .option("--reason <text>", "why the task needs the paths", "")
    .action((paths: string[], options: { task?: string; reason: string }) =>
      locked(
        run,
        "scope add",
      )((session) => scopeAdd(session, paths, options.reason, options.task))(),
    );
}
