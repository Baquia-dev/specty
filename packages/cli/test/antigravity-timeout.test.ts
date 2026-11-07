// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, read, tempRepo, writeFiles } from "./support";

const HOOKS = ".agents/hooks.json";
const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const INIT = ["init", "--language", "es", "--tools", "antigravity"];

/** The repository's configuration, with the time of Antigravity's hooks when `seconds` is given. */
const config = (seconds?: number) =>
  seconds === undefined
    ? CONFIG()
    : `${CONFIG()}internal:\n  hooks:\n    antigravityTimeoutSec: ${seconds}\n`;

/** A repository with that configuration, and `.agents/hooks.json` as `init` writes it. */
async function installed(seconds?: number): Promise<string> {
  const root = await tempRepo({ ...PACKAGE, ".specty/config.yaml": config(seconds) });
  expect((await cli(root, INIT)).code).toBe(0);
  return root;
}

const hooks = async (root: string) => JSON.parse(await read(root, HOOKS));

const handler = (event: string, timeout: number) => ({
  type: "command",
  command: expect.stringContaining(`guard --tool antigravity --event ${event}`),
  timeout,
});

/** The guard's hooks in Specty's hook, each with `timeout`. */
const guardWith = (timeout: number) => ({
  PreToolUse: [{ matcher: expect.any(String), hooks: [handler("PreToolUse", timeout)] }],
  PostToolUse: [{ matcher: "run_command", hooks: [handler("PostToolUse", timeout)] }],
  PreInvocation: [handler("PreInvocation", timeout)],
});

/** The end of turn `init` writes, with `verify.timeoutSec` (600 by default). */
const TURN = [
  {
    type: "command",
    command: expect.stringContaining("hook agent-stop antigravity --no-check"),
    timeout: 600,
  },
];

describe("the time init writes in Antigravity's hooks", () => {
  it("AC1: writes the configured time in the guard's hooks, 30 s without the key, and the end of turn keeps verify.timeoutSec", async () => {
    const configured = await installed(60);
    expect((await hooks(configured)).specty).toEqual({ ...guardWith(60), Stop: TURN });
    const plain = await installed();
    expect((await hooks(plain)).specty).toEqual({ ...guardWith(30), Stop: TURN });
  });

  it("AC2: rewrites the time when the key changes and init runs again, keeping the end of turn and the person's hooks", async () => {
    const root = await installed();
    const mine = { "my-linter": { PostToolUse: [{ matcher: "run_command", hooks: [] }] } };
    await writeFiles(root, { [HOOKS]: JSON.stringify({ ...(await hooks(root)), ...mine }) });
    await writeFiles(root, { ".specty/config.yaml": config(120) });
    expect((await cli(root, INIT)).code).toBe(0);
    const after = await hooks(root);
    expect(after.specty).toEqual({ ...guardWith(120), Stop: TURN });
    expect(after["my-linter"]).toEqual(mine["my-linter"]);
  });
});

describe("doctor, when Antigravity's hooks have another time", () => {
  const line = (seconds: number) =>
    `Antigravity: los hooks del guard en ${HOOKS} no tienen el tiempo de \`internal.hooks.antigravityTimeoutSec\` (${seconds} s); ejecuta \`specty init --tools antigravity\`.`;

  it("AC3: names the file, the key and its value until init writes the configured time", async () => {
    const root = await installed();
    expect((await cli(root, ["doctor"])).out).not.toContain("no tienen el tiempo de");
    await writeFiles(root, { ".specty/config.yaml": config(45) });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(line(45));
    expect((await cli(root, INIT)).code).toBe(0);
    expect((await cli(root, ["doctor"])).out).not.toContain("no tienen el tiempo de");
  });

  it("AC3: also names a guard's hook that has no time, as an older or hand-edited file may", async () => {
    const root = await installed(45);
    const written = await hooks(root);
    const [{ timeout: _, ...untimed }] = written.specty.PreInvocation;
    const specty = { ...written.specty, PreInvocation: [untimed] };
    await writeFiles(root, { [HOOKS]: JSON.stringify({ ...written, specty }) });
    expect((await cli(root, ["doctor"])).out).toContain(line(45));
  });
});
