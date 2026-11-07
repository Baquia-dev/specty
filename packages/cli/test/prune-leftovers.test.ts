// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, CONFIG, cli, git, inWorktree, NOW, tempRepo, writeFiles } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const COMMON = ".git/common/specty";

/** A process that ran and is gone. */
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

/** A verification going on in process `pid`, as `specty task done` leaves it. */
const run = (pid: number) =>
  JSON.stringify({
    task: "T1",
    command: "pnpm test",
    startedAt: NOW.toISOString(),
    output: ["ok"],
    pid,
  });

/** Sets the modification date of `path` to `minutes` before NOW. */
const age = (path: string, minutes: number) => {
  const at = new Date(NOW.getTime() - minutes * 60_000);
  return utimes(path, at, at);
};

describe("`specty prune` and what dead processes left", () => {
  it("AC1: removes the half-done writes and live runs of dead processes and the git indexes over an hour old, and says how many", async () => {
    const { root, folder } = await inWorktree();
    const dead = deadPid();
    // The git folder of the change's worktree, where its own temporary indexes go.
    const own = resolve(folder, git(folder, "rev-parse", "--git-path", "specty"));
    const removed = [
      `${COMMON}/ports.json.${dead}.tmp`,
      `${COMMON}/locks/${CHANGE}.json.${dead}.tmp`,
      `${COMMON}/runs/20261101-viejo.json`,
      ".git/specty/index-1-viejo",
    ];
    await writeFiles(root, {
      [`${COMMON}/ports.json.${dead}.tmp`]: "{",
      [`${COMMON}/locks/${CHANGE}.json.${dead}.tmp`]: "{",
      [`${COMMON}/runs/20261101-viejo.json`]: run(dead),
      ".git/specty/index-1-viejo": "",
    });
    await writeFiles(own, { "index-2-viejo": "" });
    await age(join(root, ".git/specty/index-1-viejo"), 61);
    await age(join(own, "index-2-viejo"), 600);
    const pruned = await cli(root, ["prune"], CLAUDE);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(
      [
        "RESTOS DE PROCESOS QUE MURIERON:",
        "  Escrituras a medias: 2.",
        "  Verificaciones cortadas: 1.",
        "  Índices temporales de git de más de una hora: 2.",
      ].join("\n"),
    );
    expect(removed.map((path) => existsSync(join(root, path)))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(existsSync(join(own, "index-2-viejo"))).toBe(false);
    const again = await cli(root, ["prune"], CLAUDE);
    expect(again.out).not.toContain("RESTOS DE PROCESOS QUE MURIERON");
  });

  it("AC1: keeps a live process's half-done writes and live run, the git indexes under an hour old and the backups", async () => {
    const root = await tempRepo(APP);
    const dead = deadPid();
    const kept = [
      `${COMMON}/verified/aaa.json.${process.pid}.tmp`,
      `${COMMON}/runs/${CHANGE}.json`,
      `${COMMON}/backups/2026-11-01T10-00-00/repo/notas.txt.${dead}.tmp`,
      ".git/specty/index-3-reciente",
    ];
    await writeFiles(root, {
      [`${COMMON}/verified/aaa.json.${process.pid}.tmp`]: "{",
      [`${COMMON}/runs/${CHANGE}.json`]: run(process.pid),
      // A copy of a file of the person's, which `init` kept as it was.
      [`${COMMON}/backups/2026-11-01T10-00-00/repo/notas.txt.${dead}.tmp`]: "notas",
      ".git/specty/index-3-reciente": "",
    });
    await age(join(root, ".git/specty/index-3-reciente"), 59);
    const pruned = await cli(root, ["prune"], CLAUDE);
    expect(pruned.code).toBe(0);
    expect(pruned.out).not.toContain("RESTOS DE PROCESOS QUE MURIERON");
    expect(pruned.out).toContain("No había nada que limpiar.");
    expect(kept.map((path) => existsSync(join(root, path)))).toEqual([true, true, true, true]);
  });

  it("AC2: with internal.retention.indexHours removes only the git indexes older than those hours, and says them", async () => {
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${CONFIG()}internal:\n  retention:\n    indexHours: 3\n`,
      ".git/specty/index-4-viejo": "",
      ".git/specty/index-5-joven": "",
    });
    await age(join(root, ".git/specty/index-4-viejo"), 181);
    await age(join(root, ".git/specty/index-5-joven"), 179);
    const pruned = await cli(root, ["prune"], CLAUDE);
    expect(pruned.code).toBe(0);
    expect(pruned.out).toContain(
      "RESTOS DE PROCESOS QUE MURIERON:\n  Índices temporales de git de más de 3 horas: 1.",
    );
    expect(existsSync(join(root, ".git/specty/index-4-viejo"))).toBe(false);
    expect(existsSync(join(root, ".git/specty/index-5-joven"))).toBe(true);
  });
});
