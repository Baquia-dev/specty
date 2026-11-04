// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { runCli } from "../src/program";
import {
  CHANGE,
  DIST,
  git,
  inWorktree,
  NOW,
  person,
  read,
  testEnv,
  toClosing,
  writeFiles,
} from "./support";

const BRANCH = `specty/${CHANGE}`;
const LOCKS = ".git/common/specty/locks";
const LOCK = `${LOCKS}/full-verification.json`;
const WAITING = "otra sesión está haciendo una verificación completa";

/** Main moves on in `root` with `file`, which the change does not touch, as another session lands. */
function lands(root: string, file: string): void {
  writeFileSync(join(root, file), "export const other = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", `otro trabajo en main: ${file}`);
}

/** Another session's live process, holding the full verification's turn until it is killed. */
function otherSessionVerifies(root: string) {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
  const holder = {
    pid: child.pid ?? 0,
    command: "pnpm check",
    folder: "/otra/carpeta",
    at: "2026-11-04T06:00:00.000Z",
  };
  mkdirSync(join(root, LOCKS), { recursive: true });
  writeFileSync(join(root, LOCK), JSON.stringify(holder));
  return child;
}

/** `specty close` confirmed by the person in `folder`, calling `onErr` with each error line. */
async function close(folder: string, onErr: (text: string) => void = () => undefined) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(["close"], {
    cwd: folder,
    env: testEnv(),
    now: () => NOW,
    terminal: person(),
    io: {
      out: (text) => out.push(text),
      err: (text) => {
        err.push(text);
        onErr(text);
      },
    },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
    stdin: async () => "",
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("closing takes the full verification's turn before incorporating main", () => {
  it("AC1: waits for the turn first, so it also incorporates what another session landed meanwhile", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    lands(root, "src/first.ts");
    const other = otherSessionVerifies(root);
    let landed = false;
    try {
      const closed = await close(folder, (text) => {
        if (landed || !text.includes(WAITING)) return;
        // While this closing waits, the other session lands its change and frees the turn.
        landed = true;
        lands(root, "src/second.ts");
        other.kill();
      });
      expect(landed).toBe(true);
      expect(closed.code).toBe(0);
      expect(closed.out).toContain("Incorporado a main.");
      expect(closed.out).not.toContain("main no avanzó");
      expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
      expect(await read(root, "src/first.ts")).toBe("export const other = 1;\n");
      expect(await read(root, "src/second.ts")).toBe("export const other = 1;\n");
      expect(await read(root, "src/app.ts")).toBe("2\n");
    } finally {
      other.kill();
    }
  });

  it("AC2: frees the turn when the closing ends, with main advanced or the incorporation refused", async () => {
    const refusedRepo = await inWorktree();
    await toClosing(refusedRepo.folder);
    await writeFiles(refusedRepo.root, { "src/app.ts": "a medias\n" });
    const refused = await close(refusedRepo.folder);
    expect(refused.code).toBe(2);
    expect(refused.out).toContain("que tiene cambios sin commit");
    expect(await exists(join(refusedRepo.root, LOCK))).toBe(false);

    const { root, folder } = await inWorktree();
    await toClosing(folder);
    lands(root, "src/first.ts");
    const closed = await close(folder);
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.err).not.toContain(WAITING);
    expect(await exists(join(root, LOCK))).toBe(false);
  });
});
