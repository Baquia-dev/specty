// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { CHANGE, CONFIG, cli, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** SPEC's change, proposed. */
async function proposed(): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "1\n", ".specty/config.yaml": CONFIG() });
  await cli(root, ["new", "Saludo personalizado", "--request", "que salude por nombre"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  return root;
}

describe("specty export", () => {
  it("writes a format's files in .specty/exports, and lists them (AC1)", async () => {
    const root = await proposed();
    const result = await cli(root, ["export", CHANGE, "--to", "openspec"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`  openspec/changes/${CHANGE}/proposal.md`);
    const dir = `.specty/exports/openspec/openspec/changes/${CHANGE}`;
    expect(await read(root, `${dir}/proposal.md`)).toContain(
      "# Saludo personalizado\n\n## Why\n\nLa app saluda por nombre.",
    );
    // Without an id, the active change, with the request it was created for.
    expect((await cli(root, ["export", "--to", "kiro"])).code).toBe(0);
    const kiro = ".specty/exports/kiro/.kiro/specs/saludo-personalizado/requirements.md";
    expect(await read(root, kiro)).toContain("**User Story:** que salude por nombre");
  });

  it("writes them where --out says, with the same layout (AC2)", async () => {
    const root = await proposed();
    const inside = await cli(root, ["export", "--to", "speckit", "--out", "otro"]);
    expect(inside.out).toContain("EN Spec Kit, EN otro:");
    expect(await read(root, `otro/specs/${CHANGE}/spec.md`)).toContain(
      "# Feature Specification: Saludo personalizado",
    );
    // Outside the repository, the folder is shown whole: a long `../../…` is hard to read.
    const elsewhere = await mkdtemp(join(tmpdir(), "specty-export-"));
    const outside = await cli(root, ["export", "--to", "kiro", "--out", elsewhere]);
    expect(outside.out).toContain(`EN Kiro, EN ${elsewhere}:`);
  });

  it("refuses a missing or unknown format and a change that is not there (AC3)", async () => {
    const root = await proposed();
    const none = await cli(root, ["export"]);
    expect([none.code, none.out]).toEqual([1, expect.stringContaining("Falta el formato")]);
    const unknown = await cli(root, ["export", "--to", "word"]);
    expect(unknown.out).toContain("No conozco el formato word.");
    const missing = await cli(root, ["export", "20200101-ninguno", "--to", "kiro"]);
    expect([missing.code, missing.out]).toEqual([
      1,
      expect.stringContaining("No hay ningún cambio 20200101-ninguno."),
    ]);
    expect(await exists(join(root, ".specty/exports"))).toBe(false);
  });
});
