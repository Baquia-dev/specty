// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, git, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

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
/** The denial of a command that waits with `program`. */
const waitingWith = (program: string) =>
  `specty: El cambio ${CHANGE} espera la decisión de la persona: no se espera con \`${program}\`.`;

/** The change's lock, as a Specty process with `pid` holds it while it runs, such as an `accept`. */
async function lockedBy(root: string, pid: number): Promise<void> {
  const path = join(
    root,
    git(root, "rev-parse", "--git-path", `common/specty/locks/${CHANGE}.json`),
  );
  await mkdir(dirname(path), { recursive: true });
  const holder = { pid, command: "accept", folder: root, at: "2026-11-06T22:10:00.000Z" };
  await writeFile(path, JSON.stringify(holder));
}

/** The id of a process that already ended. */
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

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
  it("AC1: rejects `caffeinate`, the shell's `wait` and the other waits, naming the program", async () => {
    const root = await inReview();
    for (const [command, program] of [
      ["caffeinate -w 4242", "caffeinate"],
      ["caffeinate -t 600", "caffeinate"],
      ["wait 4242", "wait"],
      ["tail -f /dev/null", "tail"],
      ["if true; then caffeinate -i sleep 60; fi", "sleep"],
    ] as const) {
      const denied = await bash(root, command);
      expect(denied.code, command).toBe(2);
      expect(denied.err, command).toContain(waitingWith(program));
      expect(denied.err, command).toContain(
        `SIGUIENTE: ejecuta \`specty wait\` para esperar su decisión. ${BACKGROUND}`,
      );
    }
    for (const command of ["caffeinate -i git status", "git status & git log -1 & wait"]) {
      expect((await bash(root, command)).code, command).toBe(0);
    }
  });

  it("AC3: lets the waits through while a live Specty process holds the change's lock, and not once it ended", async () => {
    const root = await inReview();
    await lockedBy(root, process.pid);
    for (const command of ["sleep 30", "caffeinate -w 4242", "wait 4242"]) {
      expect((await bash(root, command)).code, command).toBe(0);
    }
    await lockedBy(root, deadPid());
    const denied = await bash(root, "caffeinate -w 4242");
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(waitingWith("caffeinate"));
  });
});
