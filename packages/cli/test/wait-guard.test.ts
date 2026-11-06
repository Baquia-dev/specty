// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** Claude Code's hook before its `Bash` tool runs `command` in `cwd`, with the rest of its input. */
const bash = (cwd: string, command: string, input: Readonly<Record<string, unknown>> = {}) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command, ...input },
    }),
  });

/** A repository whose change waits for the person to approve its spec. */
async function inReview(): Promise<string> {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  return root;
}

/** A repository whose change the person approved: it waits for nobody. */
async function implementing(): Promise<string> {
  const root = await inReview();
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  return root;
}

const BACKGROUND =
  "Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.";
const SLEEP = `specty: El cambio ${CHANGE} espera la decisión de la persona: no se espera con \`sleep\`.`;

describe("Claude Code's guard and the ways of waiting for the person", () => {
  it("AC1: rejects `specty wait` in the foreground and asks for `run_in_background: true`", async () => {
    for (const root of [await tempRepo(APP), await inReview()]) {
      for (const command of [
        "specty wait",
        "specty wait --timeout 600",
        `cd '${root}' && specty wait`,
        "npx -y @baquia-dev/specty wait",
      ]) {
        for (const input of [{}, { run_in_background: false }]) {
          const denied = await bash(root, command, input);
          expect(denied.code, command).toBe(2);
          expect(denied.err, command).toContain(
            "specty: `specty wait` espera la decisión de la persona, que puede tardar más que el límite de un comando en primer plano.",
          );
          expect(denied.err, command).toContain(
            `SIGUIENTE: lanza de nuevo \`specty wait\` para esperar su decisión. ${BACKGROUND}`,
          );
        }
      }
    }
  });

  it("AC1: lets `specty wait` through in the background, and other commands in the foreground", async () => {
    const root = await inReview();
    const background = await bash(root, "specty wait", { run_in_background: true });
    expect(background.code).toBe(0);
    expect(background.err).toBe("");
    for (const command of ["specty next", "specty status", "git status"]) {
      expect((await bash(root, command)).code, command).toBe(0);
    }
  });

  it("AC2: rejects `sleep` while the change waits for the person and asks for `specty wait`", async () => {
    const root = await inReview();
    for (const command of [
      "sleep 30",
      "sleep 5 && specty status",
      "while true; do specty status; sleep 10; done",
    ]) {
      const denied = await bash(root, command);
      expect(denied.code, command).toBe(2);
      expect(denied.err, command).toContain(SLEEP);
      expect(denied.err, command).toContain(
        `SIGUIENTE: ejecuta \`specty wait\` para esperar su decisión. ${BACKGROUND}`,
      );
    }
    for (const command of ["specty status", "specty next"]) {
      expect((await bash(root, command)).code, command).toBe(0);
    }
  });

  it("AC2: a pending scope request waits for the person too", async () => {
    const root = await implementing();
    expect((await bash(root, "sleep 1")).code).toBe(0);
    await cli(root, ["next"]);
    await cli(root, ["scope", "add", "src/extra.ts", "--reason", "motivo"]);
    const denied = await bash(root, "sleep 1");
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(SLEEP);
  });

  it("AC2: lets `sleep` through when no change waits for the person", async () => {
    expect((await bash(await tempRepo(APP), "sleep 1")).code).toBe(0);
    expect((await bash(await implementing(), "sleep 1 && echo listo")).code).toBe(0);
  });

  it("AC2: in delegated mode, asks for `specty next` instead of `specty wait`", async () => {
    const root = await inReview();
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    const denied = await bash(root, "sleep 30");
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(SLEEP);
    expect(denied.err).toContain(
      "SIGUIENTE: ejecuta `specty next`, que te dice si decides tú o esperas a la persona.",
    );
  });
});
