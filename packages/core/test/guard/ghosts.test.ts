// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  decideGuard,
  type ForeignPath,
  type GhostPath,
  type GuardAction,
  type GuardContext,
  type ShellFacts,
} from "../../src";

const MAIN = "/p/app";
const FOLDER = `${MAIN}/.worktrees/20261101-cerrado`;
/** A path in the folder of a change that was removed when it closed. */
const GHOST: GhostPath = { path: `${FOLDER}/src/a.ts`, folder: FOLDER, main: MAIN };
/** The same, in the folder of an open change that lost it. */
const LOST: GhostPath = {
  path: `${MAIN}/.worktrees/20261102-perdido/src/a.ts`,
  folder: `${MAIN}/.worktrees/20261102-perdido`,
  main: MAIN,
  lost: "20261102-perdido",
};
const OTHER: ForeignPath = {
  path: `${MAIN}/.worktrees/20261103-otro/src/a.ts`,
  worktree: `${MAIN}/.worktrees/20261103-otro`,
  branch: "specty/20261103-otro",
};

const ctx = (lang: GuardContext["lang"] = "es"): GuardContext => ({
  config: DEFAULT_CONFIG,
  lang,
  command: "specty",
});
const shell = (facts: Partial<ShellFacts>): GuardAction => ({
  kind: "shell",
  facts: {
    specty: [],
    unscopedNpx: false,
    bypass: false,
    committedGoverned: [],
    writes: [],
    deletes: [],
    ...facts,
  },
});

const REASON_ES = `\`${GHOST.path}\` está en \`${FOLDER}\`, que ya no es la carpeta de ningún cambio: git no la tiene como worktree (se quitó al cerrar o cancelar su cambio, o se borró), y escribir allí la volvería a crear sin git.`;
const NEXT_ES = `sal de ella si trabajas allí (en Claude Code, \`ExitWorktree\`) y sigue en \`${MAIN}\`; para otro cambio, \`specty new "<título>"\`.`;

describe("a write or a deletion in a ghost folder", () => {
  it("AC1: is denied with its own rule, from a file tool, a patch or a command", () => {
    const denial = { allow: false, rule: "ghost", reason: REASON_ES, next: NEXT_ES };
    expect(decideGuard({ kind: "write", paths: [], ghosts: [GHOST] }, ctx())).toEqual(denial);
    expect(decideGuard({ kind: "delete", paths: [], ghosts: [GHOST] }, ctx())).toEqual(denial);
    const patch: GuardAction = { kind: "files", writes: [], deletes: [], ghosts: [GHOST] };
    expect(decideGuard(patch, ctx())).toEqual(denial);
    expect(decideGuard(shell({ deletes: [], ghosts: [GHOST] }), ctx())).toEqual(denial);
  });

  it("AC1: goes before another worktree's path and before this folder's rules", () => {
    const both = { kind: "write", paths: ["src/a.ts"], foreign: [OTHER], ghosts: [GHOST] } as const;
    expect(decideGuard(both, ctx())).toMatchObject({ rule: "ghost", reason: REASON_ES });
    const command = shell({ writes: ["src/a.ts"], foreign: [OTHER], ghosts: [GHOST] });
    expect(decideGuard(command, ctx())).toMatchObject({ rule: "ghost" });
  });

  it("AC1: proposes `specty restore` when the folder is an open change's that lost it", () => {
    expect(decideGuard({ kind: "write", paths: [], ghosts: [LOST] }, ctx())).toEqual({
      allow: false,
      rule: "ghost",
      reason: `\`${LOST.path}\` está en \`${LOST.folder}\`, que ya no es una worktree de git: es la carpeta del cambio 20261102-perdido, que sigue abierto en su rama, y escribir allí la volvería a crear sin git.`,
      next: "recupérala con `specty restore 20261102-perdido` y sigue su salida, que dice cómo volver a ella.",
    });
  });

  it("AC1: leaves the decision to the other rules when nothing is in a ghost folder", () => {
    expect(decideGuard({ kind: "write", paths: [], ghosts: [] }, ctx()).allow).toBe(true);
    expect(decideGuard(shell({ ghosts: [] }), ctx()).allow).toBe(true);
    expect(
      decideGuard({ kind: "write", paths: [], foreign: [OTHER], ghosts: [] }, ctx()),
    ).toMatchObject({ rule: "worktree" });
  });
});

describe("the texts of a ghost folder", () => {
  it("AC11: are in Spanish and in English", () => {
    expect(decideGuard({ kind: "write", paths: [], ghosts: [GHOST] }, ctx("en"))).toEqual({
      allow: false,
      rule: "ghost",
      reason: `\`${GHOST.path}\` is in \`${FOLDER}\`, which is no longer any change's folder: git does not have it as a worktree (it was removed when its change was closed or cancelled, or deleted), and writing there would bring it back without git.`,
      next: `leave it if you work there (in Claude Code, \`ExitWorktree\`) and carry on in \`${MAIN}\`; for another change, \`specty new "<title>"\`.`,
    });
    expect(decideGuard({ kind: "write", paths: [], ghosts: [LOST] }, ctx("en"))).toEqual({
      allow: false,
      rule: "ghost",
      reason: `\`${LOST.path}\` is in \`${LOST.folder}\`, which is no longer a git worktree: it is the folder of change 20261102-perdido, still open on its branch, and writing there would bring it back without git.`,
      next: "bring it back with `specty restore 20261102-perdido` and follow its output, which tells how to go back to it.",
    });
  });
});
