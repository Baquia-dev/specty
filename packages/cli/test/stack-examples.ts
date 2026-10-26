// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { CHANGE, CONFIG, cli, person, tempRepo, writeFiles } from "./support";

/**
 * The stack examples of `specty check` (ADR 0012). Each one is a repository of its stack, built in
 * a temporary folder so that its failures on purpose stay out of Specty's own checks, with an
 * approved change. A case leaves its edits in the working tree, and `specty check --changed
 * --spec` says how each check sees them.
 */

export type Files = Readonly<Record<string, string>>;

/** The markers, put together from parts so that this file does not trip `specty check`. */
export const MARK = { only: ".only", skipped: ".skip", todo: "TODO", any: "any" } as const;

/** Where the spec of the example's change goes. */
export const SPEC_FILE = `.specty/changes/${CHANGE.slice(0, 8)}-carrito/spec.md`;

export interface Example {
  /** The repository on main. */
  readonly base: Files;
  /** The `checks` block of its configuration. */
  readonly checks: string;
  readonly spec: string;
}

/** What a case leaves in the working tree: the files it writes and the ones it deletes. */
export interface Case {
  readonly write: Files;
  readonly remove?: readonly string[];
}

/** The status of each check, by id, once `edits` are made on the approved change of `example`. */
export async function statuses(example: Example, edits: Case): Promise<Record<string, string>> {
  const config = `${CONFIG()}${example.checks}`;
  const root = await tempRepo({ ...example.base, ".specty/config.yaml": config });
  expect((await cli(root, ["new", "Carrito"])).code).toBe(0);
  await writeFiles(root, { [SPEC_FILE]: example.spec });
  const proposed = await cli(root, ["propose"]);
  expect(proposed.code, proposed.out).toBe(0);
  const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(root, ["next"]);
  await writeFiles(root, edits.write);
  await Promise.all((edits.remove ?? []).map((path) => rm(join(root, path))));
  const run = await cli(root, ["check", "--changed", "--spec", "--json"]);
  const report: { checks: { id: string; status: string }[] } = JSON.parse(run.out);
  return Object.fromEntries(report.checks.map((check) => [check.id, check.status]));
}

/** `status` for each check of `ids`, and the exceptions on top. */
export function expected(
  ids: readonly string[],
  status: string,
  exceptions: Readonly<Record<string, string>>,
): Record<string, string> {
  return { ...Object.fromEntries(ids.map((id) => [id, status])), ...exceptions };
}

/** What one of the project's tools fails on, and the line it prints for each (`{path}`, `{abs}`, `{line}`). */
export interface ToolRule {
  readonly token: string;
  readonly output: string;
}

/**
 * The stand-in of the project's tools, `node tool/check.mjs <tool> <folder>`, because the real ones
 * need their dependencies installed: it fails on each line of the folder with the tool's token,
 * and prints it in the tool's own format.
 */
export function toolScript(rules: Readonly<Record<string, ToolRule>>): string {
  return [
    'import { readdirSync, readFileSync } from "node:fs";',
    'import { join, resolve } from "node:path";',
    `const rule = (${JSON.stringify(rules)})[process.argv[2]];`,
    "const found = [];",
    "const walk = (dir) => {",
    "  for (const entry of readdirSync(dir, { withFileTypes: true })) {",
    "    const path = join(dir, entry.name);",
    "    if (entry.isDirectory()) walk(path);",
    '    else readFileSync(path, "utf8").split("\\n").forEach((text, index) => {',
    "      if (text.includes(rule.token)) found.push({ path, line: index + 1 });",
    "    });",
    "  }",
    "};",
    "walk(process.argv[3]);",
    "for (const { path, line } of found) {",
    '  const at = rule.output.replace("{abs}", resolve(path)).replace("{path}", path);',
    '  console.log(at.replace("{line}", String(line)));',
    "}",
    "process.exit(found.length > 0 ? 1 : 0);",
    "",
  ].join("\n");
}

/** What the generator writes for `list`: `render` with `{json}` in place of the list. */
export function rendered(render: string, list: readonly number[]): string {
  return render.replace("{json}", JSON.stringify(list));
}

/** A code generator, `node tool/generate.mjs`: it writes `output` from the JSON list of `input`. */
export function generatorScript(input: string, output: string, render: string): string {
  return [
    'import { readFileSync, writeFileSync } from "node:fs";',
    `const list = JSON.parse(readFileSync(${JSON.stringify(input)}, "utf8"));`,
    `const text = ${JSON.stringify(render)}.replace("{json}", JSON.stringify(list));`,
    `writeFileSync(${JSON.stringify(output)}, text);`,
    "",
  ].join("\n");
}

/** `count` lines, from `line(1)`. */
export function repeat(count: number, line: (index: number) => string): string[] {
  return Array.from({ length: count }, (_, index) => line(index + 1));
}

/** A GitHub token of the right shape, put together here so that no source holds one. */
export function githubToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const body = repeat(36, (index) => alphabet[(index * 17 + 5) % alphabet.length] ?? "a");
  return `ghp${"_"}${body.join("")}`;
}

/** True when Betterleaks or gitleaks is on PATH: then `secrets` runs. */
export function hasSecretScanner(): boolean {
  return ["betterleaks", "gitleaks"].some((name) => {
    try {
      execFileSync("which", [name], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
}
