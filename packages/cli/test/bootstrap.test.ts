// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, folderOf, read, tempRepo } from "./support";

/** A new project, as `init` leaves it when an agent runs it: PRODUCT.md with its questions. */
async function newProject(): Promise<string> {
  const root = await tempRepo({ "README.md": "# Notas\n" });
  const init = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
  expect(init.out).toContain("Proyecto nuevo");
  return root;
}

/** The change `new` created, read from its folder. */
async function created(root: string, out: string) {
  const id = /SPECTY · (\S+) · draft/.exec(out)?.[1] ?? "";
  const folder = folderOf(root, id);
  const [first] = (await read(folder, `.specty/changes/${id}/audit.jsonl`)).trim().split("\n");
  return {
    spec: await read(folder, `.specty/changes/${id}/spec.md`),
    event: JSON.parse(first ?? "{}"),
  };
}

describe("the first change of a new project", () => {
  it("is what next proposes: the skeleton, from PRODUCT.md (AC1)", async () => {
    const root = await newProject();
    const next = await cli(root, ["next"]);
    expect(next.out).toContain("es un proyecto nuevo: aún no hay código.");
    expect(next.out).toContain(
      'SIGUIENTE: ejecuta `specty new "Esqueleto del proyecto" --request "<petición literal del usuario>"`.',
    );
  });

  it("cannot be quick, and is created with the skeleton's hints, on record (AC2, AC3)", async () => {
    const root = await newProject();
    const quick = await cli(root, ["new", "--kind", "quick", "Esqueleto"]);
    expect(quick.code).toBe(1);
    expect(quick.out).toContain(
      "Es el primer cambio de un proyecto nuevo: el esqueleto va en un cambio standard, no quick.",
    );
    expect(quick.out).toContain("sin `--kind quick`");
    const made = await cli(root, [
      "new",
      "Esqueleto del proyecto",
      "--request",
      "Haz el esqueleto",
    ]);
    expect(made.code).toBe(0);
    const { spec, event } = await created(root, made.out);
    expect(spec).toContain("<!-- El esqueleto del proyecto, a partir de PRODUCT.md");
    expect(spec).toContain("porque aún no hay verify.default. -->");
    expect(event).toMatchObject({ event: "change.created", data: { bootstrap: true } });
  });

  it("is like any other once the project has code (AC4)", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["next"])).out).toContain("--kind quick");
    const made = await cli(root, ["new", "--worktree", "Otro"]);
    const { spec, event } = await created(root, made.out);
    expect(spec).not.toContain("PRODUCT.md");
    expect(event.data.bootstrap).toBeUndefined();
    const quick = await cli(root, ["new", "--worktree", "--kind", "quick", "Pequeño"]);
    expect(quick.code).toBe(0);
  });
});
