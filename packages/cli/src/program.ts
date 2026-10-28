// SPDX-License-Identifier: Apache-2.0
import {
  EXIT_CODES,
  invalidConfigCard,
  type Lang,
  notGitCard,
  notInitializedCard,
  type Output,
  renderText,
} from "@baquia-dev/specty-core";
import { Command, CommanderError } from "commander";
import type { ReportOutput } from "./check/provider";
import { agentCommands } from "./commands/agent-commands";
import { auditCommand } from "./commands/audit";
import { checkCommand } from "./commands/check";
import { ciCommand } from "./commands/ci";
import { doctor } from "./commands/doctor";
import { exportCommand } from "./commands/export";
import { initCommand } from "./commands/init";
import { mcpCommand } from "./commands/mcp";
import { personCommands } from "./commands/person-commands";
import { prune } from "./commands/prune";
import { status } from "./commands/status";
import { ui } from "./commands/ui";
import { uninstallCommand } from "./commands/uninstall";
import { why } from "./commands/why";
import { enforcementCommands } from "./enforce/commands";
import { bareCards, type Environment, openSession, type Session, systemLanguage } from "./session";

export interface CliEnvironment extends Environment {
  readonly stdin: () => Promise<string>;
  /** Stdin as it arrives, for `specty mcp`, which answers each line while it reads the next. */
  readonly input?: AsyncIterable<string | Uint8Array>;
}

/** Runs one command and returns its exit code (0 ok, 1 invalid, 2 blocked by the flow). */
export async function runCli(
  argv: readonly string[],
  environment: CliEnvironment,
): Promise<number> {
  const result: RunState = { code: 0, json: false };
  const emit = emitter(environment, result);
  const run = sessionRunner(environment, emit);
  const program = new Command("specty")
    .description("Spec-driven development, enforced, for any AI coding agent.")
    .option("--json", "print the output as JSON")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => environment.io.out(text.trimEnd()),
      writeErr: (text) => environment.io.err(text.trimEnd()),
    })
    .hook("preAction", (command) => {
      result.json = command.opts<{ json?: boolean }>().json === true;
    });

  // Each group of commands registers itself from its module; here, reading and setting up.
  agentCommands(program, run, environment.env, (output) =>
    emit(output, systemLanguage(environment.env)),
  );
  personCommands(program, run);
  uninstallCommand(program, run);
  checkCommand(program, run);
  ciCommand(program, run);
  mcpCommand(program, environment, runCli);
  auditCommand(program, run);
  exportCommand(program, run);
  readingCommands(program, run, environment, emit);
  enforcementCommands(program, environment, (exit) => {
    result.code = exit;
  });

  try {
    await program.parseAsync([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 1;
    throw error;
  }
  return result.code;
}

/** What a run ends with: its exit code, and whether `--json` asked for JSON. */
interface RunState {
  code: number;
  json: boolean;
}

type Emit = (output: Output | ReportOutput, lang: Lang) => void;
type Run = (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>;

/** Prints an output, as text or JSON, and keeps its exit code. */
function emitter(environment: CliEnvironment, result: RunState): Emit {
  return (output, lang) => {
    // `specty check` prints its own report, which ends in its summary line, not a card.
    if ("report" in output) {
      environment.io.out(result.json ? JSON.stringify(output.json) : output.report);
      result.code = output.code;
      return;
    }
    environment.io.out(
      result.json
        ? JSON.stringify({ ...output, exitCode: EXIT_CODES[output.status] })
        : renderText(output, lang),
    );
    result.code = EXIT_CODES[output.status];
  };
}

/** Runs a command in its session; without one, the card that says why. */
function sessionRunner(environment: CliEnvironment, emit: Emit): Run {
  return (handler) => async () => {
    const opened = await openSession(environment);
    const cards = bareCards(environment.env);
    switch (opened.kind) {
      case "no-git":
        return emit(notGitCard(cards), cards.lang);
      case "missing":
        return emit(notInitializedCard(cards), cards.lang);
      case "invalid": {
        const issues = opened.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        return emit(invalidConfigCard(issues, cards), cards.lang);
      }
      case "ok":
        return emit(await handler(opened.session), opened.session.lang);
    }
  };
}

/** Reading the state and setting up: status, doctor, init, prune, why and ui. */
function readingCommands(
  program: Command,
  run: Run,
  environment: CliEnvironment,
  emit: Emit,
): void {
  program.command("status").description("open changes and pending decisions").action(run(status));
  program.command("doctor").description("check configuration and hooks").action(run(doctor));
  program
    .command("init")
    .description("set up Specty in this repository")
    .option("--language <lang>", "es or en")
    .option("--tools <list>", "comma-separated agent tools, for example claude-code,cursor")
    .option("--git-flow <flow>", "how change branches are named: specty, github, trunk or gitflow")
    .option("--dry-run", "only list what init would create or change")
    .action(
      async (options: {
        language?: string;
        tools?: string;
        gitFlow?: string;
        dryRun?: boolean;
      }) => {
        const { output, lang } = await initCommand(environment, options);
        emit(output, lang);
      },
    );
  program
    .command("prune")
    .description("remove the folders of finished changes and the branches already merged")
    .action(run(prune));
  program
    .command("why <target>")
    .description("the change, task and criteria a file or a line (path:line) comes from")
    .action((target: string) => run((session) => why(session, target))());
  program
    .command("ui")
    .description("serve the changes of every worktree on localhost, until Ctrl+C")
    .option("--port <port>", "the port to try first (default: 4173)")
    .action((options: { port?: string }) => run((session) => ui(session, options.port))());
}
