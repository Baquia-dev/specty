// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  CHANGE_KINDS,
  EXIT_CODES,
  headerOf,
  type Lang,
  notInitializedCard,
  type Output,
  renderText,
  translator,
} from "@baquia-dev/specty-core";
import { Argument, Command, CommanderError } from "commander";
import { accept } from "./commands/accept";
import { adjust } from "./commands/adjust";
import { approve } from "./commands/approve";
import { delegate } from "./commands/delegate";
import { doctor } from "./commands/doctor";
import { cancel, close } from "./commands/finish";
import { type PersonAction, personSession } from "./commands/human";
import { initCommand } from "./commands/init";
import { integrate } from "./commands/integrate";
import { newChange } from "./commands/new";
import { next } from "./commands/next";
import { propose } from "./commands/propose";
import { prune } from "./commands/prune";
import { retro } from "./commands/retro";
import { review } from "./commands/review";
import { scopeAdd } from "./commands/scope";
import { reject } from "./commands/scope-decision";
import { status } from "./commands/status";
import { taskDone } from "./commands/task";
import { ui } from "./commands/ui";
import { enforcementCommands } from "./enforce/commands";
import { bareCards, type Environment, openSession, type Session, systemLanguage } from "./session";

export interface CliEnvironment extends Environment {
  readonly stdin: () => Promise<string>;
}

/** Runs one command and returns its exit code (0 ok, 1 invalid, 2 blocked by the flow). */
export async function runCli(
  argv: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  let code = 0;
  let json = false;
  const emit = (output: Output, lang: Lang) => {
    environment.io.out(
      json
        ? JSON.stringify({ ...output, exitCode: EXIT_CODES[output.status] })
        : renderText(output, lang),
    );
    code = EXIT_CODES[output.status];
  };
  const run = (handler: (session: Session) => Promise<Output>) => async () => {
    const opened = await openSession(environment);
    const cards = bareCards(environment.env);
    const t = translator(cards.lang);
    switch (opened.kind) {
      case "no-git":
        return emit(
          blockedCard(
            headerOf(),
            t("Esto no es un repositorio git.", "This is not a git repository."),
            t("ejecuta `git init`.", "run `git init`."),
          ),
          cards.lang,
        );
      case "missing":
        return emit(notInitializedCard(cards), cards.lang);
      case "invalid":
        return emit(
          {
            ...blockedCard(
              headerOf(),
              opened.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
              t("corrige .specty/config.yaml.", "fix .specty/config.yaml."),
            ),
            status: "invalid",
          },
          cards.lang,
        );
      case "ok":
        return emit(await handler(opened.session), opened.session.lang);
    }
  };
  const program = new Command("specty")
    .description("Spec-driven development, enforced, for any AI coding agent.")
    .option("--json", "print the output as JSON")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => environment.io.out(text.trimEnd()),
      writeErr: (text) => environment.io.err(text.trimEnd()),
    })
    .hook("preAction", (command) => {
      json = command.opts<{ json?: boolean }>().json === true;
    });

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
          const t = translator(systemLanguage(environment.env));
          emit(
            {
              ...blockedCard(
                headerOf(),
                t(
                  `Tipo de cambio desconocido: ${options.kind}.`,
                  `Unknown change kind: ${options.kind}.`,
                ),
                `--kind ${CHANGE_KINDS.join("|")}`,
              ),
              status: "invalid",
            },
            systemLanguage(environment.env),
          );
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
  /** A person's decision runs in the folder of the change it applies to, from any folder. */
  const decide = (
    action: PersonAction,
    options: { readonly id: string | undefined; readonly scope?: string | undefined },
    handler: (session: Session) => Promise<Output>,
  ) =>
    run(async (session) => {
      const chosen = await personSession(session, action, options);
      return chosen.kind === "output" ? chosen.output : handler(chosen.session);
    })();
  const CHANGE = ["[change]", "the change's id (default: the one waiting)"] as const;
  program
    .command("approve")
    .description("approve the spec or a scope request (person only)")
    .argument(...CHANGE)
    .option("--scope <id>")
    .action((id: string | undefined, options: { scope?: string }) =>
      decide("approve", { id, scope: options.scope }, (session) => approve(session, options.scope)),
    );
  program
    .command("reject")
    .description("reject a scope request (person only)")
    .argument(...CHANGE)
    .requiredOption("--scope <id>")
    .option("--reason <text>")
    .action((id: string | undefined, options: { scope: string; reason?: string }) =>
      decide("reject", { id, scope: options.scope }, (session) =>
        reject(session, options.scope, options.reason),
      ),
    );
  program
    .command("accept")
    .description("accept the result (person only)")
    .argument(...CHANGE)
    .action((id: string | undefined) => decide("accept", { id }, accept));
  program
    .command("close")
    .description("confirm the closing (person only)")
    .argument(...CHANGE)
    .action((id: string | undefined) => decide("close", { id }, close));
  program
    .command("cancel")
    .description("cancel the change (person only)")
    .argument(...CHANGE)
    .option("--reason <text>")
    .action((id: string | undefined, options: { reason?: string }) =>
      decide("cancel", { id }, (session) => cancel(session, options.reason)),
    );
  program
    .command("delegate")
    .description("let your agent take your decisions, or take them back (person only)")
    .addArgument(new Argument("<mode>", "on or off").choices(["on", "off"]))
    .action((mode: string) => run((session) => delegate(session, mode === "on" ? "on" : "off"))());
  program.command("status").description("open changes and pending decisions").action(run(status));
  program.command("doctor").description("check configuration and hooks").action(run(doctor));
  program
    .command("init")
    .description("set up Specty in this repository")
    .option("--language <lang>", "es or en")
    .option("--tools <list>", "comma-separated agent tools, for example claude-code,cursor")
    .action(async (options: { language?: string; tools?: string }) => {
      const { output, lang } = await initCommand(environment, options);
      emit(output, lang);
    });
  program
    .command("prune")
    .description("remove the folders of finished changes and the branches already merged")
    .action(run(prune));
  program
    .command("ui")
    .description("serve the changes of every worktree on localhost, until Ctrl+C")
    .option("--port <port>", "the port to try first (default: 4173)")
    .action((options: { port?: string }) => run((session) => ui(session, options.port))());
  enforcementCommands(program, environment, (exit) => {
    code = exit;
  });

  try {
    await program.parseAsync([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 1;
    throw error;
  }
  return code;
}
