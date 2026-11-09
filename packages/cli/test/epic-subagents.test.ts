// SPDX-License-Identifier: Apache-2.0
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { makeChangeId } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  CHANGE,
  CONFIG,
  cli,
  folderOf,
  git,
  NOW,
  person,
  type Run,
  tempRepo,
  writeFiles,
} from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "subagentes-en-su-carpeta");
const EPIC_DIR = `.specty/changes/${EPIC}`;

/** Three slices that can start at once, with titles alike on purpose. */
const TITLES = {
  C1: "Cada subagente de Codex trabaja en la carpeta de su cambio",
  C2: "Cada subagente de OpenCode trabaja en la carpeta de su cambio",
  C3: "Cada subagente de Cursor trabaja en la carpeta de su cambio",
} as const;
type Slice = keyof typeof TITLES;
const SLICES: readonly Slice[] = ["C1", "C2", "C3"];

/** The change `new` creates for `slice`. */
const idOf = (slice: Slice) => makeChangeId(NOW, TITLES[slice]);

const EPIC_SPEC = `---
kind: epic
---

# Subagentes en su carpeta

## Objetivo

Cada subagente de cada herramienta trabaja en la carpeta de su cambio.

## Fuera de alcance

- GitHub Copilot.

## Supuestos

- A1: Los hooks de cada herramienta distinguen a sus subagentes.

## Criterios de aceptación

- AC1: CUANDO un subagente entra en la carpeta de un cambio ENTONCES trabaja allí.

## Cortes

- C1: ${TITLES.C1}
  - ac: AC1
- C2: ${TITLES.C2}
  - ac: AC1
- C3: ${TITLES.C3}
  - ac: AC1
`;

/** An approved epic in `root` itself (this repository works without worktrees), every slice ready. */
async function approvedEpic(config = CONFIG()): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "1\n", ".specty/config.yaml": config });
  expect((await cli(root, ["new", "--kind", "epic", "Subagentes en su carpeta"])).code).toBe(0);
  await writeFiles(root, { [`${EPIC_DIR}/spec.md`]: EPIC_SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
  return root;
}

/** What a subagent runs to create the change of `slice`, as its brief says. */
const startSlice = (root: string, slice: Slice) =>
  cli(root, ["new", "--worktree", TITLES[slice], "--epic", EPIC, "--slice", slice, "--subagent"]);

/** That `run` of `new` ended with 0; if not, the failure shows what it printed, out and err. */
function expectCreated(run: Run): void {
  expect(run.code, `specty new salió con ${run.code}:\n${run.out}\n${run.err}`).toBe(0);
}

/** `specty next` in the epic's folder, from Claude Code's main session. */
const claudeNext = async (root: string) =>
  (await cli(root, ["next"], { env: { CLAUDECODE: "1" } })).out;

describe("the card of an epic, from Claude Code", () => {
  it("AC1: brings a brief per ready slice, and asks to launch a subagent for each", async () => {
    const root = await approvedEpic();
    const text = await claudeNext(root);
    for (const slice of SLICES) {
      expect(text).toContain(`ENCARGO ${slice}:`);
      expect(text).toContain(
        `1. \`specty new "${TITLES[slice]}" --epic ${EPIC} --slice ${slice} --subagent\``,
      );
    }
    expect(text).toContain(
      "SIGUIENTE: lanza en paralelo, en un solo mensaje, un subagente por encargo",
    );
    // The person, at their terminal, has no subagents: the card of today.
    const bare = (await cli(root, ["next"])).out;
    expect(bare).not.toContain("ENCARGO");
    expect(bare).toContain(
      `SIGUIENTE: empieza el corte C1: \`specty new "${TITLES.C1}" --epic ${EPIC} --slice C1\``,
    );
  });

  it("AC3: is the card of today with subagents: false in config.yaml", async () => {
    const root = await approvedEpic(`${CONFIG()}subagents: false\n`);
    const text = await claudeNext(root);
    expect(text).not.toContain("ENCARGO");
    expect(text).toContain(
      `SIGUIENTE: empieza el corte C1: \`specty new "${TITLES.C1}" --epic ${EPIC} --slice C1\` y sigue su salida.`,
    );
  });

  it("AC5: leaves the slice a subagent works on in progress, without a brief", async () => {
    const root = await approvedEpic();
    expect((await startSlice(root, "C1")).code).toBe(0);
    const text = await claudeNext(root);
    expect(text).toContain(`C1 ${TITLES.C1} — en curso: ${idOf("C1")}, en draft`);
    expect(text).not.toContain("ENCARGO C1");
    expect(text).toContain("ENCARGO C2:");
    expect(text).toContain("ENCARGO C3:");
  });

  it("AC4: brings the brief to resume a slice in progress that became an orphan", async () => {
    const root = await approvedEpic();
    expect((await startSlice(root, "C1")).code).toBe(0);
    const id = idOf("C1");
    // Nobody stepped in its folder, and its state was last written two hours ago.
    const before = new Date(NOW.getTime() - 120 * 60_000);
    await utimes(join(folderOf(root, id), `.specty/changes/${id}/state.json`), before, before);
    const text = await claudeNext(root);
    expect(text).toContain("ENCARGO C1 (huérfano):");
    expect(text).toContain(`1. \`specty enter ${id}\``);
    // The folder as the platform writes it: with `\` on Windows.
    expect(text).toMatch(new RegExp(`\`cd '[^']*[/\\\\]\\.worktrees[/\\\\]${id}' &&\``));
    expect(text).toContain("ENCARGO C2:");
  });
});

describe("the slices of an epic, created at once", () => {
  it("AC7: each get their change, folder and branch, though their titles look alike", async () => {
    const root = await approvedEpic();
    expect((await startSlice(root, "C1")).code).toBe(0);
    const runs = await Promise.all([startSlice(root, "C2"), startSlice(root, "C3")]);
    for (const run of runs) {
      expect(run.out).not.toContain("Puede duplicar");
      expectCreated(run);
    }
    const branches = git(root, "branch", "--list");
    for (const slice of SLICES) {
      const id = idOf(slice);
      expect(await exists(join(folderOf(root, id), `.specty/changes/${id}/state.json`))).toBe(true);
      expect(branches).toContain(`specty/${id}`);
    }
  });

  it("AC4: a `new` that fails shows what it printed, out and err", () => {
    const failed: Run = { code: 1, out: "SPECTY · git falló", err: "fatal: could not lock config" };
    expect(() => expectCreated(failed)).toThrow(
      /specty new salió con 1:\nSPECTY · git falló\nfatal: could not lock config/,
    );
    expect(() => expectCreated({ ...failed, code: 0 })).not.toThrow();
  });
});
