// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, person, SPEC, tempRepo, writeFiles } from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");

/** A quick spec that touches `files`. */
const quick = (title: string, files: readonly string[]) =>
  `---\nkind: quick\n---\n\n# ${title}\n\n## Objetivo\n\nAlgo.\n\n## Archivos\n\n${files.map((file) => `- modificar ${file} — motivo`).join("\n")}\n\n## Tareas\n\n- [ ] T1: Hacerlo\n  - files: ${files.join(", ")}\n  - type: fix\n`;

/** A change of `root` in its own worktree with `spec` written. */
async function drafted(
  root: string,
  title: string,
  id: string,
  spec: string,
  ...args: string[]
): Promise<string> {
  expect((await cli(root, ["new", "--worktree", title, ...args])).code).toBe(0);
  const folder = folderOf(root, id);
  await writeFiles(folder, { [`.specty/changes/${id}/spec.md`]: spec });
  return folder;
}

/** SPEC's change proposed in its folder, the open change the next one is compared with. */
async function withProposed(): Promise<string> {
  const root = await tempRepo(APP);
  const first = await drafted(root, "Saludo personalizado", CHANGE, SPEC);
  expect((await cli(first, ["propose"])).code).toBe(0);
  return root;
}

describe("propose before an open change that shares its files", () => {
  it("AC1: warns of a possible duplicate when it shares at least half of its governed files", async () => {
    const root = await withProposed();
    const second = await drafted(root, "Otro cambio", OTHER, quick("Otro cambio", ["src/app.ts"]));
    const proposed = await cli(second, ["propose"]);
    expect(proposed.code).toBe(0);
    expect(proposed.out).toContain(
      // The folder, as in `status`, relative to where it runs: the other change's worktree.
      `POSIBLE DUPLICADO:\n  Comparte 1 de 1 archivos gobernados con ${CHANGE} (review, en ../${CHANGE}) — «Saludo personalizado».`,
    );
    expect(proposed.out).not.toContain("antes de aprobar");
  });

  it("AC2: in delegated mode, asks the user before approving", async () => {
    const root = await withProposed();
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    const second = await drafted(root, "Otro cambio", OTHER, quick("Otro cambio", ["src/app.ts"]));
    const proposed = await cli(second, ["propose"]);
    expect(proposed.out).toContain(
      `SIGUIENTE: modo delegado: antes de aprobar, pregúntale al usuario si este cambio duplica ${CHANGE}; si es otro trabajo, aprueba con \`specty approve\`, y si no, cancélalo con \`specty cancel\`.`,
    );
  });

  it("AC3: says nothing under half of its files", async () => {
    const root = await withProposed();
    const files = ["src/app.ts", "src/other.ts", "src/more.ts"];
    const few = await drafted(root, "Otro cambio", OTHER, quick("Otro cambio", files));
    const proposed = await cli(few, ["propose"]);
    expect(proposed.out).toContain(`ARCHIVOS COMPARTIDOS:\n  src/app.ts — también en ${CHANGE}`);
    expect(proposed.out).not.toContain("POSIBLE DUPLICADO");
  });

  it("AC3: says nothing of a change the user told apart", async () => {
    const root = await withProposed();
    const apart = CHANGE.replace("saludo-personalizado", "aparte");
    const told = await drafted(
      root,
      "Aparte",
      apart,
      quick("Aparte", ["src/app.ts"]),
      "--distinct-from",
      CHANGE,
    );
    expect((await cli(told, ["propose"])).out).not.toContain("POSIBLE DUPLICADO");
  });
});
