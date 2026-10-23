// SPDX-License-Identifier: Apache-2.0
import {
  blockedCard,
  CHANGE_KINDS,
  EXIT_CODES,
  headerOf,
  isAgentTool,
  type Lang,
  notInitializedCard,
  type Output,
  renderText,
  translator,
} from "@baquia-dev/specty-core";
import { Command, CommanderError } from "commander";
import { accept } from "./commands/accept";
import { adjust } from "./commands/adjust";
import { approve } from "./commands/approve";
import { doctor } from "./commands/doctor";
import { cancel, close } from "./commands/finish";
import { init } from "./commands/init";
import { newChange } from "./commands/new";
import { next } from "./commands/next";
import { propose } from "./commands/propose";
import { retro } from "./commands/retro";
import { scopeAdd } from "./commands/scope";
import { reject } from "./commands/scope-decision";
import { status } from "./commands/status";
import { taskDone } from "./commands/task";
import { guard } from "./enforce/guard";
import { preCommit, prepareCommitMsg } from "./enforce/hook";
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
          }),
        )();
      },
    );
  program
    .command("propose")
    .description("validate the spec and send it to review")
    .action(run(propose));
  program
    .command("task")
    .description("task commands")
    .command("done")
    .argument("<id>")
    .option("--summary <text>", "what the task did", "")
    .action((id: string, options: { summary: string }) =>
      run((session) => taskDone(session, id, options.summary))(),
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
  program
    .command("approve")
    .description("approve the spec or a scope request (person only)")
    .option("--scope <id>")
    .action((options: { scope?: string }) => run((session) => approve(session, options.scope))());
  program
    .command("reject")
    .description("reject a scope request (person only)")
    .requiredOption("--scope <id>")
    .option("--reason <text>")
    .action((options: { scope: string; reason?: string }) =>
      run((session) => reject(session, options.scope, options.reason))(),
    );
  program.command("accept").description("accept the result (person only)").action(run(accept));
  program.command("close").description("confirm the closing (person only)").action(run(close));
  program
    .command("cancel")
    .description("cancel the change (person only)")
    .option("--reason <text>")
    .action((options: { reason?: string }) => run((session) => cancel(session, options.reason))());
  program.command("status").description("open changes and pending decisions").action(run(status));
  program.command("doctor").description("check configuration and hooks").action(run(doctor));
  program
    .command("init")
    .description("set up Specty in this repository")
    .option("--language <lang>", "es or en")
    .option("--tools <list>", "comma-separated agent tools, for example claude-code,cursor")
    .action(async (options: { language?: string; tools?: string }) => {
      const language =
        options.language === "es" || options.language === "en" ? options.language : undefined;
      const tools = options.tools
        ?.split(",")
        .map((tool) => tool.trim())
        .filter(isAgentTool);
      emit(
        await init(environment, {
          ...(language !== undefined ? { language } : {}),
          ...(tools !== undefined ? { tools } : {}),
        }),
        language ?? systemLanguage(environment.env),
      );
    });
  program
    .command("hook", { hidden: true })
    .argument("<name>")
    .argument("[args...]")
    .action(async (name: string, args: string[]) => {
      const opened = await openSession(environment);
      if (opened.kind !== "ok") return;
      if (name === "pre-commit") code = await preCommit(opened.session);
      if (name === "prepare-commit-msg")
        code = await prepareCommitMsg(opened.session, args[0] ?? "", args[1]);
    });
  program
    .command("guard", { hidden: true })
    .requiredOption("--tool <tool>")
    .action(async (options: { tool: string }) => {
      if (options.tool !== "claude-code" && options.tool !== "cursor") return;
      const reply = await guard(environment, options.tool, await environment.stdin());
      if (reply.stdout.length > 0) environment.io.out(reply.stdout);
      if (reply.stderr.length > 0) environment.io.err(reply.stderr);
      code = reply.code;
    });

  try {
    await program.parseAsync([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 1;
    throw error;
  }
  return code;
}
