// SPDX-License-Identifier: Apache-2.0
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  SPEC,
  SPEC_PATH,
  stateIn,
  tempRepo,
  writeFiles,
} from "./support";

/** The person turns Specty on or off: one more line in its switch log. */
async function turn(root: string, on: boolean): Promise<void> {
  const path = git(root, "rev-parse", "--git-path", "common/specty/switch.jsonl").trim();
  const log = isAbsolute(path) ? path : join(root, path);
  await mkdir(dirname(log), { recursive: true });
  const at = on ? "2026-11-08T11:30:00.000Z" : "2026-11-08T10:05:00.000Z";
  await appendFile(log, `${JSON.stringify({ on, by: "Ana", at })}\n`);
}

/** A repository whose change the person approved: its tasks wait for the agent. */
async function approved(config = CONFIG()): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(decided.code).toBe(0);
  return root;
}

describe("specty next with Specty off", () => {
  it("AC4: says it is off, since when and who, and to do what the user asks without Specty", async () => {
    const root = await approved();
    await turn(root, false);
    const run = await cli(root, ["next"]);
    expect(run.code).toBe(0);
    expect(run.out).toBe(
      [
        "SPECTY · apagado",
        "Specty está apagado desde el 2026-11-08 a las 10:05 UTC: lo apagó Ana.",
        "Nada de lo que hagas pasa por Specty: ni el guard, ni los hooks de git, ni el fin de turno.",
        "Los cambios abiertos siguen como están, y continúan cuando la persona lo vuelva a encender.",
        "SIGUIENTE: haz lo que pide el usuario sin spec ni comandos de Specty.",
      ].join("\n"),
    );
  });

  it("AC4: says it in English, also with no change open", async () => {
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": CONFIG().replace("language: es", "language: en"),
    });
    await turn(root, false);
    const run = await cli(root, ["next"]);
    expect(run.code).toBe(0);
    expect(run.out).toBe(
      [
        "SPECTY · off",
        "Specty has been off since 2026-11-08 at 10:05 UTC: Ana turned it off.",
        "Nothing you do goes through Specty: not the guard, the git hooks or the end of turn.",
        "Open changes stay as they are, and go on when the person turns it back on.",
        "NEXT: do what the user asks without a spec or Specty commands.",
      ].join("\n"),
    );
  });

  it("AC4: comes before the card of code changed without a spec", async () => {
    const root = await tempRepo(APP);
    await writeFiles(root, { "src/app.ts": "cambiado sin spec\n" });
    expect((await cli(root, ["next"])).out).toContain("CAMBIOS SIN SPEC");
    await turn(root, false);
    const run = await cli(root, ["next"]);
    expect(run.code).toBe(0);
    expect(run.out.startsWith("SPECTY · apagado\n")).toBe(true);
    expect(run.out).not.toContain("CAMBIOS SIN SPEC");
  });

  it("AC6: leaves the open change as it was, and back on goes on with it", async () => {
    const root = await approved();
    await turn(root, false);
    await cli(root, ["next"]);
    const off = await stateIn(root, CHANGE);
    expect(off.phase).toBe("implementing");
    expect(off.tasks).toEqual({});

    await turn(root, true);
    const run = await cli(root, ["next"]);
    expect(run.out).toContain(`SPECTY · ${CHANGE} · implementing`);
    expect(run.out).not.toContain("apagado");
    const on = await stateIn(root, CHANGE);
    expect(on.phase).toBe("implementing");
    expect(on.tasks).toMatchObject({ T1: { status: "active" } });
  });
});
