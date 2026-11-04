// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, read, tempRepo, writeFiles } from "../../test/support";
import { runsAtSessionStart } from "./claude-code";

const SETTINGS = ".claude/settings.local.json";
const WARNING = "es de antes de la tarjeta al empezar una sesión";

/** A repository where `init` installed Claude Code's guard, with its settings. */
async function installed() {
  const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
  expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
  return { root, settings: JSON.parse(await read(root, SETTINGS)) };
}

/** Doctor's output once Specty's `SessionStart` hook has `matcher`, or none when undefined. */
async function doctorWith(matcher: string | undefined): Promise<string> {
  const { root, settings } = await installed();
  const [{ matcher: _, ...ours }] = settings.hooks.SessionStart;
  const entry = matcher === undefined ? ours : { ...ours, matcher };
  const hooks = { ...settings.hooks, SessionStart: [entry] };
  await writeFiles(root, { [SETTINGS]: JSON.stringify({ ...settings, hooks }) });
  return (await cli(root, ["doctor"])).out;
}

describe("Claude Code's SessionStart at a session's start", () => {
  it("AC4: runs with the matcher init writes, in any order, with every source or with none", () => {
    for (const matcher of [
      "startup|clear|compact",
      "clear|compact|startup",
      "startup",
      "*",
      "",
      undefined,
    ]) {
      expect(runsAtSessionStart(matcher)).toBe(true);
    }
  });

  it("AC4: does not run with a matcher from before, nor with one that is not text", () => {
    for (const matcher of ["compact|clear", "^compact$", "resume", "start", 3, null]) {
      expect(runsAtSessionStart(matcher)).toBe(false);
    }
  });

  it("AC4: doctor takes a hook that runs at every start, with or without a matcher", async () => {
    for (const matcher of ["*", undefined]) {
      const doctor = await doctorWith(matcher);
      expect(doctor).toContain("Claude Code: guard instalado.");
      expect(doctor).not.toContain(WARNING);
    }
  });

  it("AC4: doctor misses the card at a session's start with a matcher from before", async () => {
    expect(await doctorWith("compact|clear")).toContain(WARNING);
  });
});

describe("Claude Code's SessionStart when a session resumes", () => {
  it("AC3: runs with the matcher init writes, in any order, with every source or with none", () => {
    for (const matcher of ["startup|clear|compact|resume", "resume|startup", "resume", "*", ""]) {
      expect(runsAtSessionStart(matcher, "resume")).toBe(true);
    }
    expect(runsAtSessionStart(undefined, "resume")).toBe(true);
  });

  it("AC3: does not run with a matcher from before, nor with one that is not text", () => {
    for (const matcher of ["startup|clear|compact", "compact|clear", "resumed", 3, null]) {
      expect(runsAtSessionStart(matcher, "resume")).toBe(false);
    }
  });
});
