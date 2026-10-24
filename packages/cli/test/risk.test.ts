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

/** SPEC with a new file for T1, approved, with T1 active. */
async function approved(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": CONFIG(),
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
});
