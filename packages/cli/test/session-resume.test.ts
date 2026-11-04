// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, cli, inWorktree, read, tempRepo, writeFiles } from "./support";

const SETTINGS = ".claude/settings.local.json";
const RESUME_WARNING =
  "Claude Code: el hook `SessionStart` de Specty no se dispara al reanudar una sesión, así que la sesión reanudada no recibe la tarjeta de su cambio; ejecuta `specty init`.";
const STARTUP_WARNING =
  "Claude Code: el hook `SessionStart` de Specty es de antes de la tarjeta al empezar una sesión; ejecuta `specty init`.";

/** A repository where `init` installed Claude Code's guard. */
async function installed(): Promise<string> {
  const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
  expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
  return root;
}

/** Gives Specty's `SessionStart` hook in `root` this `matcher`, or none when undefined. */
async function withMatcher(root: string, matcher: string | undefined): Promise<void> {
  const settings = JSON.parse(await read(root, SETTINGS));
  const [{ matcher: _, ...ours }] = settings.hooks.SessionStart;
  const entry = matcher === undefined ? ours : { ...ours, matcher };
  const hooks = { ...settings.hooks, SessionStart: [entry] };
  await writeFiles(root, { [SETTINGS]: JSON.stringify({ ...settings, hooks }) });
}

describe("a Claude Code session that resumes", () => {
  it("AC1: init writes Specty's SessionStart with the matcher that takes `resume`", async () => {
    const settings = JSON.parse(await read(await installed(), SETTINGS));
    expect(settings.hooks.SessionStart).toMatchObject([
      { matcher: "startup|clear|compact|resume", hooks: [{ type: "command" }] },
    ]);
  });

  it("AC2: in the main folder, the guard gives it the card to go back to its change", async () => {
    const { root, folder } = await inWorktree();
    const entered = await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        cwd: root,
        tool_name: "EnterWorktree",
        tool_input: { path: folder },
        session_id: "s1",
      }),
    });
    expect(entered.code).toBe(0);
    const resumed = await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        session_id: "s1",
        cwd: root,
        hook_event_name: "SessionStart",
        source: "resume",
      }),
    });
    expect(resumed.code).toBe(0);
    expect(resumed.out).toContain("TU CAMBIO:");
    expect(resumed.out).toContain(
      `Esta conversación trabaja en el cambio ${CHANGE} («Saludo personalizado»), en ${folder}`,
    );
    expect(resumed.out).toContain(`SIGUIENTE: vuelve a ${folder}:`);
    expect(resumed.out).not.toContain("specty new");
  });
});

describe("doctor and the card when a session resumes", () => {
  it("AC3: warns about a hook that runs at a session's start but not when it resumes, until init", async () => {
    const root = await installed();
    expect((await cli(root, ["doctor"])).out).not.toContain(RESUME_WARNING);
    await withMatcher(root, "startup|clear|compact");
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(RESUME_WARNING);
    expect(doctor.out).not.toContain(STARTUP_WARNING);
    expect((await cli(root, ["init"])).code).toBe(0);
    expect((await cli(root, ["doctor"])).out).not.toContain(RESUME_WARNING);
  });

  it("AC3: takes a hook that runs with every source, with or without a matcher", async () => {
    for (const matcher of ["*", undefined]) {
      const root = await installed();
      await withMatcher(root, matcher);
      const doctor = await cli(root, ["doctor"]);
      expect(doctor.out).toContain("Claude Code: guard instalado.");
      expect(doctor.out).not.toContain(RESUME_WARNING);
    }
  });

  it("AC4: gives only the warning from before when the hook runs neither at start nor on resume", async () => {
    const root = await installed();
    await withMatcher(root, "compact|clear");
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(STARTUP_WARNING);
    expect(doctor.out).not.toContain(RESUME_WARNING);
  });
});
