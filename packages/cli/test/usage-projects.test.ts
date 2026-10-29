// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  BUTTON_TEST,
  CHANGE,
  cli,
  folderOf,
  NOW,
  person,
  tempRepo,
  writeFiles,
} from "./support";

const MODEL = "claude-opus-5-5";
/** Tokens of each kind: input, output, cache write and cache read. */
type Tokens = readonly [number, number, number, number];

/** What ccusage charges per million tokens of each kind, with cache writes at `write`. */
const priced = ([input, output, written, read]: Tokens, write = 8) =>
  (input * 4 + output * 20 + written * write + read * 0.2) / 1e6;
const session = (sessionId: string, projectPath: string, tokens: Tokens, write = 8) => {
  const [input, output, written, read] = tokens;
  const cost = priced(tokens, write);
  const breakdown = {
    modelName: MODEL,
    inputTokens: input,
    outputTokens: output,
    cacheCreationTokens: written,
    cacheReadTokens: read,
    cost,
  };
  return {
    sessionId,
    projectPath,
    modelsUsed: [MODEL],
    modelBreakdowns: [breakdown],
    totalCost: cost,
  };
};
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const entry = (timestamp: string, [input, output, written, read]: Tokens) => ({
  timestamp,
  model: MODEL,
  inputTokens: input,
  outputTokens: output,
  cacheCreationTokens: written,
  cacheReadTokens: read,
  costUSD: 0,
});
const CALLS = {
  sessionId: "sesion-1",
  totalCost: 0,
  totalTokens: 0,
  entries: [entry(at(1), [10, 500, 2000, 100_000]), entry(at(2), [5, 300, 1000, 120_000])],
};
/** Sessions of another project, run without an interface: their cache writes cost 5, not 8. */
const headless = Array.from({ length: 6 }, (_, index) =>
  session(
    `e${index}`,
    "-tmp-evals",
    [
      200 + index * 37,
      3000 + index * 911,
      40_000 + index * index * 3001,
      900_000 + index * 250_003,
    ],
    5,
  ),
);
const LINE = "Consumo del cambio, según ccusage: 223,8 mil tokens en 2 llamadas, 0,08 USD.";

/** A ccusage that answers its report with `sessions` and the calls of `sesion-1`. */
const answering = (sessions: readonly unknown[]) => {
  const replies = {
    "claude session --json --offline": { sessions, totals: {} },
    "claude session --id sesion-1 --json --offline": CALLS,
  };
  return `#!/usr/bin/env node\nconst replies = ${JSON.stringify(replies)};\nconst reply = replies[process.argv.slice(2).join(" ")];\nif (reply === undefined) process.exit(2);\nprocess.stdout.write(JSON.stringify(reply));\n`;
};

/** A quick change by Claude Code's `sesion-1`, accepted with `program` as its ccusage: what it says. */
async function accepted(program: string): Promise<string> {
  const config = await mkdtemp(join(tmpdir(), "claude-config-"));
  const env = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "sesion-1", CLAUDE_CONFIG_DIR: config };
  const root = await tempRepo({
    ...APP,
    "src/button.ts": "Sing in\n",
    ".gitignore": "node_modules\n",
  });
  expect(
    (await cli(root, ["new", "--worktree", "--kind", "quick", "Corregir botón"], { env })).code,
  ).toBe(0);
  const id = `${CHANGE.slice(0, 8)}-corregir-boton`;
  const folder = folderOf(root, id);
  await writeFiles(folder, {
    [`.specty/changes/${id}/spec.md`]:
      "---\nkind: quick\n---\n\n# Corregir botón\n\n## Objetivo\n\nDice «Sing in».\n\n## Archivos\n\n- modificar src/button.ts — texto\n\n## Tareas\n\n- [ ] T1: Corregir texto\n  - files: src/button.ts\n  - type: fix\n",
  });
  expect((await cli(folder, ["propose"], { env })).code).toBe(0);
  expect((await cli(folder, ["approve"], { terminal: person() })).code).toBe(0);
  await cli(folder, ["next"], { env });
  await writeFiles(folder, { "src/button.ts": "Sign in\n", "src/button.test.ts": BUTTON_TEST });
  expect((await cli(folder, ["task", "done", "T1", "--summary", "Texto"], { env })).code).toBe(0);
  const bin = join(folder, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "ccusage"), program);
  await chmod(join(bin, "ccusage"), 0o755);
  const result = await cli(folder, ["accept"], { terminal: person() });
  expect(result.code).toBe(0);
  return result.out;
}

describe("the prices of the consumption", () => {
  it("come from the sessions of the change's own project, when it has enough", async () => {
    // Its project: four sessions at Opus' prices, one of them the change's.
    const own = [
      session("sesion-1", "-repo", [1000, 2000, 30_000, 500_000]),
      session("s2", "-repo", [500, 8000, 10_000, 2_000_000]),
      session("s3", "-repo", [3000, 1000, 90_000, 100_000]),
      session("s4", "-repo", [100, 50_000, 5000, 9_000_000]),
    ];
    // Six of ten sessions off the prices: all of them together give none.
    expect(await accepted(answering([...own, ...headless]))).toContain(LINE);
  });

  it("come from every session when its project has too few", async () => {
    const few = [session("sesion-1", "-repo", [1000, 2000, 30_000, 500_000])];
    const elsewhere = [
      session("o1", "-other", [500, 8000, 10_000, 2_000_000]),
      session("o2", "-other", [3000, 1000, 90_000, 100_000]),
      session("o3", "-other", [100, 50_000, 5000, 9_000_000]),
      session("o4", "-other", [2000, 3000, 20_000, 700_000]),
    ];
    expect(await accepted(answering([...few, ...elsewhere]))).toContain(LINE);
  });
});
