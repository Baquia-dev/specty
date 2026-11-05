// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  antigravityAppRuleWarning,
  antigravityCliInvalidWarning,
  antigravityCliRuleLine,
  type Lang,
} from "@baquia-dev/specty-core";
import { applyEdits, modify, type ParseError, parse } from "jsonc-parser";
import { exists, isRecord, readText } from "../io/files";
import { COMMAND } from "../session";
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

/**
 * `init` for Antigravity's CLI, the exception to ADR 0013: when the person uses it (its folder
 * exists), `command(specty)` goes into `permissions.allow` of its settings, after their rules and
 * once; settings Specty cannot edit stay as they are, with a warning. Its app keeps its
 * permissions in no file Specty can read, so the person always gets the rule to add there.
 */
export async function allowSpecty(
  env: NodeJS.ProcessEnv,
  files: InstallFiles,
  lang: Lang,
): Promise<{ readonly done: readonly string[]; readonly warnings: readonly string[] }> {
  const app = antigravityAppRuleWarning(COMMAND, lang);
  const file = antigravityCliSettings(env);
  if (!(await exists(dirname(file)))) return { done: [], warnings: [app] };
  const text = (await files.read(file)) ?? "{}\n";
  const rules = rulesIn(text);
  if (rules === undefined) {
    return { done: [], warnings: [antigravityCliInvalidWarning(file, COMMAND, lang), app] };
  }
  if (!rules.some((rule) => RULES.includes(rule))) {
    // An index of -1 appends to the person's list; with none, the list is created whole.
    const added =
      rules.length === 0
        ? modify(text, ["permissions", "allow"], [RULE], FORMAT)
        : modify(text, ["permissions", "allow", -1], RULE, FORMAT);
    const final = applyEdits(text, added);
    await files.write(file, final.endsWith("\n") ? final : `${final}\n`);
  }
  return { done: [antigravityCliRuleLine(file, COMMAND, lang)], warnings: [app] };
}

/**
 * Whether the settings of Antigravity's CLI hold Specty's rule (or the one of business accounts),
 * for `doctor` and `uninstall`; undefined when the person does not use its CLI. Settings that are
 * missing or that Specty cannot read do not hold it.
 */
export async function cliRule(
  env: NodeJS.ProcessEnv,
): Promise<{ readonly file: string; readonly there: boolean } | undefined> {
  const file = antigravityCliSettings(env);
  if (!(await exists(dirname(file)))) return undefined;
  const rules = rulesIn((await readText(file)) ?? "");
  return { file, there: rules?.some((rule) => RULES.includes(rule)) === true };
}
