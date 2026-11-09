// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from "node:events";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type Host, launchOf, stopTree } from "../src/launch";
import { readStatus } from "../src/specty";
import { writeSpecty } from "./fake-specty";

const NPM = "C:\\Users\\Jorge Palacio\\AppData\\Roaming\\npm";
const NODE = "C:\\Program Files\\nodejs";
const CMD = "C:\\WINDOWS\\system32\\cmd.exe";

/** Windows' variables, as it writes them: `Path`, with a quoted folder and a relative one. */
const WINDOWS_ENV: NodeJS.ProcessEnv = {
  Path: `${NPM};"${NODE}";tools;C:\\WINDOWS\\system32`,
  PATHEXT: ".COM;.EXE;.BAT;.CMD",
  ComSpec: CMD,
  SystemRoot: "C:\\WINDOWS",
};

/** A Windows machine with these files, which, like Windows, does not tell capitals apart. */
function windows(files: readonly string[], env: NodeJS.ProcessEnv = WINDOWS_ENV): Host {
  const present = new Set(files.map((file) => file.toLowerCase()));
  return { platform: "win32", env, isFile: (path) => present.has(path.toLowerCase()) };
}

const MAC: Host = { platform: "darwin", env: {}, isFile: () => false };

/** cmd.exe's arguments to run `line`: `/s` takes away only the outer quotes. */
const viaCmd = (line: string) => ["/d", "/s", "/c", `"${line}"`];

describe("launching specty on Windows", () => {
  it("AC1: runs npm's `specty.cmd` from the PATH through cmd.exe, its path quoted", () => {
    // npm also leaves a `specty` for sh and a `specty.ps1` next to it.
    const host = windows([`${NPM}\\specty`, `${NPM}\\specty.cmd`, `${NPM}\\specty.ps1`]);
    expect(launchOf("specty", ["--json", "status"], host)).toEqual({
      file: CMD,
      args: viaCmd(`"${NPM}\\specty.CMD" --json status`),
      verbatim: true,
    });
  });

  it("AC1: finds the `.cmd` of a path without extension, and runs an `.exe` as it is", () => {
    const bin = "C:\\Herramientas\\specty bin";
    const path = windows([`${bin}\\specty`, `${bin}\\specty.cmd`]);
    expect(launchOf(`${bin}\\specty`, ["ui"], path)).toEqual({
      file: CMD,
      args: viaCmd(`"${bin}\\specty.CMD" ui`),
      verbatim: true,
    });
    const named = windows([`${NPM}\\specty.cmd`]);
    expect(launchOf(`${NPM}\\specty.cmd`, ["ui"], named)).toEqual({
      file: CMD,
      args: viaCmd(`"${NPM}\\specty.cmd" ui`),
      verbatim: true,
    });
    const exe = windows([`${NODE}\\specty.exe`]);
    expect(launchOf("specty", ["ui"], exe)).toEqual({
      file: `${NODE}\\specty.EXE`,
      args: ["ui"],
      verbatim: false,
    });
  });

  it("AC1: looks for a name only in the PATH's absolute folders, never in the repository's", () => {
    const host = windows(["tools\\specty.cmd", "specty.cmd", ".\\specty.exe"]);
    expect(launchOf("specty", ["ui"], host)).toBeUndefined();
  });

  it("AC1: without PATHEXT or ComSpec, uses Windows' own, whatever the capitals of its variables", () => {
    const host = windows([`${NPM}\\specty.cmd`], { PATH: NPM, SYSTEMROOT: "C:\\Windows" });
    expect(launchOf("specty", ["ui"], host)).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: viaCmd(`"${NPM}\\specty.CMD" ui`),
      verbatim: true,
    });
  });

  it("AC2: runs a `.mjs`, `.cjs` or `.js` with the `node` of the PATH", () => {
    for (const script of [
      "C:\\src\\specty\\dist\\specty.mjs",
      "C:\\a\\specty.cjs",
      "C:\\a\\specty.js",
    ]) {
      const host = windows([script, `${NODE}\\node.exe`]);
      expect(launchOf(script, ["--json", "status"], host)).toEqual({
        file: `${NODE}\\node.EXE`,
        args: [script, "--json", "status"],
        verbatim: false,
      });
    }
  });

  it("AC3: without the command, or without `node` for a `.mjs`, there is nothing to run", () => {
    expect(launchOf("specty", ["ui"], windows([]))).toBeUndefined();
    expect(launchOf(`${NPM}\\missing`, ["ui"], windows([`${NPM}\\specty.cmd`]))).toBeUndefined();
    const script = "C:\\src\\specty\\dist\\specty.mjs";
    expect(launchOf(script, ["ui"], windows([script]))).toBeUndefined();
  });

  it("runs the command as it is outside Windows", () => {
    expect(launchOf("specty", ["--json", "status"], MAC)).toEqual({
      file: "specty",
      args: ["--json", "status"],
      verbatim: false,
    });
  });

  it.runIf(process.platform === "win32")(
    "AC1: reads the status through a real `specty.cmd` in a folder with spaces",
    async () => {
      const bin = await mkdtemp(join(tmpdir(), "specty bin "));
      const script = `process.stdout.write(JSON.stringify({ changes: [], delegated: true }));\n`;
      const command = await writeSpecty(bin, script);
      const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-repo-")));
      expect(await readStatus(command, folder)).toEqual({
        kind: "status",
        status: { changes: [], delegated: true },
      });
    },
  );
});

describe("stopping specty ui", () => {
  /** A started `specty ui`, and the `taskkill` that stopping it would start. */
  function started() {
    const child = { pid: 4242, kill: vi.fn((_signal?: NodeJS.Signals | number) => true) };
    const taskkill = new EventEmitter();
    const run = vi.fn((_file: string, _args: readonly string[]) => taskkill);
    return { child, taskkill, run };
  }

  it("AC4: on Windows, ends its whole tree with taskkill, and the process if taskkill does not start", () => {
    const { child, taskkill, run } = started();
    stopTree(child, windows([]), run);
    expect(run).toHaveBeenCalledWith("C:\\WINDOWS\\System32\\taskkill.exe", [
      "/pid",
      "4242",
      "/T",
      "/F",
    ]);
    expect(child.kill).not.toHaveBeenCalled();
    taskkill.emit("error", new Error("spawn ENOENT"));
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("AC4: outside Windows, stops it with SIGTERM", () => {
    const { child, run } = started();
    stopTree(child, MAC, run);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(run).not.toHaveBeenCalled();
  });
});
