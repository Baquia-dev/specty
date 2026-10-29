// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  ARCHIVE,
  BUTTON_TEST,
  CHANGE,
  cli,
  folderOf,
  NOW,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const MODEL = "claude-opus-5-5";
/** Tokens of each kind: input, output, cache write and cache read. */
type Tokens = readonly [number, number, number, number];

/** What ccusage charges per million tokens of each kind. */
function priced([input, output, write, read]: Tokens): number {
  return (input * 4 + output * 20 + write * 8 + read * 0.2) / 1e6;
}

const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const entry = (timestamp: string, [input, output, write, read]: Tokens) => ({
  timestamp,
  model: MODEL,
  inputTokens: input,
  outputTokens: output,
  cacheCreationTokens: write,
  cacheReadTokens: read,
  costUSD: 0,
});
const session = (sessionId: string, tokens: Tokens) => {
  const [input, output, write, read] = tokens;
  const breakdown = {
    modelName: MODEL,
    inputTokens: input,
    outputTokens: output,
    cacheCreationTokens: write,
    cacheReadTokens: read,
    cost: priced(tokens),
  };
  return {
    sessionId,
    modelsUsed: [MODEL],
    modelBreakdowns: [breakdown],
    totalCost: breakdown.cost,
  };
};

/**
 * What ccusage 20.0.45 answers, by its arguments: four sessions to price Opus, and the calls of
 * `sesion-1`, one from the day before the change and two after it began.
 */
const REPLIES = {
  "claude session --json --offline": {
    sessions: [
      session("s1", [1000, 2000, 30_000, 500_000]),
      session("s2", [500, 8000, 10_000, 2_000_000]),
      session("s3", [3000, 1000, 90_000, 100_000]),
      session("s4", [100, 50_000, 5000, 9_000_000]),
    ],
    totals: {},
  },
  "claude session --id sesion-1 --json --offline": {
    sessionId: "sesion-1",
    totalCost: 0,
    totalTokens: 0,
    entries: [
      entry(at(-24 * 60), [999, 999, 999, 999]),
      entry(at(1), [10, 500, 2000, 100_000]),
      entry(at(2), [5, 300, 1000, 120_000]),
    ],
  },
};
/** A ccusage that answers each of `replies`' arguments, and fails on any other. */
const answering = (replies: unknown) =>
  `#!/usr/bin/env node\nconst replies = ${JSON.stringify(replies)};\nconst reply = replies[process.argv.slice(2).join(" ")];\nif (reply === undefined) process.exit(2);\nprocess.stdout.write(JSON.stringify(reply));\n`;
const LINE = "Consumo del cambio, según ccusage: 223,8 mil tokens en 2 llamadas, 0,08 USD.";

/** `program` as the ccusage of the change's folder, in its `node_modules/.bin`. */
async function ccusage(folder: string, program: string): Promise<void> {
  const bin = join(folder, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "ccusage"), program);
  await chmod(join(bin, "ccusage"), 0o755);
}

/** Claude Code's session `sesion-1`, with a configuration folder of its own, empty. */
async function claudeCode(): Promise<Record<string, string>> {
  const folder = await mkdtemp(join(tmpdir(), "claude-config-"));
  return { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "sesion-1", CLAUDE_CONFIG_DIR: folder };
}

/** A repository whose `node_modules` git ignores, as a project with ccusage installed does. */
const repo = () =>
  tempRepo({ ...APP, "src/button.ts": "Sing in\n", ".gitignore": "node_modules\n" });

/** A quick change made by `env`'s agent in its own worktree, waiting for acceptance. */
async function quick(root: string, env: Record<string, string>) {
  const created = await cli(root, ["new", "--worktree", "--kind", "quick", "Corregir botón"], {
    env,
  });
  expect(created.code).toBe(0);
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
  const done = await cli(folder, ["task", "done", "T1", "--summary", "Texto corregido"], { env });
  expect(done.code).toBe(0);
  return { id, folder };
}

/** The archived audit of `id` in `root`, one object per line. */
async function archivedAudit(root: string, id: string): Promise<Record<string, unknown>[]> {
  return (await read(root, `${ARCHIVE}/${id}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("the consumption of a change", () => {
  it("AC1, AC3: accepting a quick change measures it with ccusage, records it and says it", async () => {
    const root = await repo();
    const { id, folder } = await quick(root, await claudeCode());
    await ccusage(folder, answering(REPLIES));
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(accepted.out).toContain(LINE);
    const usage = (await archivedAudit(root, id)).find((line) => line.event === "change.usage");
    expect(usage).toMatchObject({
      actor: "specty",
      data: { calls: 2, input: 15, output: 800, cacheWrite: 3000, cacheRead: 220_000 },
    });
    expect(usage?.data).toHaveProperty("cost");
    expect((usage?.data as { readonly cost: number } | undefined)?.cost).toBeCloseTo(0.08406, 4);
    const audit = await cli(root, ["audit", id]);
    expect(audit.out).toContain("Consumo: 223,8 mil tokens en 2 llamadas, 0,08 USD");
  });

  it("AC1, AC3: closing a change measures it too, before archiving it", async () => {
    const root = await repo();
    const env = await claudeCode();
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"], { env })).code).toBe(0);
    const folder = folderOf(root);
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    expect((await cli(folder, ["propose"], { env })).code).toBe(0);
    const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    await cli(folder, ["next"], { env });
    await writeFiles(folder, { "src/app.ts": "1\n" });
    await cli(folder, ["task", "done", "T1", "--summary", "Uno"], { env });
    await writeFiles(folder, { "src/app.ts": "2\n" });
    await cli(folder, ["task", "done", "T2", "--summary", "Dos"], { env });
    await cli(folder, ["accept"], { terminal: person() });
    const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
    await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
    expect((await cli(folder, ["propose"], { env })).out).toContain("Cierre válido.");
    await ccusage(folder, answering(REPLIES));
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Cambio cerrado y archivado");
    expect(closed.out).toContain(LINE);
    const audit = await archivedAudit(root, CHANGE);
    const events = audit.map((line) => line.event);
    expect(events.indexOf("change.usage")).toBeGreaterThan(-1);
    expect(events.indexOf("change.usage")).toBeLessThan(events.indexOf("change.closed"));
  });

  it("AC4: without a ccusage that answers, or without a session in the audit, closes as before", async () => {
    for (const program of [
      "#!/usr/bin/env node\nprocess.exit(1);\n",
      "#!/usr/bin/env node\nprocess.stdout.write('no es json');\n",
    ]) {
      const root = await repo();
      const { id, folder } = await quick(root, await claudeCode());
      await ccusage(folder, program);
      const accepted = await cli(folder, ["accept"], { terminal: person() });
      expect(accepted.code).toBe(0);
      expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
      expect(accepted.out).not.toContain("Consumo del cambio");
      const events = (await archivedAudit(root, id)).map((line) => line.event);
      expect(events).not.toContain("change.usage");
    }
    // A ccusage that would answer, but no agent named its session.
    const root = await repo();
    const { id, folder } = await quick(root, {});
    await ccusage(folder, answering(REPLIES));
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(accepted.out).not.toContain("Consumo del cambio");
    expect((await archivedAudit(root, id)).map((line) => line.event)).not.toContain("change.usage");
  });
});
