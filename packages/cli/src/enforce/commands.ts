// SPDX-License-Identifier: Apache-2.0
import type { Command } from "commander";
import type { CliEnvironment } from "../program";
import { isGuardTool } from "./actions";
import { guardCommand, hookCommand } from "./entry";

/**
 * The hidden commands that git's hooks (`hook`) and the agents' hooks (`guard`) call. Each one
 * hands its exit code to `exit`. The hooks themselves reach them through `runHook`, without
 * loading the rest of the CLI; these serve any other form of the same commands.
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
    .action(async (name: string, args: string[]) =>
      exit(await hookCommand(environment, name, args)),
    );
  program
    .command("guard", { hidden: true })
    .requiredOption("--tool <tool>")
    .option("--event <event>")
    .action(async (options: { tool: string; event?: string }) => {
      if (!isGuardTool(options.tool)) return;
      exit(await guardCommand(environment, options.tool, options.event));
    });
}
