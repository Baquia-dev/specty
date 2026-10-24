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

/** A source with `count` lines of code, plus comments and blank lines that do not count. */
const source = (count: number): string =>
  `// A greeting.\n\n${Array.from({ length: count }, (_, index) => `export const v${index} = ${index};`).join("\n")}\n`;

/** SPEC's change, approved, with T1 active, in a repository with `config` added. */
async function approved(config = ""): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": source(10),
    ".specty/config.yaml": `${CONFIG()}${config}`,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(decided.code).toBe(0);
  await cli(root, ["next"]);
  return root;
}

const done = (task: string) => ["task", "done", task, "--summary", `Hecha ${task}`];

describe("the size of the files a task touches", () => {
  it("warns past 300 lines of code, and shows it on acceptance", async () => {
    const root = await approved();
    await writeFiles(root, { "src/app.ts": source(320) });
    const first = await cli(root, done("T1"));
    expect(first.code).toBe(0);
    expect(first.out).toContain(
      "AVISOS:\n  T1: src/app.ts, 320 líneas de código (aviso a partir de 300).\n  Si un archivo mezcla responsabilidades, propón cómo dividirlo antes de seguir; nunca lo partas solo para cumplir el número.",
    );
    const entries = (await read(root, AUDIT))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries.findLast((entry) => entry.event === "task.completed")?.data.longFiles).toEqual([
      { path: "src/app.ts", lines: 320, before: 10, limit: 300, severity: "warning" },
    ]);
    // T2 does not make it grow: no warning for it.
    await writeFiles(root, { "src/app.ts": `${source(320)}// done\n` });
    expect((await cli(root, done("T2"))).out).not.toContain("T2: src/app.ts");
    expect((await cli(root, ["next"])).out).toContain(
      "T1: src/app.ts, 320 líneas de código (aviso a partir de 300).",
    );
    const terminal = person();
    expect((await cli(root, ["accept"], { terminal })).code).toBe(0);
    expect(terminal.notes.join("\n")).toContain("T1: src/app.ts, 320 líneas de código");
  });

  it("blocks a task that takes a file past 500, until it is split", async () => {
    const root = await approved();
    await writeFiles(root, { "src/app.ts": source(520) });
    const blocked = await cli(root, done("T1"));
    expect(blocked.code).toBe(2);
    expect(blocked.out).toContain(
      "ARCHIVOS DEMASIADO LARGOS:\n  src/app.ts: 520 líneas de código (máximo 500)",
    );
    expect(blocked.out).toContain("divide esos archivos por responsabilidad");
    await writeFiles(root, { "src/app.ts": source(200) });
    expect((await cli(root, done("T1"))).code).toBe(0);
  });

  it("never blocks when the person sets fail: false", async () => {
    const root = await approved("lines:\n  fail: false\n");
    await writeFiles(root, { "src/app.ts": source(520) });
    const result = await cli(root, done("T1"));
    expect(result.code).toBe(0);
    expect(result.out).toContain("T1: src/app.ts, 520 líneas de código (aviso a partir de 300).");
  });
});
