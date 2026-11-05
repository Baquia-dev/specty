// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, folderOf, git, person, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);
const byPerson = (cwd: string, ...args: string[]) =>
  cli(cwd, ["memory", ...args], { terminal: person() });

/** How many commits the memory's branch has. */
const memoryCommits = (root: string) => Number(git(root, "rev-list", "--count", "specty-memory"));

/** The texts of the open entries, as `specty --json memory` gives them. */
const openTexts = async (root: string) =>
  (JSON.parse((await cli(root, ["--json", "memory"])).out).entries as { text: string }[]).map(
    (entry) => entry.text,
  );

const FLAKY = "El test de la página embebida falla a veces con un error del worker";
const ALIKE = "Falla a veces el test embebido por un error no capturado del worker";
const OTHER = "Traducir la guía de instalación al inglés";

describe("memory add from an agent, before an open entry it may repeat", () => {
  it("AC1: writes nothing, names it and says what to do if it is the same or a different one", async () => {
    const root = await tempRepo(APP);
    expect((await add(root, FLAKY)).code).toBe(0);
    const commits = memoryCommits(root);
    const refused = await add(root, ALIKE);
    expect(refused.code).toBe(2);
    expect(refused.out).toContain(
      `No se anotó porque puede repetir una entrada abierta:\n  P1 · pendiente · ${FLAKY}\n`,
    );
    expect(refused.out).toContain(
      "SIGUIENTE: si es la misma, no la añadas ni se la menciones al usuario, y sigue con `specty next`; si es distinta, vuelve a ejecutar `specty memory add` con `--distinct-from P1`.",
    );
    expect(memoryCommits(root)).toBe(commits);
    expect(await openTexts(root)).toEqual([FLAKY]);
  });

  it("AC1: an improvement is refused too, before open, taken or proposed to drop ones", async () => {
    const root = await tempRepo(APP);
    expect((await byPerson(root, "add", FLAKY)).code).toBe(0);
    expect((await byPerson(root, "add", FLAKY, "--kind", "improvement")).code).toBe(0);
    expect((await byPerson(root, "add", FLAKY)).code).toBe(0);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    expect((await cli(folderOf(root), ["memory", "resolve", "P2"], CLAUDE)).code).toBe(0);
    expect((await cli(root, ["memory", "drop", "P3", "--reason", "Repetido."], CLAUDE)).code).toBe(
      0,
    );
    const refused = await add(root, ALIKE, "--kind", "improvement");
    expect(refused.code).toBe(2);
    expect(refused.out).toContain(
      `  P1 · pendiente · ${FLAKY}\n  P2 · mejora · ${FLAKY}\n  P3 · pendiente · ${FLAKY}\n`,
    );
    expect(refused.out).toContain("con `--distinct-from P1 P2 P3`.");
    expect(await openTexts(root)).not.toContain(ALIKE);
  });

  it("AC2: writes it with --distinct-from and every alike id, and names only the missing ones otherwise", async () => {
    const root = await tempRepo(APP);
    expect((await byPerson(root, "add", FLAKY)).code).toBe(0);
    expect((await byPerson(root, "add", FLAKY)).code).toBe(0);
    const partial = await add(root, ALIKE, "--distinct-from", "P1");
    expect(partial.code).toBe(2);
    expect(partial.out).toContain(
      `No se anotó porque puede repetir una entrada abierta:\n  P2 · pendiente · ${FLAKY}\nSIGUIENTE:`,
    );
    expect(partial.out).toContain("con `--distinct-from P2`.");
    const added = await add(root, ALIKE, "--distinct-from", "p1", "P2");
    expect(added.code).toBe(0);
    expect(added.out).toContain(`P3 anotada en specty-memory: ${ALIKE}`);
    expect(await openTexts(root)).toContain(ALIKE);
  });
});

describe("memory add with no open entry to repeat, or with no brake", () => {
  it("AC3: writes a pending item only like dropped entries, reminders, decisions or lessons, or like none", async () => {
    const root = await tempRepo(APP);
    expect((await byPerson(root, "add", FLAKY)).code).toBe(0);
    expect((await byPerson(root, "drop", "P1", "--reason", "Ya no aplica.")).code).toBe(0);
    expect((await byPerson(root, "add", FLAKY, "--kind", "reminder")).code).toBe(0);
    expect((await byPerson(root, "add", FLAKY, "--kind", "decision", "--quote", "sí")).code).toBe(
      0,
    );
    expect((await byPerson(root, "add", FLAKY, "--kind", "lesson", "--path", "src/**")).code).toBe(
      0,
    );
    expect((await add(root, ALIKE)).code).toBe(0);
    expect((await add(root, OTHER, "--kind", "improvement")).code).toBe(0);
    expect(await openTexts(root)).toEqual(expect.arrayContaining([ALIKE, OTHER]));
  });

  it("AC4: the person writes it like an open one, and so does an agent's reminder, decision or lesson", async () => {
    const root = await tempRepo(APP);
    expect((await add(root, FLAKY)).code).toBe(0);
    expect((await byPerson(root, "add", ALIKE)).code).toBe(0);
    expect((await add(root, ALIKE, "--kind", "reminder")).code).toBe(0);
    expect((await add(root, ALIKE, "--kind", "decision", "--quote", "sí")).code).toBe(0);
    expect((await add(root, ALIKE, "--kind", "lesson", "--path", "src/**")).code).toBe(0);
    expect(await openTexts(root)).toEqual([FLAKY, ALIKE, ALIKE, ALIKE, ALIKE]);
  });
});
