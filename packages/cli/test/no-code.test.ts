// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  CONFIG,
  cli,
  APP as FILES,
  git,
  inWorktree,
  person,
  read,
  SPEC_PATH,
  toAcceptance,
  writeFiles,
} from "./support";
import { COMMON_DIR } from "./tools";

/** A full verification that counts its runs in `runs` of the clone's common folder. */
const COUNTER = `require("node:fs").appendFileSync(require("node:path").join(${COMMON_DIR}, "runs"), "x");\n`;

/** SPEC's change, but its only task writes documentation: a free file. */
const DOCS_SPEC = `---
kind: standard
---

# Saludo personalizado

## Objetivo

La app explica cómo saluda.

## Fuera de alcance

- Traducciones.

## Supuestos

- A1: La guía va en docs/.

## Criterios de aceptación

- AC1: CUANDO se abre la guía ENTONCES explica el saludo.
  - test: manual

## Archivos

- crear docs/guia.md — la guía

## Tareas

- [ ] T1: Escribir la guía
  - files: docs/guia.md
  - ac: AC1
  - type: docs
`;

/** A change in a worktree of its own whose full verification counts its runs. */
async function counted() {
  const script = join(await mkdtemp(join(tmpdir(), "specty-count-")), "count.js");
  await writeFile(script, COUNTER);
  const full = `node "${script}"`;
  return inWorktree({
    ...FILES,
    ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(full)}\n`,
  });
}

/** How many times the full verification ran in the clone of `root`. */
const runs = async (root: string) =>
  (await exists(join(root, ".git", "runs"))) ? (await read(root, ".git/runs")).length : 0;

/** Takes the documentation change in `folder` to an acceptance that waits for the person. */
async function docsToAcceptance(folder: string): Promise<void> {
  await writeFiles(folder, { [SPEC_PATH]: DOCS_SPEC });
  expect((await cli(folder, ["propose"])).code).toBe(0);
  const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(folder, ["next"]);
  await writeFiles(folder, { "docs/guia.md": "# Guía\n\nLa app saluda por nombre.\n" });
  expect((await cli(folder, ["task", "done", "T1", "--summary", "Guía"])).code).toBe(0);
}

/** Main moves on with code of another session. */
function mainMoves(root: string) {
  return writeFiles(root, { "src/other.ts": "export const other = 1;\n" }).then(() => {
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "otro trabajo en main");
  });
}

describe("a change that touches no code", () => {
  it("is accepted without the full verification, which says why (AC1)", async () => {
    const { root, folder } = await counted();
    await docsToAcceptance(folder);
    const terminal = person();
    expect((await cli(folder, ["accept"], { terminal })).code).toBe(0);
    expect(await runs(root)).toBe(0);
    expect(terminal.notes.join("\n")).toContain(
      "El cambio no toca código, solo archivos libres (`ignored` y `.specty/`): su código es el de main",
    );
  });

  it("takes main in without verifying it, and says why (AC2)", async () => {
    const { root, folder } = await counted();
    await docsToAcceptance(folder);
    await mainMoves(root);
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain(
      "sin verificar: el cambio no toca código, así que el código es el de main.",
    );
    expect(await runs(root)).toBe(0);
    // The merge came in: the change has main's code.
    expect(await exists(join(folder, "src", "other.ts"))).toBe(true);
  });
});

describe("a change that touches code", () => {
  it("still verifies main's incorporation, once (AC3)", async () => {
    const { root, folder } = await counted();
    await toAcceptance(folder);
    await mainMoves(root);
    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("pasó.");
    // The incorporation verified it, and `accept` reused that run on the same code.
    expect(await runs(root)).toBe(1);
  });
});
