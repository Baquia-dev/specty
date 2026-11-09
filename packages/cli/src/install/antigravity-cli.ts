// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  antigravityAppRuleWarning,
  antigravityCliInvalidWarning,
  antigravityCliRuleLine,
  type Lang,
} from "@baquia-dev/specty-core";
import { applyEdits, modify, type ParseError, parse } from "jsonc-parser";
import { gitCommonFolder } from "../flow/worktree";
import { exists, isRecord, readText } from "../io/files";
import type { Git } from "../io/git";
import { COMMAND, type Invocation } from "../session";
import type { InstallFiles } from "./files";

/** The rule that lets Specty's commands run without asking, with the one of business accounts. */
const RULE = `command(${COMMAND})`;
const RULES: readonly unknown[] = [RULE, `unsandboxed(${COMMAND})`];

const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } };

/**
 * The settings of Antigravity's CLI: in `$SPECTY_ANTIGRAVITY_CLI_DIR` when it has a value, which
 * the tests point elsewhere, or in `~/.gemini/antigravity-cli`. Agy does not know the variable.
 */
function antigravityCliSettings(env: NodeJS.ProcessEnv): string {
  const folder =
    env.SPECTY_ANTIGRAVITY_CLI_DIR || join(env.HOME ?? homedir(), ".gemini", "antigravity-cli");
  return join(folder, "settings.json");
}

/**
 * The rules in a settings text, `[]` when it has none yet, or undefined when Specty cannot edit
 * it: not JSON, or a `permissions` that is not an object or an `allow` that is not a list.
 */
function rulesIn(text: string): readonly unknown[] | undefined {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors);
  if (errors.length > 0 || !isRecord(value)) return undefined;
  if (value.permissions === undefined) return [];
  if (!isRecord(value.permissions)) return undefined;
  const { allow } = value.permissions;
  if (allow === undefined) return [];
  return Array.isArray(allow) ? allow : undefined;
}

/** Whether `folder` is `parent` or inside it. */
function inside(folder: string, parent: string): boolean {
  const path = relative(parent, folder);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/**
 * The rules that let Specty run inside the CLI's terminal sandbox (D5, P167), all absolute, since
 * a relative one breaks the whole sandbox: reading the folder of the node that runs Specty and
 * that of its bundle, which node's may already hold (a global npm install), so Specty starts; and
 * writing in git's common folder, where its commits go, from any worktree. The bundle is the
 * script of a command with a machine path or, otherwise, the running module's, as in `mcp/app.ts`.
 */
async function sandboxRules(git: Git, invocation: Invocation): Promise<string[]> {
  const node = dirname(dirname(process.execPath));
  const bundle = dirname(invocation.script ?? fileURLToPath(import.meta.url));
  return [
    `read_file(${node})`,
    ...(inside(bundle, node) ? [] : [`read_file(${bundle})`]),
    `write_file(${await gitCommonFolder(git)})`,
  ];
}

/**
 * Specty's rules for settings that hold `rules`: the one for its commands (the business accounts'
 * when it is there, otherwise `command(specty)`), then the sandbox's.
 */
function wanted(rules: readonly unknown[], sandbox: readonly string[]): string[] {
  const command = RULES.find((rule) => rules.includes(rule));
  return [typeof command === "string" ? command : RULE, ...sandbox];
}

/** `text` with `missing` after the rules it holds (`rules`), once each, keeping the rest. */
function withRules(text: string, rules: readonly unknown[], missing: readonly string[]): string {
  // With no list it is created whole; otherwise an index of -1 appends to the person's.
  const final =
    rules.length === 0
      ? applyEdits(text, modify(text, ["permissions", "allow"], missing, FORMAT))
      : missing.reduce(
          (current, rule) =>
            applyEdits(current, modify(current, ["permissions", "allow", -1], rule, FORMAT)),
          text,
        );
  return final.endsWith("\n") ? final : `${final}\n`;
}

/**
 * `init` for Antigravity's CLI, the exception to ADR 0013 (D4, D5): when the person uses it (its
 * folder exists), Specty's rules go into `permissions.allow` of its settings, after their rules
 * and once each; settings Specty cannot edit stay as they are, with a warning. Its app keeps its
 * permissions in no file Specty can read, so the person always gets the rule to add there.
 */
export async function allowSpecty(context: {
  readonly env: NodeJS.ProcessEnv;
  readonly files: InstallFiles;
  readonly lang: Lang;
  readonly git: Git;
  readonly invocation: Invocation;
}): Promise<{ readonly done: readonly string[]; readonly warnings: readonly string[] }> {
  const { env, files, lang } = context;
  const app = antigravityAppRuleWarning(COMMAND, lang);
  const file = antigravityCliSettings(env);
  if (!(await exists(dirname(file)))) return { done: [], warnings: [app] };
  const text = (await files.read(file)) ?? "{}\n";
  const rules = rulesIn(text);
  const sandbox = await sandboxRules(context.git, context.invocation);
  if (rules === undefined) {
    const add = wanted([], sandbox);
    return { done: [], warnings: [antigravityCliInvalidWarning(file, add, lang), app] };
  }
  const all = wanted(rules, sandbox);
  const missing = all.filter((rule) => !rules.includes(rule));
  if (missing.length > 0) await files.write(file, withRules(text, rules, missing));
  return { done: [antigravityCliRuleLine(file, all, lang)], warnings: [app] };
}

/**
 * Specty's rules in the settings of Antigravity's CLI, for `doctor` and `uninstall`: the `missing`
 * ones and those that are `there`, in `init`'s order. Settings that are not there or that Specty
 * cannot read miss them all. Undefined when the person does not use its CLI.
 */
export async function cliRules(
  env: NodeJS.ProcessEnv,
  git: Git,
  invocation: Invocation,
): Promise<
  | {
      readonly file: string;
      readonly missing: readonly string[];
      readonly there: readonly string[];
    }
  | undefined
> {
  const file = antigravityCliSettings(env);
  if (!(await exists(dirname(file)))) return undefined;
  const rules = rulesIn((await readText(file)) ?? "") ?? [];
  const all = wanted(rules, await sandboxRules(git, invocation));
  return {
    file,
    missing: all.filter((rule) => !rules.includes(rule)),
    there: all.filter((rule) => rules.includes(rule)),
  };
}
