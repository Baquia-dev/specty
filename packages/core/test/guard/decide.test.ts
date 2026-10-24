// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type BoundSession,
  DEFAULT_CONFIG,
  decideGuard,
  type ForeignPath,
  type GuardAction,
  type GuardChange,
  type GuardContext,
  type ShellFacts,
} from "../../src";

const SPEC = ".specty/changes/20261021-x/spec.md";
const change = (phase: GuardChange["phase"], task?: GuardChange["task"]): GuardChange => ({
  id: "20261021-x",
  kind: "standard",
  phase,
  closingSubmitted: false,
  specPath: SPEC,
  ...(task !== undefined ? { task } : {}),
});
const ctx = (current?: GuardChange): GuardContext => ({
  config: DEFAULT_CONFIG,
  lang: "es",
  command: "specty",
  ...(current !== undefined ? { change: current } : {}),
});
const write = (...paths: string[]): GuardAction => ({ kind: "write", paths });
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
const allowed = (action: GuardAction, context: GuardContext) => decideGuard(action, context).allow;
const IMPLEMENTING = change("implementing", {
  id: "T1",
  files: ["src/a.ts"],
  extras: ["src/extra.ts"],
});

describe("decideGuard on files", () => {
  it("requires a change before governed code", () => {
    expect(allowed(write("src/a.ts"), ctx())).toBe(false);
    expect(allowed(write("README.md", "docs/guide.md"), ctx())).toBe(true);
  });

  it("protects Specty's files and the hook configurations", () => {
    for (const path of [
      ".specty/config.yaml",
      ".specty/changes/20261021-x/state.json",
      ".claude/settings.json",
      ".git/hooks/pre-commit",
    ]) {
      expect(allowed(write(path), ctx(IMPLEMENTING)), path).toBe(false);
    }
  });

  it("lets the agent edit the spec only while the phase allows it", () => {
    expect(allowed(write(SPEC), ctx(change("draft")))).toBe(true);
    expect(allowed(write(SPEC), ctx(change("adjusting")))).toBe(true);
    expect(allowed(write(SPEC), ctx(IMPLEMENTING))).toBe(false);
    expect(allowed({ kind: "delete", paths: [SPEC] }, ctx(change("draft")))).toBe(false);
  });

  it("opens code only within the active task's scope", () => {
    expect(allowed(write("src/a.ts"), ctx(change("review")))).toBe(false);
    expect(allowed(write("src/a.ts"), ctx(change("implementing")))).toBe(false);
    expect(allowed(write("src/a.ts", "src/extra.ts", "src/a.test.ts"), ctx(IMPLEMENTING))).toBe(
      true,
    );
    const denied = decideGuard(write("src/b.ts"), ctx(IMPLEMENTING));
    expect(denied).toMatchObject({ allow: false });
    if (!denied.allow) expect(denied.next).toContain("specty scope add src/b.ts --task T1");
  });

  it("judges each path of an edit that writes and deletes at once, such as a patch", () => {
    const files = (writes: string[], deletes: string[] = []): GuardAction => ({
      kind: "files",
      writes,
      deletes,
    });
    expect(allowed(files(["src/a.ts"], ["src/extra.ts"]), ctx(IMPLEMENTING))).toBe(true);
    expect(decideGuard(files(["src/a.ts"], ["src/b.ts"]), ctx(IMPLEMENTING))).toMatchObject({
      rule: "scope",
    });
    // Writing the spec is allowed in a draft; deleting it never is.
    expect(allowed(files([SPEC]), ctx(change("draft")))).toBe(true);
    expect(allowed(files([], [SPEC]), ctx(change("draft")))).toBe(false);
  });
});

describe("decideGuard on shell commands", () => {
  it("blocks human actions, the unrelated package and hook bypasses", () => {
    expect(allowed(shell({ specty: ["approve"] }), ctx(IMPLEMENTING))).toBe(false);
    expect(allowed(shell({ specty: ["next", "propose"] }), ctx(IMPLEMENTING))).toBe(true);
    expect(allowed(shell({ unscopedNpx: true }), ctx())).toBe(false);
    expect(allowed(shell({ bypass: true }), ctx())).toBe(false);
  });

  it("opens the person's commands to the agent only when the person delegated them", () => {
    const delegated: GuardContext = { ...ctx(IMPLEMENTING), delegated: true };
    for (const name of ["approve", "accept", "close", "cancel", "reject"]) {
      expect(allowed(shell({ specty: [name] }), delegated)).toBe(true);
      const denied = decideGuard(shell({ specty: [name] }), ctx(IMPLEMENTING));
      expect(denied.allow).toBe(false);
      if (!denied.allow) {
        expect(denied.rule).toBe("human");
        expect(denied.reason).toBe(
          `\`specty ${name}\` lo ejecuta el usuario en su terminal, no el agente.`,
        );
        expect(denied.next).toBe("pídele al usuario que lo ejecute y termina tu turno.");
      }
    }
  });

  it("never lets the agent turn delegated mode on or off, nor take Specty out", () => {
    for (const name of ["delegate", "uninstall"]) {
      for (const context of [
        ctx(),
        { ...ctx(IMPLEMENTING), delegated: true },
        { ...ctx(), lang: "en" as const },
      ]) {
        const denied = decideGuard(shell({ specty: ["next", name] }), context);
        expect(denied.allow).toBe(false);
        if (!denied.allow) {
          expect(denied.rule).toBe("human");
          expect(denied.reason).toContain(`\`specty ${name}\``);
        }
      }
    }
  });

  it("keeps the other shell rules in delegated mode", () => {
    const delegated: GuardContext = { ...ctx(IMPLEMENTING), delegated: true };
    expect(allowed(shell({ specty: ["approve"], bypass: true }), delegated)).toBe(false);
    expect(allowed(shell({ specty: ["close"], committedGoverned: ["src/a.ts"] }), delegated)).toBe(
      false,
    );
  });

  it("blocks commits of governed code but not of documentation", () => {
    const denied = decideGuard(shell({ committedGoverned: ["src/a.ts"] }), ctx(IMPLEMENTING));
    expect(denied.allow).toBe(false);
    if (!denied.allow) expect(denied.next).toContain("specty task done T1");
    expect(allowed(shell({ committedGoverned: [] }), ctx())).toBe(true);
  });

  it("applies the file rules to what the command writes", () => {
    expect(allowed(shell({ writes: ["src/b.ts"] }), ctx(IMPLEMENTING))).toBe(false);
    expect(
      allowed(shell({ writes: ["src/a.ts"], deletes: ["src/extra.ts"] }), ctx(IMPLEMENTING)),
    ).toBe(true);
  });

  it("answers in the project's language", () => {
    const english = decideGuard(write("src/a.ts"), { ...ctx(), lang: "en" });
    if (!english.allow) expect(english.reason).toContain("There is no active change");
  });
});

describe("decideGuard during a pending incorporation", () => {
  const integrating = (phase: GuardChange["phase"]): GuardChange => ({
    ...change(phase),
    integration: { target: "main", paths: ["src/a.ts", "src/b.ts"] },
  });
  const RESOLVE =
    "resuelve la incorporación de main en los archivos que junta y ejecuta `specty integrate`.";

  it("opens only the files it brings together, with their tests, in closing and acceptance", () => {
    for (const phase of ["closing", "acceptance"] as const) {
      const context = ctx(integrating(phase));
      expect(allowed(write("src/a.ts", "src/b.ts", "src/a.test.ts"), context)).toBe(true);
      expect(allowed({ kind: "delete", paths: ["src/b.ts"] }, context)).toBe(true);
      expect(allowed(shell({ writes: ["src/a.ts"], deletes: ["src/b.ts"] }), context)).toBe(true);
    }
    expect(decideGuard(write("src/c.ts"), ctx(integrating("closing")))).toEqual({
      allow: false,
      rule: "integration",
      reason:
        "`src/c.ts` queda fuera de la incorporación de main: solo se tocan los archivos que cambiaron este cambio o main.",
      next: RESOLVE,
    });
    // Documentation stays free and Specty's files stay protected.
    expect(allowed(write("docs/guide.md"), ctx(integrating("closing")))).toBe(true);
    expect(
      decideGuard(write(".specty/changes/20261021-x/state.json"), ctx(integrating("closing"))),
    ).toMatchObject({ rule: "protected" });
  });

  it("points a commit to the active task, or to `specty next` without one", () => {
    const commit = shell({ committedGoverned: ["src/a.ts"] });
    expect(decideGuard(commit, ctx(IMPLEMENTING))).toMatchObject({
      rule: "commit",
      next: 'ejecuta `specty task done T1 --summary "<qué hiciste>"`.',
    });
    expect(decideGuard(commit, ctx())).toMatchObject({
      rule: "commit",
      next: "ejecuta `specty next`: te dice cómo seguir con ese código.",
    });
  });

  it("points a commit to `specty integrate`, in the project's language", () => {
    const commit = shell({ committedGoverned: ["src/a.ts"] });
    expect(decideGuard(commit, ctx(integrating("closing")))).toMatchObject({
      rule: "commit",
      next: RESOLVE,
    });
    const english = decideGuard(write("src/c.ts"), { ...ctx(integrating("closing")), lang: "en" });
    expect(english).toMatchObject({
      reason:
        "`src/c.ts` is outside the incorporation of main: only the files this change or main changed may be touched.",
      next: "resolve the incorporation of main in the files it brings together and run `specty integrate`.",
    });
  });
});

describe("decideGuard when a session enters a worktree", () => {
  const enter = (target: string, bound?: BoundSession): GuardAction => ({
    kind: "enter",
    target,
    ...(bound !== undefined ? { bound } : {}),
  });

  it("lets a free session in, and a session back into its own folder", () => {
    expect(allowed(enter("/w/b"), ctx())).toBe(true);
    // Bound to a folder whose change is finished: free again.
    expect(allowed(enter("/w/b", { folder: "/w/a" }), ctx())).toBe(true);
    expect(allowed(enter("/w/a", { folder: "/w/a", change: "20261021-x" }), ctx())).toBe(true);
  });

  it("keeps a session out of another worktree while its change is open", () => {
    expect(decideGuard(enter("/w/b", { folder: "/w/a", change: "20261021-x" }), ctx())).toEqual({
      allow: false,
      rule: "session",
      reason:
        "Esta sesión trabaja en `/w/a` (cambio 20261021-x, aún abierto): una sesión trabaja un solo cambio a la vez.",
      next: "termina ese cambio (`specty next` allí), o abre otra sesión en `/w/b` para trabajar en ese.",
    });
    const english = decideGuard(enter("/w/b", { folder: "/w/a", change: "20261021-x" }), {
      ...ctx(),
      lang: "en",
    });
    expect(english).toMatchObject({ next: expect.stringContaining("open another session in") });
  });
});

describe("decideGuard on another worktree", () => {
  const OTHER: ForeignPath = {
    path: "/w/otra/src/a.ts",
    worktree: "/w/otra",
    branch: "specty/otra",
  };

  it("denies changing its files in every phase, with or without a change here", () => {
    for (const context of [ctx(), ctx(change("draft")), ctx(IMPLEMENTING)]) {
      expect(allowed({ kind: "write", paths: [], foreign: [OTHER] }, context)).toBe(false);
      expect(allowed({ kind: "delete", paths: ["src/a.ts"], foreign: [OTHER] }, context)).toBe(
        false,
      );
      expect(allowed(shell({ writes: ["src/a.ts"], foreign: [OTHER] }), context)).toBe(false);
    }
    expect(decideGuard({ kind: "write", paths: [], foreign: [OTHER] }, ctx())).toEqual({
      allow: false,
      rule: "worktree",
      reason:
        "`/w/otra/src/a.ts` está en otra worktree (`/w/otra`, rama specty/otra): es de otro cambio.",
      next: "trabaja solo con los archivos de esta carpeta; ese cambio se edita desde una sesión abierta en `/w/otra`.",
    });
  });

  it("names only the folder of a detached worktree, in the project's language", () => {
    const detached = { path: "/w/x/a.ts", worktree: "/w/x" };
    expect(
      decideGuard({ kind: "write", paths: [], foreign: [detached] }, { ...ctx(), lang: "en" }),
    ).toMatchObject({
      allow: false,
      reason: "`/w/x/a.ts` is in another worktree (`/w/x`): it belongs to another change.",
    });
  });

  it("leaves the decision to this folder's rules when nothing is foreign", () => {
    expect(allowed({ kind: "write", paths: ["src/a.ts"], foreign: [] }, ctx(IMPLEMENTING))).toBe(
      true,
    );
    expect(allowed(shell({ writes: ["src/a.ts"], foreign: [] }), ctx(IMPLEMENTING))).toBe(true);
  });
});
