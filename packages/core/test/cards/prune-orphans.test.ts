// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  cleanupBlocks,
  pruneCard,
  renderText,
  rescueCommitSubject,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const NOTHING = { folders: [], branches: [], kept: [] };
const REF = "refs/specty/rescue/20261106-x/20261106120000";
const MB = 1024 * 1024;

/** The line of a rescue ref, in Spanish and in English. */
const rescuedEs = (folder: string) =>
  `${folder}: lo que tenía sin commit quedó en ${REF}; míralo con \`git show ${REF}\` y recupéralo con \`git worktree add <carpeta> ${REF}\`.`;
const rescuedEn = (folder: string) =>
  `${folder}: what it had uncommitted is in ${REF}; see it with \`git show ${REF}\` and get it back with \`git worktree add <folder> ${REF}\`.`;

describe("what `specty prune` says of the orphans it removed", () => {
  it("AC4, AC6, AC7, AC11: says how many records git forgot, and the ghost and empty folders removed, in Spanish and in English", () => {
    const pruned = {
      ...NOTHING,
      records: 2,
      ghosts: ["/r/.worktrees/viejo"],
      empty: ["/r/.specty/changes/vacia"],
    };
    expect(renderText(pruneCard(pruned, ES), "es")).toBe(
      [
        "SPECTY · limpieza",
        "CARPETAS FANTASMA BORRADAS:",
        "  /r/.worktrees/viejo",
        "REGISTROS DE WORKTREES OLVIDADOS:",
        "  Registros de git de worktrees cuya carpeta ya no existía: 2.",
        "CARPETAS VACÍAS BORRADAS:",
        "  /r/.specty/changes/vacia",
        'SIGUIENTE: para otro cambio, `specty new "<título>"`.',
      ].join("\n"),
    );
    expect(renderText(pruneCard(pruned, EN), "en")).toBe(
      [
        "SPECTY · cleanup",
        "GHOST FOLDERS REMOVED:",
        "  /r/.worktrees/viejo",
        "WORKTREE RECORDS FORGOTTEN:",
        "  Git records of worktrees whose folder no longer existed: 2.",
        "EMPTY FOLDERS REMOVED:",
        "  /r/.specty/changes/vacia",
        'NEXT: for another change, `specty new "<title>"`.',
      ].join("\n"),
    );
  });

  it("AC5, AC11: names each rescue ref with how to see it and get it back, after the folders removed", () => {
    const pruned = {
      ...NOTHING,
      folders: ["/r/.worktrees/x"],
      branches: ["specty/x"],
      rescued: [{ folder: "/r/.worktrees/x", ref: REF, bytes: 120 }],
    };
    expect(renderText(pruneCard(pruned, ES), "es")).toBe(
      [
        "SPECTY · limpieza",
        "CARPETAS BORRADAS:",
        "  /r/.worktrees/x",
        "GUARDADO EN REFS DE RESCATE:",
        `  ${rescuedEs("/r/.worktrees/x")}`,
        "RAMAS BORRADAS:",
        "  specty/x",
        'SIGUIENTE: para otro cambio, `specty new "<título>"`.',
      ].join("\n"),
    );
    expect(renderText(pruneCard(pruned, EN), "en")).toContain(
      `SAVED IN RESCUE REFS:\n  ${rescuedEn("/r/.worktrees/x")}\n`,
    );
  });

  it("AC6, AC11: says how much a rescue weighs from 10 MB on", () => {
    const weighing = (bytes: number, ctx: CardContext) =>
      renderText(
        pruneCard({ ...NOTHING, rescued: [{ folder: "/r/.worktrees/x", ref: REF, bytes }] }, ctx),
        ctx.lang,
      );
    expect(weighing(11 * MB, ES)).toContain(`  ${rescuedEs("/r/.worktrees/x")} Pesa 11 MB.\n`);
    expect(weighing(10 * MB, ES)).toContain(`  ${rescuedEs("/r/.worktrees/x")} Pesa 10 MB.\n`);
    expect(weighing(10 * MB - 1, ES)).toContain(`  ${rescuedEs("/r/.worktrees/x")}\n`);
    expect(weighing(10 * MB - 1, ES)).not.toContain("Pesa");
    expect(weighing(12 * MB, EN)).toContain(`  ${rescuedEn("/r/.worktrees/x")} It weighs 12 MB.\n`);
  });

  it("AC8, AC11: keeps a folder it could not save among what stays, with git's reason", () => {
    const pruned = {
      ...NOTHING,
      kept: ["specty/x: no está en main."],
      unsaved: [{ folder: "/r/.worktrees/y", reason: "fatal: Unable to process path secreto.txt" }],
    };
    expect(renderText(pruneCard(pruned, ES), "es")).toContain(
      [
        "QUEDAN:",
        "  specty/x: no está en main.",
        "  /r/.worktrees/y: lo que tiene no se pudo guardar en una ref de rescate, así que queda: fatal: Unable to process path secreto.txt",
        "",
      ].join("\n"),
    );
    expect(renderText(pruneCard(pruned, EN), "en")).toContain(
      "  /r/.worktrees/y: what it has could not be saved in a rescue ref, so it stays: fatal: Unable to process path secreto.txt\n",
    );
  });

  it("AC4: with none of the new kinds, there may still be nothing to clean up", () => {
    const none = { ...NOTHING, records: 0, ghosts: [], rescued: [], unsaved: [], empty: [] };
    expect(renderText(pruneCard(none, ES), "es")).toContain("No había nada que limpiar.");
    expect(renderText(pruneCard({ ...none, records: 1 }, ES), "es")).not.toContain(
      "No había nada que limpiar.",
    );
    expect(renderText(pruneCard({ ...none, empty: ["/r/x"] }, ES), "es")).not.toContain(
      "No había nada que limpiar.",
    );
  });
});

describe("what `new`, `close` and `cancel` add of their clean-up", () => {
  const swept = {
    finished: ["/r/.worktrees/a"],
    ghosts: ["/r/.worktrees/b"],
    rescued: [{ folder: "/r/.worktrees/b", ref: REF, bytes: 3 }],
    unsaved: [{ folder: "/r/.worktrees/c", reason: "fatal: x" }],
  };

  it("AC5, AC6, AC8, AC11: the finished and ghost folders removed, the rescue refs and what stays, in Spanish and in English", () => {
    expect(cleanupBlocks(swept, "es")).toEqual([
      { title: "CARPETAS DE CAMBIOS TERMINADOS, BORRADAS", lines: ["/r/.worktrees/a"] },
      { title: "CARPETAS FANTASMA BORRADAS", lines: ["/r/.worktrees/b"] },
      { title: "GUARDADO EN REFS DE RESCATE", lines: [rescuedEs("/r/.worktrees/b")] },
      {
        title: "QUEDAN",
        lines: [
          "/r/.worktrees/c: lo que tiene no se pudo guardar en una ref de rescate, así que queda: fatal: x",
        ],
      },
    ]);
    expect(cleanupBlocks(swept, "en")).toEqual([
      { title: "FOLDERS OF FINISHED CHANGES, REMOVED", lines: ["/r/.worktrees/a"] },
      { title: "GHOST FOLDERS REMOVED", lines: ["/r/.worktrees/b"] },
      { title: "SAVED IN RESCUE REFS", lines: [rescuedEn("/r/.worktrees/b")] },
      {
        title: "KEPT",
        lines: [
          "/r/.worktrees/c: what it has could not be saved in a rescue ref, so it stays: fatal: x",
        ],
      },
    ]);
  });

  it("AC4: adds nothing when the clean-up did none of that, and leaves the finished folders to `new`", () => {
    expect(cleanupBlocks({ ghosts: [], rescued: [], unsaved: [] }, "es")).toEqual([]);
    expect(cleanupBlocks({ finished: [], ghosts: ["/g"], rescued: [], unsaved: [] }, "es")).toEqual(
      [{ title: "CARPETAS FANTASMA BORRADAS", lines: ["/g"] }],
    );
  });
});

describe("the commit of a rescue", () => {
  it("AC5, AC11: says whose folder it kept, in Spanish and in English", () => {
    expect(rescueCommitSubject("20261106-x", "es")).toBe(
      "wip: lo que 20261106-x tenía sin commit al quitar su carpeta",
    );
    expect(rescueCommitSubject("20261106-x", "en")).toBe(
      "wip: what 20261106-x had uncommitted when its folder was removed",
    );
  });
});
