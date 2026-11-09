// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { usageDoctor } from "../src/install/usage";
import { execute, launch } from "../src/io/exec";
import { findProgram, type System, startOf } from "../src/io/programs";

const WINDOWS = process.platform === "win32";

/** A Windows with these files, in any case, and no other. */
function windows(...files: string[]): System {
  const known = new Set(files.map((file) => file.toLowerCase()));
  return { platform: "win32", runnable: (path) => known.has(path.toLowerCase()) };
}

/** A Windows environment: a relative folder in the PATH, and extensions Specty cannot start. */
const ENV = {
  PATH: "C:\\tools;relative\\bin;C:\\Program Files\\Git\\cmd",
  PATHEXT: ".COM;.EXE;.BAT;.CMD;.VBS;.JS",
  ComSpec: "C:\\Windows\\system32\\cmd.exe",
};

/** Arguments that cmd.exe would take apart, or run, if they reached it as they are. */
const HARD = [
  "plain",
  "two words",
  'say "hi"',
  "C:\\dir\\",
  'back\\\\"q',
  "a&b|c<d>e",
  "^caret^",
  "%PATH%",
  "!x!",
  "(paren)",
  "semi;colon,comma",
  "",
  "*?",
  "tab\there",
  'x"&calc&"y',
  "--output=C:\\a b\\r.json",
];

/** cmd.exe's metacharacters that, outside quotes, would start or redirect a command. */
const RUNS = new Set(["&", "|", "<", ">", "(", ")"]);

/**
 * What cmd.exe passes on from `text`: each `^x` as `x`, quotes toggling; a metacharacter of its
 * own outside quotes would run a command, so it throws.
 */
function unescaped(text: string): string {
  let out = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (char === "^" && !quoted) {
      out += text.charAt(index + 1);
      index++;
      continue;
    }
    if (char === '"') quoted = !quoted;
    else if (!quoted && RUNS.has(char)) throw new Error(`cmd.exe would run ${char} in ${text}`);
    out += char;
  }
  return out;
}

/** The command of a cmd.exe line, up to its first space that no `^` escapes, and the rest. */
function split(line: string): { readonly command: string; readonly rest: string } {
  for (let index = 0; index < line.length; index++) {
    if (line.charAt(index) === "^") index++;
    else if (line.charAt(index) === " ") {
      return { command: line.slice(0, index), rest: line.slice(index + 1) };
    }
  }
  return { command: line, rest: "" };
}

/** A command line's arguments, as a program built with Microsoft's C runtime (Node) reads them. */
function argv(text: string): string[] {
  const args: string[] = [];
  let current = "";
  let quoted = false;
  let started = false;
  let slashes = 0;
  for (const char of text) {
    if (char === "\\") {
      slashes++;
      continue;
    }
    if (char === '"') {
      current += "\\".repeat(Math.floor(slashes / 2));
      if (slashes % 2 === 1) current += '"';
      else quoted = !quoted;
      slashes = 0;
      started = true;
      continue;
    }
    current += "\\".repeat(slashes);
    slashes = 0;
    if (!quoted && (char === " " || char === "\t")) {
      if (started) args.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  current += "\\".repeat(slashes);
  if (started || slashes > 0) args.push(current);
  return args;
}

/**
 * What a batch file started by `cmd.exe /d /s /c "<line>"` runs, and with what: cmd.exe reads the
 * line once, and the batch's `%*` reads its arguments again before handing them to the program.
 */
function batchOf(args: readonly string[]): { readonly file: string; readonly args: string[] } {
  const [d, s, c, quoted] = args;
  expect([d, s, c]).toEqual(["/d", "/s", "/c"]);
  expect(args).toHaveLength(4);
  expect(quoted?.startsWith('"') && quoted.endsWith('"')).toBe(true);
  const { command, rest } = split((quoted ?? "").slice(1, -1));
  return { file: unescaped(command), args: argv(unescaped(unescaped(rest))) };
}

describe("a program Specty starts without the shell, in a simulated Windows", () => {
  it("AC1: is looked for in the PATH's absolute folders with PATHEXT's extensions, in order", () => {
    expect(findProgram("ccusage", ENV, windows("C:\\tools\\ccusage.cmd"))).toBe(
      "C:\\tools\\ccusage.cmd",
    );
    // Folder by folder, as cmd.exe: an earlier folder wins over a better extension.
    expect(
      findProgram(
        "git",
        ENV,
        windows("C:\\tools\\git.cmd", "C:\\Program Files\\Git\\cmd\\git.exe"),
      ),
    ).toBe("C:\\tools\\git.cmd");
    // In a folder, in PATHEXT's order.
    expect(findProgram("x", ENV, windows("C:\\tools\\x.cmd", "C:\\tools\\x.exe"))).toBe(
      "C:\\tools\\x.exe",
    );
    // A name with one of those extensions, as it is.
    expect(findProgram("git.exe", ENV, windows("C:\\Program Files\\Git\\cmd\\git.exe"))).toBe(
      "C:\\Program Files\\Git\\cmd\\git.exe",
    );
    // A path without extension: the shim, never the script beside it, which Windows cannot run.
    const bin = "C:\\repo\\node_modules\\.bin";
    expect(
      findProgram(`${bin}\\eslint`, ENV, windows(`${bin}\\eslint`, `${bin}\\eslint.cmd`)),
    ).toBe(`${bin}\\eslint.cmd`);
  });

  it("AC1: never looks in the current folder or a relative one, nor takes what it cannot start", () => {
    const planted = windows("opengrep.exe", ".\\opengrep.exe", "relative\\bin\\opengrep.exe");
    expect(findProgram("opengrep", ENV, planted)).toBeUndefined();
    const scripts = windows("C:\\tools\\script.js", "C:\\tools\\script.vbs", "C:\\tools\\script");
    expect(findProgram("script", ENV, scripts)).toBeUndefined();
  });

  it("AC1: reads PATH, PATHEXT and ComSpec as Node does on Windows, whatever their case", () => {
    const both = windows("C:\\tools\\ccusage.cmd", "C:\\other\\ccusage.exe");
    // With `Path` and `PATH`, the first in sort order, as Node's spawn keeps.
    expect(findProgram("ccusage", { Path: "C:\\other", PATH: "C:\\tools" }, both)).toBe(
      "C:\\tools\\ccusage.cmd",
    );
    expect(findProgram("ccusage", { Path: "C:\\other" }, both)).toBe("C:\\other\\ccusage.exe");
    // Without PATHEXT, Windows' own: .COM, .EXE, .BAT and .CMD.
    expect(findProgram("x", { PATH: "C:\\tools" }, windows("C:\\tools\\x.bat"))).toBe(
      "C:\\tools\\x.bat",
    );
    expect(findProgram("x", { PATH: "C:\\tools" }, windows("C:\\tools\\x.js"))).toBeUndefined();
    const only = { PATH: "C:\\tools", pathext: ".CMD" };
    expect(findProgram("x", only, windows("C:\\tools\\x.exe", "C:\\tools\\x.cmd"))).toBe(
      "C:\\tools\\x.cmd",
    );
    const shim = windows("C:\\tools\\ccusage.cmd");
    expect(startOf("ccusage", [], { PATH: "C:\\tools", COMSPEC: "D:\\cmd.exe" }, shim).file).toBe(
      "D:\\cmd.exe",
    );
    expect(startOf("ccusage", [], { PATH: "C:\\tools" }, shim).file).toBe("cmd.exe");
  });

  it("AC1: starts as it is what it does not find, and any program outside Windows", async () => {
    expect(startOf("ccusage", ["--json"], ENV, windows())).toEqual({
      file: "ccusage",
      args: ["--json"],
      verbatim: false,
    });
    const linux: System = { platform: "linux", runnable: () => true };
    expect(startOf("ccusage", ["--json"], ENV, linux)).toEqual({
      file: "ccusage",
      args: ["--json"],
      verbatim: false,
    });
    // And it fails as before: 127, Specty's «not installed».
    const missing = await execute("specty-no-existe-en-el-path", [], { cwd: tmpdir() });
    expect(missing.code).toBe(127);
  });

  it("AC2: starts an .exe or a .com directly, with its arguments as they are", () => {
    const git = "C:\\Program Files\\Git\\cmd\\git.exe";
    expect(startOf("git", ["status", "a&b"], ENV, windows(git))).toEqual({
      file: git,
      args: ["status", "a&b"],
      verbatim: false,
    });
    expect(startOf("tool", ["x"], ENV, windows("C:\\tools\\tool.com")).file).toBe(
      "C:\\tools\\tool.com",
    );
  });

  it("AC2: starts a .cmd or a .bat through cmd.exe, and no argument runs or changes on the way", () => {
    for (const tool of [
      "C:\\Users\\Ana María (dev)\\AppData\\Roaming\\npm\\ccusage.cmd",
      "C:\\tools & more\\100% ^ok!\\ccusage.bat",
    ]) {
      const env = { ...ENV, PATH: win32.dirname(tool) };
      const start = startOf("ccusage", HARD, env, windows(tool));
      expect(start.file).toBe("C:\\Windows\\system32\\cmd.exe");
      expect(start.verbatim).toBe(true);
      expect(batchOf(start.args)).toEqual({ file: tool, args: HARD });
    }
  });

  it("AC2: launch hands execute the start of a .cmd, with its arguments verbatim", () => {
    const shim = windows("C:\\tools\\ccusage.cmd");
    const how = launch("ccusage", ["session", "--json"], false, ENV, undefined, shim);
    expect(how).toMatchObject({
      file: "C:\\Windows\\system32\\cmd.exe",
      shell: false,
      verbatim: true,
    });
    expect(batchOf(how.args)).toEqual({
      file: "C:\\tools\\ccusage.cmd",
      args: ["session", "--json"],
    });
    // A shell line stays a shell line: Node gives it to cmd.exe.
    expect(launch("pnpm test", [], true, ENV, undefined, shim)).toMatchObject({
      file: "pnpm test",
      shell: true,
      verbatim: false,
    });
  });
});

describe("a tool installed as npm installs it, on this system", () => {
  it("AC2: gets each argument as it is, from a folder with spaces and metacharacters", async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), "specty-programs-")));
    const bin = join(base, "tools & (more) ^ok!");
    await mkdir(bin);
    const script = "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n";
    if (WINDOWS) {
      // npm's shim: Node with the package's script and `%*`.
      await writeFile(join(bin, "echo-args.js"), script);
      await writeFile(
        join(bin, "echo-args.cmd"),
        `@"${process.execPath}" "%~dp0echo-args.js" %*\r\n`,
      );
    } else {
      await writeFile(join(bin, "echo-args"), `#!/usr/bin/env node\n${script}`, { mode: 0o755 });
    }
    const env = { ...process.env, PATH: `${bin}${delimiter}${dirname(process.execPath)}` };
    const result = await execute("echo-args", HARD, { cwd: base, env });
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(HARD);
  });
});

describe("doctor's search of ccusage and specty", () => {
  it("AC3: finds ccusage on a PATH without sh, as npm installs it", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "specty-doctor-")));
    const bin = join(root, "bin");
    await mkdir(bin);
    if (WINDOWS) await writeFile(join(bin, "ccusage.cmd"), "@echo 1\r\n");
    else await writeFile(join(bin, "ccusage"), "#!/bin/sh\n", { mode: 0o755 });
    expect(await usageDoctor(root, { PATH: bin }, "20.0.45")).toEqual([]);
    expect(findProgram("ccusage", { PATH: bin })).toBe(
      join(bin, WINDOWS ? "ccusage.cmd" : "ccusage"),
    );
  });

  it("AC3: finds specty as npm installs it on Windows", () => {
    const npm = "C:\\Users\\Ana\\AppData\\Roaming\\npm";
    const installed = windows(`${npm}\\specty`, `${npm}\\specty.cmd`, `${npm}\\specty.ps1`);
    expect(findProgram("specty", { Path: npm }, installed)).toBe(`${npm}\\specty.cmd`);
  });

  it.skipIf(WINDOWS)(
    "AC3: outside Windows, only an executable file counts, as with command -v",
    async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), "specty-doctor-")));
      const bin = join(root, "bin");
      await mkdir(join(bin, "specty"), { recursive: true });
      await writeFile(join(bin, "ccusage"), "#!/bin/sh\n", { mode: 0o644 });
      const env = { PATH: bin };
      expect(findProgram("ccusage", env)).toBeUndefined();
      expect(findProgram("specty", env)).toBeUndefined();
      expect(await usageDoctor(root, env, "20.0.45")).toMatchObject([{ code: "no-ccusage" }]);
      await chmod(join(bin, "ccusage"), 0o755);
      expect(findProgram("ccusage", env)).toBe(join(bin, "ccusage"));
    },
  );
});
