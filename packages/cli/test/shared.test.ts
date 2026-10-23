// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, person, SPEC, tempRepo, writeFiles } from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const DOCS = CHANGE.replace("saludo-personalizado", "solo-docs");

/** A quick spec that touches `files`. */
const quick = (title: string, files: readonly string[]) =>
  `---\nkind: quick\n---\n\n# ${title}\n\n## Objetivo\n\nAlgo.\n\n## Archivos\n\n${files.map((file) => `- modificar ${file} — motivo`).join("\n")}\n\n## Tareas\n\n- [ ] T1: Hacerlo\n  - files: ${files.join(", ")}\n  - type: fix\n`;

/** A change of `root` in its own worktree with `spec` written. */
async function drafted(root: string, title: string, id: string, spec: string): Promise<string> {
  expect((await cli(root, ["new", "--worktree", title])).code).toBe(0);
  const folder = folderOf(root, id);
  await writeFiles(folder, { [`.specty/changes/${id}/spec.md`]: spec });
  return folder;
}

describe("files shared with other open changes", () => {
  it("are named when proposing and before approving, docs aside (AC1, AC2, AC4)", async () => {
    const root = await tempRepo(APP);
    const first = await drafted(root, "Saludo personalizado", CHANGE, SPEC);
    expect((await cli(first, ["propose"])).code).toBe(0);
    const files = ["src/app.ts", "src/other.ts", "docs/guia.md"];
    const second = await drafted(root, "Otro cambio", OTHER, quick("Otro cambio", files));
    const proposed = await cli(second, ["propose"]);
    expect(proposed.code).toBe(0);
    expect(proposed.out).toContain(`ARCHIVOS COMPARTIDOS:\n  src/app.ts — también en ${CHANGE}`);
    expect(proposed.out).not.toContain("src/other.ts —");
    expect(proposed.out).not.toContain("docs/guia.md —");

    const terminal = person();
    await cli(second, ["approve"], { terminal });
    expect(terminal.notes.join("\n")).toContain(`! Compartido: src/app.ts — también en ${CHANGE}`);

    // Only documentation in common: no warning.
    const docs = await drafted(root, "Solo docs", DOCS, quick("Solo docs", ["docs/guia.md"]));
    expect((await cli(docs, ["propose"])).out).not.toContain("ARCHIVOS COMPARTIDOS");
  });

  it("are named when a task asks for more scope, approved or pending (AC3)", async () => {
    const root = await tempRepo(APP);
    const first = await drafted(root, "Saludo personalizado", CHANGE, SPEC);
    await cli(first, ["propose"]);
    await cli(first, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await cli(first, ["next"]);
    const files = ["src/other.ts", "lib/extra.test.ts"];
    const second = await drafted(root, "Otro cambio", OTHER, quick("Otro cambio", files));
    await cli(second, ["propose"]);
    const pending = await cli(first, [
      "scope",
      "add",
      "src/other.ts",
      "--task",
      "T1",
      "--reason",
      "Lo necesito",
    ]);
    expect(pending.out).toContain("S1");
    expect(pending.out).toContain(`ARCHIVOS COMPARTIDOS:\n  src/other.ts — también en ${OTHER}`);
    // A test outside the task's folders is approved by policy, and still named.
    const approved = await cli(first, [
      "scope",
      "add",
      "lib/extra.test.ts",
      "--task",
      "T1",
      "--reason",
      "Un test",
    ]);
    expect(approved.out).toContain("Ampliación aprobada por la política");
    expect(approved.out).toContain(`lib/extra.test.ts — también en ${OTHER}`);
  });

  it("leaves out a change that is no longer open (AC4)", async () => {
    const root = await tempRepo(APP);
    const first = await drafted(root, "Saludo personalizado", CHANGE, SPEC);
    await cli(first, ["propose"]);
    const second = await drafted(root, "Otro cambio", OTHER, quick("Otro cambio", ["src/app.ts"]));
    expect((await cli(second, ["propose"])).out).toContain("ARCHIVOS COMPARTIDOS");
    await cli(first, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    const cancelled = await cli(first, ["cancel", "--reason", "Ya no hace falta"], {
      terminal: person(),
    });
    expect(cancelled.code).toBe(0);
    expect((await cli(second, ["propose"])).out).not.toContain("ARCHIVOS COMPARTIDOS");
  });
});
