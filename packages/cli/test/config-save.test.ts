// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_CONFIG, resolveConfig } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { checkConfig, configBlocked, saveConfig } from "../src/flow/config-save";
import { createGit } from "../src/io/git";
import { lockFullVerification } from "../src/store/lock";
import { sessionAt } from "./server/support";
import { AGENT, CHANGE, cli, git, NOW, read, tempRepo, writeFiles } from "./support";

const CONFIG_PATH = ".specty/config.yaml";

/** A configuration with comments and quotes, as the person writes it. */
const CONFIG_TEXT = `# Configuración de prueba
version: 1
language: es
git:
  worktrees: false
verify:
  default: "true"  # rápida
  timeoutSec: 600
split:
  maxModules: 3
`;

/** A repository with that configuration committed, no change open, and its session. */
async function repository() {
  const root = await tempRepo({ [CONFIG_PATH]: CONFIG_TEXT });
  return { root, session: await sessionAt(root, AGENT) };
}

/** What a refused save left: the same file and the same last commit. */
async function untouched(root: string, head: string, text = CONFIG_TEXT) {
  expect(await read(root, CONFIG_PATH)).toBe(text);
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
}

describe("saving the configuration from the UI", () => {
  it("AC2: writes only the changed keys and commits only that file, with its trailer", async () => {
    const { root, session } = await repository();
    const result = await saveConfig(session, [
      { path: ["verify", "timeoutSec"], value: 900 },
      { path: ["git", "target"], value: "develop" },
    ]);
    expect(result).toEqual({
      ok: true,
      commit: expect.stringMatching(/^[0-9a-f]{7}$/),
      changes: [
        { key: "verify.timeoutSec", before: 600, after: 900 },
        { key: "git.target", after: "develop" },
      ],
    });
    expect(await read(root, CONFIG_PATH)).toBe(
      CONFIG_TEXT.replace("  timeoutSec: 600\n", "  timeoutSec: 900\n").replace(
        "  worktrees: false\n",
        "  worktrees: false\n  target: develop\n",
      ),
    );
    expect(git(root, "log", "-1", "--format=%s%n%n%b")).toBe(
      "chore(config): verify.timeoutSec, git.target\n\nSpecty-Config: true",
    );
    expect(git(root, "show", "--name-only", "--format=", "HEAD")).toBe(CONFIG_PATH);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("AC2: passes Specty's own git hooks, which leave its message as it is", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    await writeFiles(root, { [CONFIG_PATH]: CONFIG_TEXT });
    git(root, "commit", "-q", "-am", "chore: configuración de prueba");
    const session = await sessionAt(root, AGENT);
    const result = await saveConfig(session, [{ path: ["verify", "timeoutSec"], value: 900 }]);
    expect(result.ok).toBe(true);
    expect(git(root, "log", "-1", "--format=%s%n%n%b")).toBe(
      "chore(config): verify.timeoutSec\n\nSpecty-Config: true",
    );
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("AC3: refuses a configuration the validator rejects, with its issues, writing nothing", async () => {
    const { root, session } = await repository();
    const head = git(root, "rev-parse", "HEAD");
    const sizes = [{ path: ["size", "M"], value: 20 }];
    const refused = await saveConfig(session, sizes);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refusal.kind).toBe("invalid");
    const issues = refused.refusal.kind === "invalid" ? refused.refusal.issues : [];
    expect(issues.map((issue) => issue.path)).toContain("size");
    await untouched(root, head);
    const checked = await checkConfig(session, [
      { path: ["verify", "timeoutSec"], value: "mucho" },
    ]);
    expect(checked.issues.map((issue) => issue.path)).toContain("verify.timeoutSec");
    expect(checked.changes).toEqual([{ key: "verify.timeoutSec", before: 600, after: "mucho" }]);
    await untouched(root, head);
  });

  it("AC5: does not save while this folder has a change in progress", async () => {
    const { root } = await repository();
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    const session = await sessionAt(root, AGENT);
    const head = git(root, "rev-parse", "HEAD");
    expect(await configBlocked(session)).toEqual({ kind: "change", id: CHANGE });
    expect(await saveConfig(session, [{ path: ["verify", "timeoutSec"], value: 900 }])).toEqual({
      ok: false,
      refusal: { kind: "change", id: CHANGE },
    });
    await untouched(root, head);
  });

  it("AC5: does not save over uncommitted changes of the file, nor a file that is not YAML", async () => {
    const { root, session } = await repository();
    const head = git(root, "rev-parse", "HEAD");
    expect(await configBlocked(session)).toBeUndefined();
    const yours = `${CONFIG_TEXT}# a medias\n`;
    await writeFiles(root, { [CONFIG_PATH]: yours });
    expect(await configBlocked(session)).toEqual({ kind: "uncommitted" });
    expect(await saveConfig(session, [{ path: ["verify", "timeoutSec"], value: 900 }])).toEqual({
      ok: false,
      refusal: { kind: "uncommitted" },
    });
    await untouched(root, head, yours);
    await writeFiles(root, { [CONFIG_PATH]: "version: [1\n" });
    git(root, "commit", "-q", "-am", "chore: rota");
    const broken = git(root, "rev-parse", "HEAD");
    expect(await configBlocked(session)).toEqual({ kind: "yaml" });
    expect(await saveConfig(session, [{ path: ["verify", "timeoutSec"], value: 900 }])).toEqual({
      ok: false,
      refusal: { kind: "yaml" },
    });
    await untouched(root, broken, "version: [1\n");
  });

  it("AC5: does not save while another session holds the landing turn, and says who", async () => {
    const { root, session } = await repository();
    const head = git(root, "rev-parse", "HEAD");
    const holder = {
      pid: process.pid,
      command: "pnpm check",
      folder: "/otra",
      at: NOW.toISOString(),
    };
    const lock = await lockFullVerification(createGit(root), holder);
    expect(lock.kind).toBe("taken");
    try {
      expect(await saveConfig(session, [{ path: ["verify", "timeoutSec"], value: 900 }])).toEqual({
        ok: false,
        refusal: { kind: "turn", command: "pnpm check", folder: "/otra" },
      });
      await untouched(root, head);
    } finally {
      if (lock.kind === "taken") await lock.release();
    }
  });

  it("AC6: a reset takes the key out of the file, and its map when empty, back to the default", async () => {
    const { root, session } = await repository();
    const result = await saveConfig(session, [{ path: ["split", "maxModules"] }]);
    expect(result).toEqual({
      ok: true,
      commit: expect.stringMatching(/^[0-9a-f]{7}$/),
      changes: [{ key: "split", before: { maxModules: 3 } }],
    });
    const text = await read(root, CONFIG_PATH);
    expect(text).toBe(CONFIG_TEXT.replace("split:\n  maxModules: 3\n", ""));
    const resolved = resolveConfig(parse(text));
    expect(resolved.ok && resolved.config.split.maxModules).toBe(DEFAULT_CONFIG.split.maxModules);
    expect(git(root, "log", "-1", "--format=%s")).toBe("chore(config): split");
  });
});
