// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
  inWorktree,
  NOW,
  person,
  tempRepo,
  tryGit,
} from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

/** The open entries as `specty --json memory` gives them from `cwd`. */
const listed = async (cwd: string, ...args: string[]) =>
  JSON.parse((await cli(cwd, ["--json", "memory", ...args])).out).entries as {
    id: string;
    kind: string;
    status: string;
    text: string;
    created: string;
    origin: { change?: string; by: string };
    quote?: string;
  }[];

/** A file of the memory's branch, as git keeps it. */
const shown = (root: string, path: string, branch = "specty-memory") =>
  git(root, "show", `${branch}:${path}`);

/** How many commits the memory's branch has. */
const commits = (root: string, branch = "specty-memory") =>
  Number(git(root, "rev-list", "--count", branch));

/** What each folder's checkout looks like: its branch and its changed files. */
const checkout = (folder: string) => ({
  branch: git(folder, "branch", "--show-current"),
  status: git(folder, "status", "--porcelain"),
});

describe("memory add", () => {
  it("AC1: writes the entry to the memory's branch, with its origin and date", async () => {
    const { root, folder } = await inWorktree();
    const before = [checkout(root), checkout(folder)];
    const added = await add(folder, "Probar el saludo en Windows");
    expect(added.code).toBe(0);
    expect(added.out).toContain("P1 anotada en specty-memory: Probar el saludo en Windows");
    const file = shown(root, "entries/P1.md");
    expect(file).toContain("id: P1");
    expect(file).toContain("kind: pending");
    expect(file).toContain("status: open");
    expect(file).toContain(`change: ${CHANGE}`);
    expect(file).toContain("by: claude-code");
    expect(file).toContain(NOW.toISOString());
    expect(file).toContain("Probar el saludo en Windows");
    expect([checkout(root), checkout(folder)]).toEqual(before);
  });

  it("AC1: takes the kind from --kind and the next id, and the person without a change", async () => {
    const { root } = await inWorktree();
    await add(root, "Primera");
    const improvement = await cli(
      root,
      ["memory", "add", "Ver la memoria en la UI", "--kind", "improvement"],
      {
        terminal: person(),
      },
    );
    expect(improvement.code).toBe(0);
    const file = shown(root, "entries/P2.md");
    expect(file).toContain("kind: improvement");
    expect(file).toContain("by: person");
    expect(file).not.toContain("change:");
  });

  it("AC1: refuses an empty text or a kind it does not know, and writes nothing", async () => {
    const root = await tempRepo(APP);
    expect((await add(root, "  ")).code).toBe(1);
    expect((await add(root, "Algo", "--kind", "idea")).code).not.toBe(0);
    expect(tryGit(root, "rev-parse", "--verify", "--quiet", "specty-memory").status).not.toBe(0);
  });
});

describe("memory", () => {
  it("AC2: lists at once, from another folder, what one folder added", async () => {
    const { root, folder } = await inWorktree();
    await add(folder, "Probar el saludo en Windows");
    await add(root, "Revisar los textos en inglés");
    const text = (await cli(root, ["memory"])).out;
    expect(text).toContain(
      `P1 · pendiente · Probar el saludo en Windows — ${CHANGE}, claude-code, ${NOW.toISOString().slice(0, 10)}`,
    );
    expect(text.indexOf("P1 ·")).toBeLessThan(text.indexOf("P2 ·"));
    const entries = await listed(folder);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "P1",
      kind: "pending",
      status: "open",
      text: "Probar el saludo en Windows",
      origin: { change: CHANGE, by: "claude-code" },
    });
    expect(entries[1]).toMatchObject({ id: "P2", origin: { by: "claude-code" } });
    expect(entries[1]?.origin.change).toBeUndefined();
  });

  it("AC2: says there is nothing yet, before the branch exists", async () => {
    const root = await tempRepo(APP);
    const run = await cli(root, ["memory"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain("No hay entradas abiertas.");
    expect(await listed(root)).toEqual([]);
  });
});

describe("several sessions at once", () => {
  it("AC5: keep every entry, each with its own id", async () => {
    const { root, folder } = await inWorktree();
    const texts = ["Uno", "Dos", "Tres", "Cuatro"];
    const runs = await Promise.all(
      texts.map((text, index) => add(index % 2 === 0 ? root : folder, text)),
    );
    expect(runs.map((run) => run.code)).toEqual([0, 0, 0, 0]);
    const entries = await listed(root);
    expect(entries.map((entry) => entry.id).toSorted()).toEqual(["P1", "P2", "P3", "P4"]);
    expect(entries.map((entry) => entry.text).toSorted()).toEqual([...texts].toSorted());
    expect(
      git(root, "ls-tree", "--name-only", "specty-memory", "entries/").split("\n"),
    ).toHaveLength(4);
  });
});

describe("the memory's branch", () => {
  it("AC6: gets one commit of Specty per entry, with its trailers", async () => {
    const { root, folder } = await inWorktree();
    await add(folder, "Probar el saludo en Windows");
    const message = git(root, "log", "-1", "--format=%B", "specty-memory");
    expect(message.startsWith("memoria: anota P1")).toBe(true);
    expect(message).toContain("Specty-Memory: P1");
    expect(message).toContain(`Specty-Change: ${CHANGE}`);
    expect(message).toContain("Specty-Agent: claude-code");
    await cli(root, ["memory", "add", "Otra"], { terminal: person() });
    expect(commits(root)).toBe(2);
    const second = git(root, "log", "-1", "--format=%B", "specty-memory");
    expect(second).toContain("Specty-Memory: P2");
    expect(second).not.toContain("Specty-Change");
    expect(second).not.toContain("Specty-Agent");
    expect(tryGit(root, "merge-base", "main", "specty-memory").status).not.toBe(0);
  });

  it("AC6: keeps a README with the open entries by kind, in the project's language", async () => {
    const root = await tempRepo(APP);
    await add(root, "Probar el saludo en Windows");
    await add(root, "Ver la memoria en la UI", "--kind", "improvement");
    const readme = shown(root, "README.md");
    expect(readme.startsWith("# Memoria de Specty")).toBe(true);
    expect(readme).toContain("## Pendientes");
    expect(readme).toContain("- [P1](entries/P1.md) — Probar el saludo en Windows");
    expect(readme).toContain("## Mejoras");
    expect(readme).toContain("- [P2](entries/P2.md) — Ver la memoria en la UI");
  });

  it("AC7: is the one memory.branch names", async () => {
    const config = `${CONFIG()}memory:\n  branch: notas/memoria\n`;
    const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
    expect((await add(root, "Probar el saludo en Windows")).code).toBe(0);
    expect(shown(root, "entries/P1.md", "notas/memoria")).toContain("Probar el saludo en Windows");
    expect(tryGit(root, "rev-parse", "--verify", "--quiet", "specty-memory").status).not.toBe(0);
    expect((await listed(root)).map((entry) => entry.id)).toEqual(["P1"]);
  });
});

describe("a decision", () => {
  it("AC3: keeps the person's quote, under an id that starts with D", async () => {
    const root = await tempRepo(APP);
    await add(root, "Antes");
    const added = await add(
      root,
      "La memoria vive en una rama propia",
      "--kind",
      "decision",
      "--quote",
      "la que tú recomiendas",
    );
    expect(added.code).toBe(0);
    expect(added.out).toContain("D1 anotada");
    const file = shown(root, "entries/D1.md");
    expect(file).toContain("kind: decision");
    expect(file).toContain("quote: la que tú recomiendas");
    expect((await cli(root, ["memory"])).out).toContain("«la que tú recomiendas»");
    expect((await listed(root)).find((entry) => entry.id === "D1")?.quote).toBe(
      "la que tú recomiendas",
    );
  });

  it("AC3: is not added without the person's quote", async () => {
    const root = await tempRepo(APP);
    const refused = await add(root, "La memoria vive en una rama propia", "--kind", "decision");
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("cita literal");
    expect(refused.out).toContain("--quote");
    expect(tryGit(root, "rev-parse", "--verify", "--quiet", "specty-memory").status).not.toBe(0);
  });
});

describe("memory done", () => {
  /** A repository whose memory has a reminder (P1), a pending item (P2) and a decision (D1). */
  async function withEntries(): Promise<string> {
    const root = await tempRepo(APP);
    await add(root, "Subir la rama de la memoria", "--kind", "reminder");
    await add(root, "Probar el saludo en Windows");
    await add(
      root,
      "La memoria vive en una rama propia",
      "--kind",
      "decision",
      "--quote",
      "la que tú recomiendas",
    );
    return root;
  }

  it("AC4: marks a reminder done, with who and when, and the list no longer has it", async () => {
    const root = await withEntries();
    const done = await cli(root, ["memory", "done", "p1"], { terminal: person() });
    expect(done.code).toBe(0);
    expect(done.out).toContain("P1");
    const file = shown(root, "entries/P1.md");
    expect(file).toContain("status: done");
    expect(file).toContain("closed:");
    expect(file).toContain("by: person");
    expect(git(root, "log", "-1", "--format=%B", "specty-memory")).toContain("Specty-Memory: P1");
    expect((await listed(root)).map((entry) => entry.id)).toEqual(["P2", "D1"]);
    expect((await cli(root, ["memory"])).out).not.toContain("P1 ·");
    expect((await cli(root, ["memory", "--all"])).out).toContain(
      "P1 · recordatorio · hecha · Subir la rama de la memoria",
    );
    expect(shown(root, "README.md")).not.toContain("Subir la rama de la memoria");
  });

  it("AC4: changes nothing on a pending item, a decision or an id that does not exist", async () => {
    const root = await withEntries();
    const before = commits(root);
    const pending = await cli(root, ["memory", "done", "P2"], CLAUDE);
    expect(pending.code).toBe(1);
    expect(pending.out).toContain("Solo un recordatorio se marca hecho");
    const decision = await cli(root, ["memory", "done", "D1"], CLAUDE);
    expect(decision.code).toBe(1);
    expect(decision.out).toContain("D1 es una decisión");
    const unknown = await cli(root, ["memory", "done", "P9"], CLAUDE);
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain("No hay ninguna entrada P9");
    expect(commits(root)).toBe(before);
    expect(shown(root, "entries/P2.md")).toContain("status: open");
  });

  it("AC4: says a reminder already done is done, and changes nothing", async () => {
    const root = await withEntries();
    await cli(root, ["memory", "done", "P1"], CLAUDE);
    const before = commits(root);
    const again = await cli(root, ["memory", "done", "P1"], CLAUDE);
    expect(again.code).toBe(1);
    expect(again.out).toContain("P1 ya está hecha");
    expect(commits(root)).toBe(before);
  });
});
