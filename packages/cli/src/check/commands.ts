// SPDX-License-Identifier: Apache-2.0
import {
  COMMAND_CHECKS,
  type CommandCheck,
  type Finding,
  findingsInOutput,
  type ResolvedConfig,
  translator,
} from "@baquia-dev/specty-core";
import { commandsFor, scriptCommand } from "../detect/project";
import { qualityCommands } from "../detect/quality";
import type { Stack } from "../detect/stack";
import { execute } from "../io/exec";
import type { CheckDefinition, Provider } from "./provider";

/**
 * The project's own format, lint, typecheck and tests, in any stack: the commands Specty detects
 * (the ones `init` writes to `verify` and AGENTS.md), or the ones `checks.commands` names. Each
 * tool looks at the whole project, because a change can break files it did not touch.
 */
export function projectProvider(stacks: readonly Stack[], config: ResolvedConfig): Provider {
  const commands = projectCommands(stacks[0], config.checks.commands);
  return {
    id: "project",
    applies: () => true,
    checks: COMMAND_CHECKS.flatMap((id) => {
      const command = commands[id];
      return command === undefined ? [] : [commandCheck(id, command)];
    }),
  };
}

function projectCommands(
  stack: Stack | undefined,
  configured: Readonly<Partial<Record<CommandCheck, string>>>,
): Partial<Record<CommandCheck, string>> {
  const detected = stack === undefined ? {} : commandsFor(stack);
  const found: Partial<Record<CommandCheck, string | undefined>> = {
    format: stack === undefined ? undefined : formatCommand(stack),
    lint: detected.lint,
    typecheck: detected.typecheck,
    tests: detected.test,
  };
  return Object.fromEntries(
    COMMAND_CHECKS.flatMap((id) => {
      const command = configured[id] ?? found[id];
      return command === undefined ? [] : [[id, command]];
    }),
  );
}

/** The format checks that come with a stack's own toolchain. */
const TOOLCHAIN_FORMAT: Partial<Record<Stack["language"], string>> = {
  dart: "dart format --output=none --set-exit-if-changed .",
  rust: "cargo fmt --check",
  csharp: "dotnet format --verify-no-changes",
};

/** Only a command that checks the format, never one that rewrites the files. */
function formatCommand(stack: Stack): string | undefined {
  if (stack.language === "typescript" || stack.language === "javascript") {
    const script = ["format:check", "fmt:check", "check:format"].find(
      (name) => stack.scripts[name] !== undefined,
    );
    return script === undefined ? undefined : scriptCommand(stack, script);
  }
  return TOOLCHAIN_FORMAT[stack.language] ?? qualityCommands(stack).format;
}

function commandCheck(id: CommandCheck, command: string): CheckDefinition {
  return {
    id,
    async run({ session, files }) {
      const t = translator(session.lang);
      const { timeoutSec } = session.config.verify;
      const result = await execute(command, [], {
        cwd: session.root,
        env: session.environment.env,
        shell: true,
        timeoutMs: timeoutSec * 1000,
      });
      if (result.code === 0) return { findings: [] };
      const head: Finding = {
        message: result.timedOut
          ? t(
              `\`${command}\` superó el tiempo límite (${timeoutSec} s)`,
              `\`${command}\` ran past the time limit (${timeoutSec} s)`,
            )
          : t(
              `\`${command}\` salió con ${result.code ?? "?"}`,
              `\`${command}\` exited with ${result.code ?? "?"}`,
            ),
      };
      const found = findingsInOutput(`${result.stdout}\n${result.stderr}`, session.root);
      // What the change touched first, then the rest it may have broken.
      const run = new Set(files);
      const ours = (finding: Finding) => finding.path !== undefined && run.has(finding.path);
      return {
        findings: [head, ...found.filter(ours), ...found.filter((finding) => !ours(finding))],
      };
    },
  };
}
