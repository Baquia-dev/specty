// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const AUDIT = `.specty/changes/${CHANGE}/audit.jsonl`;

/** SPEC with a new file for T1, approved, with T1 active, under `config`. */
async function approved(config = CONFIG()): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": config,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  const spec = SPEC.replace(
    "- crear src/app.test.ts — prueba\n",
    "- crear src/app.test.ts — prueba\n- crear src/tls.ts — cliente\n",
  ).replace(
    "  - files: src/app.ts, src/app.test.ts\n",
    "  - files: src/app.ts, src/app.test.ts, src/tls.ts\n",
  );
  await writeFiles(root, { [SPEC_PATH]: spec });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(decided.code).toBe(0);
  await cli(root, ["next"]);
  return root;
}

/** The `data` of the audit's last `task.completed` entry. */
async function completed(root: string): Promise<Record<string, unknown>> {
  const entries = (await read(root, AUDIT))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return entries.findLast((entry) => entry.event === "task.completed")?.data ?? {};
}

describe("content risks in task done", () => {
  it("warns about risky lines in new and changed files, and shows them on acceptance", async () => {
    const root = await approved();
    await writeFiles(root, {
      "src/app.ts": "export const greet = (input) => eval(input);\n",
      "src/tls.ts": "export const agent = { rejectUnauthorized: false };\n",
      "src/app.test.ts": "expect(eval('1')).toBe(1);\n",
    });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    expect(done.code).toBe(0);
    expect(done.out).toContain(
      "AVISOS:\n  T1: src/app.ts:1 ejecuta código construido al vuelo (eval) (CWE-95).\n  T1: src/tls.ts:1 desactiva la verificación TLS (CWE-295).",
    );
    expect((await completed(root)).risks).toEqual([
      { path: "src/app.ts", line: 1, rule: "eval", cwe: "CWE-95" },
      { path: "src/tls.ts", line: 1, rule: "tls-disabled", cwe: "CWE-295" },
    ]);
    await writeFiles(root, { "src/app.ts": "export const greet = (name) => name;\n" });
    const last = await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    expect(last.out).not.toContain("T2:");
    expect(await completed(root)).not.toHaveProperty("risks");
    expect((await cli(root, ["next"])).out).toContain(
      "AVISOS:\n  T1: src/app.ts:1 ejecuta código construido al vuelo (eval) (CWE-95).\n  T1: src/tls.ts:1 desactiva la verificación TLS (CWE-295).\n  Revísalo con el usuario",
    );
    const terminal = person();
    expect((await cli(root, ["accept"], { terminal })).code).toBe(0);
    expect(terminal.notes.join("\n")).toContain(
      "T1: src/tls.ts:1 desactiva la verificación TLS (CWE-295).",
    );
  });

  /** Two rules of the person: a `console.log` in TypeScript, with its CWE, and a `debugger`. */
  const RULES = [
    "warnings:",
    "  risks:",
    '    - label: "deja un console.log"',
    "      pattern: 'console\\.log\\('",
    "      cwe: CWE-532",
    "      extensions: [ts]",
    '    - label: "detiene el depurador"',
    "      pattern: '\\bdebugger\\b'",
    "",
  ].join("\n");
  const LESSON = (path: string, what: string) =>
    `Riesgo aceptado en \`${path}\`: ${what}. Revísalo antes de ampliarlo.`;

  it("AC1, AC3: warns with the person's rules after Specty's, keeps their text, shows it on acceptance and remembers each rule", async () => {
    const root = await approved(`${CONFIG()}${RULES}`);
    await writeFiles(root, {
      "src/app.ts":
        "export const greet = (input) => { console.log(input); return eval(input); };\n",
      "src/tls.ts": "export const agent = 1;\nconsole.log(agent);\ndebugger;\n",
      "src/app.test.ts": "console.log('test');\ndebugger;\n",
    });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    expect(done.code).toBe(0);
    const warned = [
      "  T1: src/app.ts:1 ejecuta código construido al vuelo (eval) (CWE-95).",
      "  T1: src/app.ts:1 deja un console.log (CWE-532).",
      "  T1: src/tls.ts:2 deja un console.log (CWE-532).",
      "  T1: src/tls.ts:3 detiene el depurador.",
    ].join("\n");
    expect(done.out).toContain(`AVISOS:\n${warned}`);
    expect((await completed(root)).risks).toEqual([
      { path: "src/app.ts", line: 1, rule: "eval", cwe: "CWE-95" },
      { path: "src/app.ts", line: 1, rule: "custom", label: "deja un console.log", cwe: "CWE-532" },
      { path: "src/tls.ts", line: 2, rule: "custom", label: "deja un console.log", cwe: "CWE-532" },
      { path: "src/tls.ts", line: 3, rule: "custom", label: "detiene el depurador" },
    ]);
    await writeFiles(root, { "src/app.ts": "export const greet = (name) => name;\n" });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
    expect((await cli(root, ["next"])).out).toContain(
      `AVISOS:\n${warned}\n  Revísalo con el usuario`,
    );
    const terminal = person();
    expect((await cli(root, ["accept"], { terminal })).code).toBe(0);
    for (const line of warned.split("\n")) {
      expect(terminal.notes.join("\n")).toContain(line.trim());
    }
    const memory = (await cli(root, ["memory"])).out;
    expect(memory).toContain(
      LESSON("src/app.ts", "ejecuta código construido al vuelo (eval) (CWE-95)"),
    );
    expect(memory).toContain(LESSON("src/app.ts", "deja un console.log (CWE-532)"));
    expect(memory).toContain(LESSON("src/tls.ts", "deja un console.log (CWE-532)"));
    expect(memory).toContain(LESSON("src/tls.ts", "detiene el depurador"));
  });
});
