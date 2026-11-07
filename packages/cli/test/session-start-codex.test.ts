// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

const HOOKS = ".codex/hooks.json";

/** Codex's `SessionStart` in `cwd`, from `source`. */
const started = (cwd: string, source: string) =>
  cli(cwd, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({ session_id: "s1", cwd, hook_event_name: "SessionStart", source }),
  });

/** A repository with an approved change, whose card names its first task. */
async function approved(): Promise<string> {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person() });
  return root;
}

describe("Specty's card as a Codex session starts", () => {
  it("AC1: brings what `specty next` says on startup, resume and /clear, and nothing on a fork", async () => {
    const root = await approved();
    // The guard's card is its `--tool`'s: `next` in the same Codex thread.
    const next = (await cli(root, ["next"], { env: { CODEX_THREAD_ID: "s1" } })).out;
    expect(next).toContain("TAREA T1: Saludar por nombre");
    for (const source of ["startup", "resume", "clear", "compact"]) {
      const card = await started(root, source);
      expect(card.code, source).toBe(0);
      expect(card.out, source).toBe(next);
    }
    expect(await started(root, "fork")).toMatchObject({ code: 0, out: "", err: "" });
  });

  it("AC2: init lets those four sources through, and doctor warns an install that misses startup", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    expect((await cli(root, ["init", "--language", "es", "--tools", "codex"])).code).toBe(0);
    const hooks = JSON.parse(await read(root, HOOKS));
    expect(hooks.hooks.SessionStart).toMatchObject([
      { matcher: "^(startup|resume|clear|compact)$" },
    ]);
    const warning =
      "Codex: la tarjeta de Specty no llega al empezar una sesión (el SessionStart de .codex/hooks.json no admite startup); ejecuta `specty init --tools codex`.";
    expect((await cli(root, ["doctor"])).out).not.toContain(warning);
    const [entry] = hooks.hooks.SessionStart;
    await writeFiles(root, {
      [HOOKS]: JSON.stringify({
        hooks: { ...hooks.hooks, SessionStart: [{ ...entry, matcher: "^compact$" }] },
      }),
    });
    expect((await cli(root, ["doctor"])).out).toContain(warning);
  });
});
