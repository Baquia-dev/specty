// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { cli, person, read, tempRepo, writeFiles } from "./support";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const CLAUDE = ".claude/settings.local.json";
const CODEX = ".codex/hooks.json";

/** A repository where `init` installed the guard of `tools`, with homes of its own. */
async function installed(tools: string) {
  const env = { CODEX_HOME: await mkdtemp(join(tmpdir(), "specty-codex-home-")) };
  const root = await tempRepo(PACKAGE);
  expect((await cli(root, ["init", "--language", "es", "--tools", tools], { env })).code).toBe(0);
  return { root, env };
}

/** The entries of `file`'s `Stop` that run Specty's memory net for `tool`. */
async function nets(root: string, file: string, tool: string): Promise<unknown[]> {
  const stops: unknown[] = JSON.parse(await read(root, file)).hooks.Stop ?? [];
  return stops.filter((entry) => JSON.stringify(entry).includes(`hook memory-stop ${tool}`));
}

describe("Specty's memory net at the end of the turn", () => {
  it("AC1: init writes it in Claude Code's and Codex's Stop, once, next to the person's", async () => {
    const env = { CODEX_HOME: await mkdtemp(join(tmpdir(), "specty-codex-home-")) };
    const root = await tempRepo(PACKAGE);
    const mine = { hooks: [{ type: "command", command: "echo bye" }] };
    await writeFiles(root, { [CODEX]: JSON.stringify({ hooks: { Stop: [mine] } }) });
    for (let run = 0; run < 2; run++) {
      const init = await cli(root, ["init", "--language", "es", "--tools", "claude-code,codex"], {
        env,
      });
      expect(init.code).toBe(0);
    }
    expect(await nets(root, CLAUDE, "claude-code")).toEqual([
      {
        hooks: [
          { type: "command", command: expect.stringMatching(/ hook memory-stop claude-code$/) },
        ],
      },
    ]);
    const codex = JSON.parse(await read(root, CODEX)).hooks.Stop;
    expect(codex).toHaveLength(2);
    expect(codex[0]).toEqual(mine);
    expect(await nets(root, CODEX, "codex")).toHaveLength(1);
  });

  it("AC2: doctor warns when the guard is there without it", async () => {
    const { root, env } = await installed("claude-code,codex");
    const fresh = await cli(root, ["doctor"], { env });
    expect(fresh.out).not.toContain("red de la memoria");
    for (const file of [CLAUDE, CODEX]) {
      const settings = JSON.parse(await read(root, file));
      const { Stop: _, ...hooks } = settings.hooks;
      await writeFiles(root, { [file]: JSON.stringify({ ...settings, hooks }) });
    }
    const doctor = await cli(root, ["doctor"], { env });
    expect(doctor.out).toContain(
      "Claude Code: el fin de turno no lleva la red de la memoria de Specty (`hook memory-stop`); ejecuta `specty init`.",
    );
    expect(doctor.out).toContain(
      "Codex: el fin de turno no lleva la red de la memoria de Specty (`hook memory-stop`); ejecuta `specty init`.",
    );
  });

  it("AC3: uninstall takes it away, and the person's Stop stays", async () => {
    const env = { CODEX_HOME: await mkdtemp(join(tmpdir(), "specty-codex-home-")) };
    const root = await tempRepo(PACKAGE);
    const mine = { hooks: [{ type: "command", command: "echo bye" }] };
    await writeFiles(root, { [CODEX]: JSON.stringify({ hooks: { Stop: [mine] } }) });
    const init = await cli(root, ["init", "--language", "es", "--tools", "claude-code,codex"], {
      env,
    });
    expect(init.code).toBe(0);
    const terminal = person({ choose: ["yes"] });
    expect((await cli(root, ["uninstall"], { env, terminal })).code).toBe(0);
    expect(JSON.parse(await read(root, CODEX))).toEqual({ hooks: { Stop: [mine] } });
    if (await exists(join(root, CLAUDE))) {
      expect(await read(root, CLAUDE)).not.toContain("memory-stop");
    }
  });
});
