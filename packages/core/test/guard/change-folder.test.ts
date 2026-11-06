// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  decideGuard,
  type GuardAction,
  type GuardContext,
  type OpenFolder,
  type ShellFacts,
} from "../../src";

const ID = "20261106-abierto";
const OPEN: OpenFolder = { folder: `/p/app/.worktrees/${ID}`, id: ID };

const ctx = (extra: Partial<GuardContext> = {}): GuardContext => ({
  config: DEFAULT_CONFIG,
  lang: "es",
  command: "specty",
  ...extra,
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

const DENIAL_ES = {
  allow: false,
  rule: "change-folder",
  reason: `\`${OPEN.folder}\` es la carpeta del cambio ${ID}, que sigue abierto: se queda mientras no se cierre ni se cancele, y quitarla con \`--force\` perdería lo que tiene sin commit.`,
  next: `no la quites. Si ese cambio ya no sigue, \`specty cancel ${ID}\` guarda en su rama lo que tiene sin commit y quita la carpeta; al terminarlo, \`specty close\` la quita.`,
};

describe("removing the folder of an open change", () => {
  it("AC1: is denied with its own rule, from a command or from a tool, also in delegated mode", () => {
    expect(decideGuard(shell({ removedFolders: [OPEN] }), ctx())).toEqual(DENIAL_ES);
    expect(decideGuard({ kind: "remove-worktree", folders: [OPEN] }, ctx())).toEqual(DENIAL_ES);
    const delegated = ctx({ delegated: true });
    expect(decideGuard(shell({ removedFolders: [OPEN] }), delegated)).toEqual(DENIAL_ES);
  });

  it("AC1: goes before every rule of the shell but the person's commands", () => {
    const elsewhere = { folder: "/p/app/.worktrees/otro", command: "git worktree remove x" };
    const outside = shell({ removedFolders: [OPEN], elsewhere });
    expect(decideGuard(outside, ctx())).toMatchObject({ rule: "change-folder" });
    const bypass = shell({ removedFolders: [OPEN], bypass: true });
    expect(decideGuard(bypass, ctx())).toMatchObject({ rule: "change-folder" });
    const human = shell({ removedFolders: [OPEN], specty: ["approve"] });
    expect(decideGuard(human, ctx())).toMatchObject({ rule: "human" });
  });

  it("AC1: leaves the decision to the other rules when no open change's folder goes", () => {
    expect(decideGuard(shell({ removedFolders: [] }), ctx()).allow).toBe(true);
    expect(decideGuard({ kind: "remove-worktree", folders: [] }, ctx()).allow).toBe(true);
  });

  it("AC4: says it in English too", () => {
    const english = ctx({ lang: "en" });
    expect(decideGuard({ kind: "remove-worktree", folders: [OPEN] }, english)).toEqual({
      allow: false,
      rule: "change-folder",
      reason: `\`${OPEN.folder}\` is the folder of change ${ID}, still open: it stays until the change is closed or cancelled, and removing it with \`--force\` would lose what it has uncommitted.`,
      next: `do not remove it. If that change is not going on, \`specty cancel ${ID}\` saves on its branch what it has uncommitted and removes the folder; once it is done, \`specty close\` removes it.`,
    });
  });
});
