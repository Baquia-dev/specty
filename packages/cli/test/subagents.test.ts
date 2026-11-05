// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE, claudeWith, initialized, step } from "./fake-model";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  NOW,
  person,
  read,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const EPIC = CHANGE.replace("saludo-personalizado", "panel");
const SLICE = CHANGE.replace("saludo-personalizado", "inicio");
const EPIC_SPEC = `---
kind: epic
---

# Panel

## Objetivo

El estudiante ve su progreso.

## Fuera de alcance

- Exportarlo.

## Supuestos

- A1: El progreso ya se guarda.

## Criterios de aceptación

- AC1: CUANDO el estudiante inicia sesión ENTONCES llega a su panel.

## Cortes

- C1: Inicio
  - ac: AC1
`;

/** Who sends an event: the main conversation of a session, or one of its subagents. */
interface Who {
  readonly session?: string;
  readonly agent?: string;
}

/** The subagent `a1` of the session `s1`. */
const SUBAGENT: Who = { agent: "a1" };

/** Claude Code's hook before a tool call of `who`, with the tool working in `cwd`. */
const claude = (cwd: string, tool: Record<string, unknown>, { session = "s1", agent }: Who = {}) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      hook_event_name: "PreToolUse",
      ...(agent === undefined ? {} : { agent_id: agent, agent_type: "general-purpose" }),
      ...tool,
    }),
  });

const bash = (cwd: string, command: string, who?: Who) =>
  claude(cwd, { tool_name: "Bash", tool_input: { command } }, who);

const write = (cwd: string, path: string, who?: Who) =>
  claude(cwd, { tool_name: "Write", tool_input: { file_path: path, content: "x\n" } }, who);

const enterByName = (cwd: string, name: string, who?: Who) =>
  claude(cwd, { tool_name: "EnterWorktree", tool_input: { name } }, who);

const enterByPath = (cwd: string, path: string, who?: Who) =>
  claude(cwd, { tool_name: "EnterWorktree", tool_input: { path } }, who);

/** What Claude Code tells the commands that the conversation of `session` runs. */
const claudeEnv = (session = "s1") => ({ CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: session });

/** Where the guard keeps the folder a conversation works in. */
const BINDING = (conversation: string) => `.git/common/specty/sessions/${conversation}.json`;

const boundFolder = async (root: string, conversation: string): Promise<string> =>
  JSON.parse(await read(root, BINDING(conversation))).folder;

/** Where the guard notes the last step of a conversation of Claude Code. */
const ACTIVITY = (conversation: string) =>
  `.git/common/specty/activity/claude-code-${conversation}.json`;

/** A repository with two open changes, each in its own folder. */
async function twoChanges() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, first: folderOf(root), second: folderOf(root, OTHER) };
}

/** An approved epic in its own folder, and that folder. */
async function approvedEpic(root: string): Promise<string> {
  expect((await cli(root, ["new", "--worktree", "--kind", "epic", "Panel"])).code).toBe(0);
  const epic = folderOf(root, EPIC);
  await writeFiles(epic, { [`.specty/changes/${EPIC}/spec.md`]: EPIC_SPEC });
  expect((await cli(epic, ["propose"])).code).toBe(0);
  expect((await cli(epic, ["approve"], { terminal: person() })).code).toBe(0);
  return epic;
}

describe("a subagent of Claude Code", () => {
  it("AC1: has a binding and steps of its own, apart from its session's", async () => {
    const { root, first } = await twoChanges();
    expect((await bash(root, `specty enter ${CHANGE}`, SUBAGENT)).code).toBe(0);
    expect(await boundFolder(root, "s1--a1")).toBe(first);
    await expect(read(root, BINDING("s1"))).rejects.toThrow();
    // Once inside, its steps count in the folder it entered, under its own conversation.
    expect((await bash(root, `cd '${first}' && ls`, SUBAGENT)).code).toBe(0);
    expect(JSON.parse(await read(root, ACTIVITY("s1--a1"))).folder).toBe(first);
    await expect(read(root, ACTIVITY("s1"))).rejects.toThrow();
  });

  it("AC2: enters a change's folder with `specty enter`, and its session stays in its own", async () => {
    const { root, first, second } = await twoChanges();
    expect((await enterByName(root, CHANGE)).code).toBe(0);
    expect(await boundFolder(root, "s1")).toBe(first);
    // The subagent starts where the main conversation works.
    expect((await bash(first, `specty enter ${OTHER}`, SUBAGENT)).code).toBe(0);
    expect(await boundFolder(root, "s1--a1")).toBe(second);
    expect(await boundFolder(root, "s1")).toBe(first);
    // The main session still enters with its own tool.
    const native = await bash(first, `specty enter ${OTHER}`);
    expect(native.code).toBe(2);
    expect(native.err).toContain(`SIGUIENTE: usa \`EnterWorktree\` con \`name: "${OTHER}"\`.`);
  });

  it("AC3: is judged by the rules of the change it entered, and told the path inside its folder", async () => {
    const { root, first } = await twoChanges();
    expect((await bash(root, `specty enter ${CHANGE}`, SUBAGENT)).code).toBe(0);
    const outside = await write(root, join(root, "src/nuevo.ts"), SUBAGENT);
    expect(outside.code).toBe(2);
    expect(outside.err).toContain("está fuera de la carpeta en la que trabaja esta conversación.");
    expect(outside.err).toContain(
      `SIGUIENTE: usa la misma ruta dentro de ella: \`${join(first, "src/nuevo.ts")}\`.`,
    );
    // Inside it, its change's rules judge: the spec is open while drafted, the code is not yet.
    expect((await write(root, join(first, SPEC_PATH), SUBAGENT)).code).toBe(0);
    const code = await write(root, join(first, "src/nuevo.ts"), SUBAGENT);
    expect(code.code).toBe(2);
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("AC3: is told to run in its folder a command that would run outside it", async () => {
    const { root, first } = await twoChanges();
    expect((await bash(root, `specty enter ${CHANGE}`, SUBAGENT)).code).toBe(0);
    const denied = await bash(root, "pnpm test", SUBAGENT);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `Esta conversación trabaja en \`${first}\`: este comando correría fuera de esa carpeta.`,
    );
    expect(denied.err).toContain(`SIGUIENTE: ejecútalo allí: \`cd '${first}' && pnpm test\`.`);
    expect((await bash(root, `cd '${first}' && pnpm test`, SUBAGENT)).code).toBe(0);
    // Its session, which entered no folder, runs the command where it is.
    expect((await bash(root, "pnpm test")).code).toBe(0);
  });

  it("AC4: works one open change at a time, and is free once that change is finished", async () => {
    const { root, first, second } = await twoChanges();
    expect((await bash(root, `specty enter ${CHANGE}`, SUBAGENT)).code).toBe(0);
    const denied = await bash(root, `specty enter ${OTHER}`, SUBAGENT);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `Esta sesión trabaja en \`${first}\` (cambio ${CHANGE}, aún abierto): una sesión trabaja un solo cambio a la vez.`,
    );
    // Another subagent of the same session is free to enter it.
    expect((await bash(root, `specty enter ${OTHER}`, { agent: "a2" })).code).toBe(0);
    expect(await boundFolder(root, "s1--a2")).toBe(second);
    await cli(first, ["cancel", "--reason", "Ya no"], { terminal: person() });
    expect((await bash(root, `specty enter ${OTHER}`, SUBAGENT)).code).toBe(0);
    expect(await boundFolder(root, "s1--a1")).toBe(second);
  });
});

describe("`specty new --subagent`", () => {
  it("AC5: creates the change without binding the conversation that runs it, and says to enter it", async () => {
    const root = await tempRepo(APP);
    const created = await cli(root, ["new", "--worktree", "Saludo personalizado", "--subagent"], {
      env: claudeEnv(),
    });
    expect(created.code).toBe(0);
    expect(created.out).toContain(`entra con \`specty enter ${CHANGE}\` y sigue su salida`);
    expect(created.out).not.toContain("EnterWorktree");
    await expect(read(root, BINDING("s1"))).rejects.toThrow();
  });

  it("AC5: leaves the conversation of an epic bound to the epic when it starts a slice", async () => {
    const root = await tempRepo(APP);
    const epic = await approvedEpic(root);
    expect((await enterByName(root, EPIC)).code).toBe(0);
    expect(await boundFolder(root, "s1")).toBe(epic);
    const slice = ["new", "--worktree", "Inicio", "--epic", EPIC, "--slice", "C1", "--subagent"];
    const created = await cli(epic, slice, { env: claudeEnv() });
    expect(created.code).toBe(0);
    expect(created.out).toContain(`entra con \`specty enter ${SLICE}\` y sigue su salida`);
    expect(await boundFolder(root, "s1")).toBe(epic);
  });
});

describe("what the guard asks of a subagent of Claude Code", () => {
  it("AC1: blocks its `EnterWorktree` by name, binds nobody and says to use `specty enter`", async () => {
    const { root, first } = await twoChanges();
    expect((await enterByName(root, CHANGE)).code).toBe(0);
    // The subagent starts where the main conversation works.
    const denied = await enterByName(first, OTHER, SUBAGENT);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain("Un subagente no entra con `EnterWorktree`");
    expect(denied.err).toContain(`SIGUIENTE: entra con \`specty enter ${OTHER}\``);
    await expect(read(root, BINDING("s1--a1"))).rejects.toThrow();
    expect(await boundFolder(root, "s1")).toBe(first);
  });

  it("AC2: blocks its `EnterWorktree` by path, and names the change whose folder it is", async () => {
    const { root, second } = await twoChanges();
    const absolute = await enterByPath(root, second, SUBAGENT);
    expect(absolute.code).toBe(2);
    expect(absolute.err).toContain(`SIGUIENTE: entra con \`specty enter ${OTHER}\``);
    const relative = await enterByPath(root, `.worktrees/${CHANGE}`, SUBAGENT);
    expect(relative.code).toBe(2);
    expect(relative.err).toContain(`SIGUIENTE: entra con \`specty enter ${CHANGE}\``);
    await expect(read(root, BINDING("s1--a1"))).rejects.toThrow();
  });

  it("AC2: leaves the id to fill in for a path that is no change's folder", async () => {
    const { root } = await twoChanges();
    const denied = await enterByPath(root, root, SUBAGENT);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain("SIGUIENTE: entra con `specty enter <id>`");
    await expect(read(root, BINDING("s1--a1"))).rejects.toThrow();
  });

  it("AC3: blocks its `specty new` without `--subagent`, and lets it through with it", async () => {
    const root = await tempRepo(APP);
    const denied = await bash(root, 'specty new "Saludo personalizado"', SUBAGENT);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain("sin `--subagent`, `new` ataría esa sesión al cambio nuevo.");
    expect(denied.err).toContain("SIGUIENTE: vuelve a ejecutarlo con `--subagent`");
    const mixed = 'specty new "Uno" --subagent && specty new "Otro"';
    expect((await bash(root, mixed, SUBAGENT)).code).toBe(2);
    const created = 'specty new "Saludo personalizado" --subagent';
    expect((await bash(root, created, SUBAGENT)).code).toBe(0);
  });

  it("AC4: judges its session as before: it runs `specty new` and enters with `EnterWorktree`", async () => {
    const { root, first } = await twoChanges();
    expect((await bash(root, 'specty new "Tercer cambio"')).code).toBe(0);
    expect((await enterByName(root, CHANGE)).code).toBe(0);
    expect(await boundFolder(root, "s1")).toBe(first);
  });
});

/**
 * Adds to Claude Code's settings in `folder` a hook that keeps each event before a tool, as the
 * guard receives it, and gives the file it keeps them in.
 */
async function recordEvents(folder: string): Promise<string> {
  const file = join(await mkdtemp(join(tmpdir(), "specty-events-")), "events.jsonl");
  const path = join(folder, ".claude", "settings.local.json");
  const settings = JSON.parse(await readFile(path, "utf8"));
  const before = settings.hooks?.PreToolUse ?? [];
  const keep = { type: "command", command: `cat >> '${file}'; echo >> '${file}'` };
  settings.hooks = { ...settings.hooks, PreToolUse: [...before, { matcher: "*", hooks: [keep] }] };
  await writeFile(path, JSON.stringify(settings, null, 2));
  return file;
}

/** The events `recordEvents` kept, in order. */
async function recorded(file: string): Promise<Record<string, unknown>[]> {
  const text = existsSync(file) ? await readFile(file, "utf8") : "";
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

describe.skipIf(CLAUDE === undefined)(
  "real Claude Code with a scripted model (needs Claude Code: SPECTY_E2E_CLAUDE, the PATH or an editor extension)",
  () => {
    it("AC7: a subagent enters a slice's folder while the main session stays bound to the epic", async () => {
      const root = await initialized();
      const epic = await approvedEpic(root);
      const started = ["new", "--worktree", "Inicio", "--epic", EPIC, "--slice", "C1"];
      expect((await cli(epic, started)).code).toBe(0);
      const slice = folderOf(root, SLICE);
      // The main session works in the epic's folder, bound to it.
      const session = randomUUID();
      expect((await enterByName(epic, EPIC, { session })).code).toBe(0);
      const events = await recordEvents(epic);
      const mark = "ENCARGO-C1";
      const spec = join(slice, `.specty/changes/${SLICE}/spec.md`);
      const model = await claudeWith(epic, [step.delegate(mark, "trabaja el corte C1")], {
        session,
        subagents: {
          [mark]: [
            step.bash(`specty enter ${SLICE}`),
            step.read(spec),
            step.write(spec, "# Inicio\n"),
            step.bash(`cd '${slice}' && echo "$CLAUDE_CODE_SESSION_ID"`),
          ],
        },
      });
      const seen = await recorded(events);
      const main = seen.filter((event) => event.agent_id === undefined);
      const delegated = seen.filter((event) => event.agent_id !== undefined);
      expect(main.map((event) => event.tool_name)).toContain("Agent");
      expect(delegated.map((event) => event.tool_name)).toEqual(["Bash", "Read", "Write", "Bash"]);
      // Its events carry the session that launched it, and an id of its own.
      expect(new Set(seen.map((event) => event.session_id))).toEqual(new Set([session]));
      expect(new Set(delegated.map((event) => event.agent_id)).size).toBe(1);
      const agent = String(delegated[0]?.agent_id);
      const results = model.subagentResults(mark);
      expect(results.map((result) => result.isError)).toEqual([false, false, false, false]);
      // Its commands are told the session that launched it, as `CLAUDE_CODE_SESSION_ID`.
      expect(results[3]?.text).toContain(session);
      expect(await read(slice, `.specty/changes/${SLICE}/spec.md`)).toBe("# Inicio\n");
      expect(await boundFolder(root, `${session}--${agent}`)).toBe(slice);
      expect(await boundFolder(root, session)).toBe(epic);
    });
    it("AC5: a subagent writes in its slice's folder once the session left the epic's with ExitWorktree", async () => {
      const root = await initialized();
      const epic = await approvedEpic(root);
      const started = [
        "new",
        "--worktree",
        "Inicio",
        "--epic",
        EPIC,
        "--slice",
        "C1",
        "--subagent",
      ];
      expect((await cli(root, started)).code).toBe(0);
      const slice = folderOf(root, SLICE);
      // Nobody stepped in the slice's folder for two hours: an orphan, with a brief to resume it.
      const before = new Date(NOW.getTime() - 120 * 60_000);
      await utimes(join(slice, `.specty/changes/${SLICE}/state.json`), before, before);
      const session = randomUUID();
      const mark = "ENCARGO-C1";
      const spec = join(slice, `.specty/changes/${SLICE}/spec.md`);
      const script = [
        { name: "EnterWorktree", input: { name: EPIC } },
        step.bash("specty next"),
        { name: "ExitWorktree", input: { action: "keep" } },
        step.bash("specty next"),
        step.delegate(mark, "retoma el corte C1"),
      ];
      const model = await claudeWith(root, script, {
        session,
        asInEvals: true,
        worktrees: true,
        subagents: {
          [mark]: [
            step.bash(`specty enter ${SLICE}`),
            step.read(spec),
            step.write(spec, "# Inicio\n"),
            step.bash(`cd '${slice}' && git status --short`),
          ],
        },
      });
      const results = model.results();
      expect(results.map((result) => result.isError)).toEqual([false, false, false, false, false]);
      // In the epic's worktree, the card asks to leave it before launching the brief.
      expect(results[1]?.text).toContain("ENCARGO C1 (huérfano):");
      expect(results[1]?.text).toContain('`ExitWorktree` con `action: "keep"`');
      // Back in the main folder, the session still gets its epic's card, not a way back into it.
      expect(results[3]?.text).toContain(`TU ÉPICA:\n  Esta conversación lleva la épica ${EPIC}`);
      expect(results[3]?.text).toContain("ENCARGO C1 (huérfano):");
      expect(results[3]?.text).not.toContain("EnterWorktree");
      // Its subagent enters the slice's folder and writes there, with the evals' permissions.
      const delegated = model.subagentResults(mark);
      expect(delegated.map((result) => result.isError)).toEqual([false, false, false, false]);
      expect(await read(slice, `.specty/changes/${SLICE}/spec.md`)).toBe("# Inicio\n");
      expect(await boundFolder(root, session)).toBe(epic);
    });
  },
);
