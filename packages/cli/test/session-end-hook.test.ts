// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, read, tempRepo, writeFiles } from "./support";

const PROJECT = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };

const MISSING =
  "Claude Code: falta liberar el frente de una sesión cuando termina (SessionEnd); ejecuta `specty init`.";

/** A project where `init` installed Claude Code's hooks, and their settings. */
async function installed() {
  const root = await tempRepo(PROJECT);
  expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
  return { root, settings: JSON.parse(await read(root, ".claude/settings.local.json")) };
}

describe("Claude Code's SessionEnd hook", () => {
  it("AC1: init installs it without a matcher, with Claude Code's guard", async () => {
    const { settings } = await installed();
    expect(settings.hooks.SessionEnd).toEqual([
      {
        hooks: [{ type: "command", command: expect.stringContaining("guard --tool claude-code") }],
      },
    ]);
  });

  it("AC3: doctor misses it and asks for init, which brings it back", async () => {
    const { root, settings } = await installed();
    const { SessionEnd: _, ...hooks } = settings.hooks;
    await writeFiles(root, {
      ".claude/settings.local.json": JSON.stringify({ ...settings, hooks }),
    });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(MISSING);
    expect(doctor.out).not.toContain("tras compactar");
    expect((await cli(root, ["init"])).code).toBe(0);
    const again = (await cli(root, ["doctor"])).out;
    expect(again).toContain("Claude Code: guard instalado.");
    expect(again).not.toContain(MISSING);
  });
});
