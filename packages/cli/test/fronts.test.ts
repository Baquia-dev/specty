// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, git, person, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const run = (cwd: string, ...args: string[]) => cli(cwd, args, CLAUDE);

describe("fronts of work in Specty's memory", () => {
  it("AC1: front add keeps the front in the memory's branch, and front lists it", async () => {
    const root = await tempRepo(APP);
    const added = await run(
      root,
      "front",
      "add",
      "B",
      "Guard, instalación y empaquetado",
      "--path",
      "packages/cli/src/enforce/**",
      "packages/cli/src/install/**",
    );
    expect(added.code).toBe(0);
    expect(added.out).toContain(
      "Frente B creado en specty-memory: Guard, instalación y empaquetado",
    );
    const file = git(root, "show", "specty-memory:fronts/B.md");
    expect(file).toContain("name: B\n");
    expect(file).toContain("by: claude-code\n");
    expect(file).toContain("packages/cli/src/install/**");
    expect(file).toContain("items: []\n");
    expect(file).toContain("Guard, instalación y empaquetado");
    const commit = git(root, "log", "-1", "--format=%B", "specty-memory");
    expect(commit).toContain("memoria: frente B");
    expect(commit).toContain("Specty-Front: B");
    expect((await run(root, "front", "add", "ui", "Servidor y UI")).code).toBe(0);
    const list = (await cli(root, ["front"])).out;
    expect(list).toContain(
      "FRENTE B:\n  Guard, instalación y empaquetado · en packages/cli/src/enforce/**, packages/cli/src/install/**\n  Sin entradas abiertas.\n",
    );
    expect(list).toContain("FRENTE UI:\n  Servidor y UI\n  Sin entradas abiertas.");
  });

  it("AC2: front assign puts the entries at the end in order and takes them out of another", async () => {
    const root = await tempRepo(APP);
    for (const text of ["Uno", "Dos", "Tres", "Cuatro"])
      expect((await run(root, "memory", "add", text)).code).toBe(0);
    expect((await run(root, "front", "add", "A", "Primero")).code).toBe(0);
    expect((await run(root, "front", "add", "B", "Segundo")).code).toBe(0);
    expect((await run(root, "front", "assign", "A", "P1", "P2", "P3")).code).toBe(0);
    const moved = await run(root, "front", "assign", "b", "P3", "p1");
    expect(moved.code).toBe(0);
    expect(moved.out).toContain("P3, P1 al frente B.");
    expect(moved.out).toContain("Orden del frente B: P3, P1.");
    expect(moved.out).toContain("Ya no están en el frente A: P3, P1.");
    expect(git(root, "log", "-1", "--format=%s", "specty-memory")).toBe(
      "memoria: P3, P1 al frente B",
    );
    expect((await run(root, "front", "assign", "B", "P4")).code).toBe(0);
    const list = (await cli(root, ["front"])).out;
    expect(list).toContain("FRENTE A:\n  Primero\n  P2 · pendiente · Dos\n");
    expect(list).toContain(
      "FRENTE B:\n  Segundo\n  P3 · pendiente · Tres\n  P1 · pendiente · Uno\n  P4 · pendiente · Cuatro\n",
    );
    const dropped = await cli(root, ["memory", "drop", "P2", "--reason", "Ya no aplica."], {
      terminal: person(),
    });
    expect(dropped.code).toBe(0);
    expect((await cli(root, ["front"])).out).toContain(
      "FRENTE A:\n  Primero\n  Sin entradas abiertas.\n",
    );
  });

  it("AC3: front add and front assign write nothing and explain why", async () => {
    const root = await tempRepo(APP);
    expect((await run(root, "memory", "add", "Uno")).code).toBe(0);
    expect((await run(root, "memory", "add", "Avisar", "--kind", "reminder")).code).toBe(0);
    const space = await run(root, "front", "add", "frente B", "Guard");
    expect(space.code).toBe(1);
    expect(space.out).toContain("«frente B» no vale como nombre de un frente");
    expect((await run(root, "front", "add", "camión", "Guard")).code).toBe(1);
    const empty = await run(root, "front", "add", "B", "  ");
    expect(empty.code).toBe(1);
    expect(empty.out).toContain("El texto del frente está vacío.");
    expect((await run(root, "front", "add", "B", "Guard.")).code).toBe(0);
    const twice = await run(root, "front", "add", "b", "Otro");
    expect(twice.code).toBe(1);
    expect(twice.out).toContain("Ya hay un frente «B»: Guard.");
    const noFront = await run(root, "front", "assign", "Z", "P1");
    expect(noFront.code).toBe(1);
    expect(noFront.out).toContain("No hay ningún frente «Z».");
    const noEntry = await run(root, "front", "assign", "B", "P1", "P9");
    expect(noEntry.code).toBe(1);
    expect(noEntry.out).toContain("No hay ninguna entrada P9.");
    const reminder = await run(root, "front", "assign", "B", "P2");
    expect(reminder.code).toBe(1);
    expect(reminder.out).toContain(
      "Solo los pendientes y las mejoras van en un frente, y P2 es un recordatorio.",
    );
    const dropped = await cli(root, ["memory", "drop", "P1", "--reason", "Ya no aplica."], {
      terminal: person(),
    });
    expect(dropped.code).toBe(0);
    const closed = await run(root, "front", "assign", "B", "P1");
    expect(closed.code).toBe(1);
    expect(closed.out).toContain("P1 ya está descartada.");
    expect(git(root, "log", "--format=%s", "specty-memory")).not.toContain("al frente");
    expect((await cli(root, ["front"])).out).toContain(
      "FRENTE B:\n  Guard.\n  Sin entradas abiertas.",
    );
  });
});
