// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  CHANGE_KINDS,
  headerOf,
  type Output,
  translator,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { type Session, systemLanguage } from "../session";
import { adjust } from "./adjust";
import { integrate } from "./integrate";
import { newChange } from "./new";
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
    .action(
      (
        title: string,
        options: {
          kind: string;
          follows?: string[];
          epic?: string;
          slice?: string;
          timebox?: string;
          worktree?: boolean;
          from?: string;
          request?: string;
        },
      ) => {
        const kind = CHANGE_KINDS.find((candidate) => candidate === options.kind);
        if (kind === undefined) {
          const t = translator(systemLanguage(env));
          refuse({
            ...blockedCard(
              headerOf(),
              t(
                `Tipo de cambio desconocido: ${options.kind}.`,
                `Unknown change kind: ${options.kind}.`,
              ),
              `--kind ${CHANGE_KINDS.join("|")}`,
            ),
            status: "invalid",
          });
          return Promise.resolve();
        }
        return run((session) =>
          newChange(session, {
            title,
            kind,
            follows: options.follows ?? [],
            ...(options.epic !== undefined ? { epic: options.epic } : {}),
            ...(options.slice !== undefined ? { slice: options.slice } : {}),
            ...(options.timebox !== undefined ? { timebox: options.timebox } : {}),
            worktree: options.worktree === true,
            ...(options.from !== undefined ? { from: options.from } : {}),
            ...(options.request !== undefined ? { request: options.request } : {}),
          }),
        )();
      },
    );
  program
    .command("propose")
    .description("validate the spec and send it to review")
    .action(run(propose));
  program
    .command("review")
    .description("an independent review of the spec, by the command the person set up")
    .action(run(review));
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
