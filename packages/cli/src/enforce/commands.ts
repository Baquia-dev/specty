// SPDX-License-Identifier: Apache-2.0
import type { Command } from "commander";
import type { CliEnvironment } from "../program";
import { openSession } from "../session";
import { isGuardTool } from "./actions";
import { guard } from "./guard";
import { preCommit, prepareCommitMsg } from "./hook";

/**
 * The hidden commands that git's hooks (`hook`) and the agents' hooks (`guard`) call. Each one
 * hands its exit code to `exit`.
 */
export function enforcementCommands(
  program: Command,
  environment: CliEnvironment,
  exit: (code: number) => void,
): void {
  program
    .command("hook", { hidden: true })
    .argument("<name>")
    .argument("[args...]")
    .action(async (name: string, args: string[]) => {
      const opened = await openSession(environment);
      if (opened.kind !== "ok") return;
      if (name === "pre-commit") exit(await preCommit(opened.session));
      if (name === "prepare-commit-msg")
        exit(await prepareCommitMsg(opened.session, args[0] ?? "", args[1]));
    });
  program
    .command("guard", { hidden: true })
    .requiredOption("--tool <tool>")
    .action(async (options: { tool: string }) => {
      if (!isGuardTool(options.tool)) return;
      const reply = await guard(environment, options.tool, await environment.stdin());
      if (reply.stdout.length > 0) environment.io.out(reply.stdout);
      if (reply.stderr.length > 0) environment.io.err(reply.stderr);
      exit(reply.code);
    });
}
