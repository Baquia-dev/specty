// SPDX-License-Identifier: Apache-2.0
import {
  type CardContext,
  mergedConfigInvalidLine,
  mergedConfigNext,
} from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import {
  CONFIG,
  cli,
  git,
  inWorktree,
  person,
  read,
  stateIn,
  toAcceptance,
  toClosing,
  tryGit,
  writeFiles,
} from "./support";

const EN: CardContext = { lang: "en", command: "specty", quickMaxFiles: 3, implicitTests: true };
/** The configuration with the stray comma that reached main (P130). */
const BROKEN = CONFIG().replace(
  "  worktrees: false\n",
  '  worktrees: false\n  branchPerChange: "true,"\n',
);
const INVALID = "Con main incorporado, .specty/config.yaml no es válida: git.branchPerChange";

/** Main commits a configuration that is not valid, which the change has not merged yet. */
async function mainBreaksTheConfig(root: string): Promise<void> {
  await writeFiles(root, { ".specty/config.yaml": BROKEN });
  git(root, "commit", "-q", "-am", "main rompe la configuración");
}

/** The change's folder is as it was: no merge under way, the same commit and configuration. */
async function untouched(folder: string, head: string, phase: string): Promise<void> {
  expect(tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status).not.toBe(0);
  expect(git(folder, "rev-parse", "HEAD")).toBe(head);
  expect(await read(folder, ".specty/config.yaml")).toBe(CONFIG());
  const state = await stateIn(folder);
  expect(state).toHaveProperty("phase", phase);
  expect(state).not.toHaveProperty("integration");
  expect((await cli(folder, ["next"])).code).toBe(0);
}

describe("bringing main in when its configuration is not valid", () => {
  it("AC1: accept undoes the merge, keeps the change in acceptance and asks to fix it in main", async () => {
    const { root, folder } = await inWorktree();
    await toAcceptance(folder);
    const head = git(folder, "rev-parse", "HEAD");
    await mainBreaksTheConfig(root);

    const accepted = await cli(folder, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(2);
    expect(accepted.out).toContain("No se aceptó y nada cambió.");
    expect(accepted.out).toContain(INVALID);
    expect(accepted.out).toContain(
      "SIGUIENTE: corrige .specty/config.yaml en main y vuelve a ejecutar `specty accept`.",
    );
    await untouched(folder, head, "acceptance");
  });

  it("AC2: close undoes the merge, keeps the change in closing and asks to fix it in main", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    const head = git(folder, "rev-parse", "HEAD");
    await mainBreaksTheConfig(root);

    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(2);
    expect(closed.out).toContain("No se cerró y nada cambió.");
    expect(closed.out).toContain(INVALID);
    expect(closed.out).toContain(
      "SIGUIENTE: corrige .specty/config.yaml en main y vuelve a ejecutar `specty close`.",
    );
    await untouched(folder, head, "closing");
  });

  it("AC4: says it in Spanish and in English, also to the agent in delegated mode", () => {
    expect(mergedConfigInvalidLine("main", "mode: x", "en")).toBe(
      "With main merged in, .specty/config.yaml is not valid: mode: x.",
    );
    expect(mergedConfigInvalidLine("main", "mode: x", "es")).toBe(
      "Con main incorporado, .specty/config.yaml no es válida: mode: x.",
    );
    expect(mergedConfigNext("main", "close", EN)).toBe(
      "fix .specty/config.yaml in main and run `specty close` again.",
    );
    expect(mergedConfigNext("main", "accept", { ...EN, delegated: true })).toBe(
      "delegated mode: the user fixes .specty/config.yaml in main (the guard does not let you edit it): ask them, with the error above, and once they do, run `specty accept` again yourself.",
    );
    expect(mergedConfigNext("main", "accept", { ...EN, lang: "es", delegated: true })).toBe(
      "modo delegado: el usuario corrige .specty/config.yaml en main (el guard no te deja editarla): pídeselo con el error de arriba y, cuando lo haga, vuelve a ejecutar tú `specty accept`.",
    );
  });
});
