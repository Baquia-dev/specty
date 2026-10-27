// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** A repository whose change is implementing T1 (`src/app.ts`, `src/app.test.ts`). */
async function implementing(): Promise<string> {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person() });
  await cli(root, ["next"]);
  return root;
}

/** Cursor's hook around its `Shell` tool, with the fields its documentation lists. */
const shell = (root: string, event: string, id: string, command = "python3 gen.py") =>
  cli(root, ["guard", "--tool", "cursor"], {
    stdin: JSON.stringify({
      hook_event_name: event,
      conversation_id: "c",
      workspace_roots: [root],
      cwd: root,
      tool_name: "Shell",
      tool_input: { command },
      tool_use_id: id,
    }),
  });

const answer = async (reply: Promise<{ code: number; out: string }>) => {
  const { code, out } = await reply;
  expect(code).toBe(0);
  return JSON.parse(out);
};

/** Cursor's hook before one of its tools, for the conversation `c`. */
const before = (root: string, tool: string, input: Record<string, unknown>, event = "preToolUse") =>
  cli(root, ["guard", "--tool", "cursor"], {
    stdin: JSON.stringify({
      hook_event_name: event,
      conversation_id: "c",
      workspace_roots: [root],
      cwd: root,
      tool_name: tool,
      tool_input: input,
      tool_use_id: "t1",
      ...(event === "beforeShellExecution" ? { command: input.command } : {}),
    }),
  });

/** A repository with a change in its own folder, which Cursor's conversation `c` entered. */
async function entered(): Promise<{ readonly root: string; readonly folder: string }> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  const enter = await answer(before(root, "Shell", { command: `specty enter ${CHANGE}` }));
  expect(enter.permission).toBe("allow");
  return { root, folder: folderOf(root) };
}

describe("Cursor in the folder of the change its conversation entered", () => {
  it("runs each command there, or in the same folder inside it, after a cd (C6 AC1)", async () => {
    const { root, folder } = await entered();
    expect(await answer(before(root, "Shell", { command: "pnpm test" }))).toEqual({
      permission: "allow",
      updated_input: { command: `cd '${folder}' && pnpm test` },
    });
    const inner = { command: "ls", working_directory: join(root, "src") };
    expect(await answer(before(root, "Shell", inner))).toEqual({
      permission: "allow",
      updated_input: { ...inner, command: `cd '${join(folder, "src")}' && ls` },
    });
    const code = await answer(before(root, "Shell", { command: "echo x > src/app.ts" }));
    expect(code.permission).toBe("deny");
    expect(code.agent_message).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("judges the command as it comes before it runs, which cannot be rewritten (C6 AC2)", async () => {
    const { root, folder } = await entered();
    const elsewhere = await answer(
      before(root, "Shell", { command: "pnpm test" }, "beforeShellExecution"),
    );
    expect(elsewhere.permission).toBe("deny");
    expect(elsewhere.agent_message).toContain(
      `SIGUIENTE: ejecútalo allí: \`cd '${folder}' && pnpm test\`.`,
    );
    const there = { command: `cd '${folder}' && pnpm test` };
    expect(await answer(before(root, "Shell", there, "beforeShellExecution"))).toEqual({
      permission: "allow",
    });
  });

  it("blocks writing, deleting or reading outside that folder, with the same path inside (C6 AC3)", async () => {
    const { root, folder } = await entered();
    for (const [tool, input] of [
      ["Write", { file_path: join(root, "notas.md") }],
      ["Delete", { path: join(root, "src/app.ts") }],
      ["Read", { target_file: join(root, "src/app.ts") }],
      ["Grep", { path: join(root, "src") }],
    ] as const) {
      const denied = await answer(before(root, tool, input));
      expect(denied.permission).toBe("deny");
      expect(denied.agent_message).toContain("SIGUIENTE: usa la misma ruta dentro de ella: `");
      expect(denied.agent_message).toContain(folder);
    }
    // Inside it, a read goes through, and a conversation that entered nothing reads anywhere.
    const inside = { target_file: join(folder, "src/app.ts") };
    expect((await answer(before(root, "Read", inside))).permission).toBe("allow");
    const free = await answer(before(await tempRepo(APP), "Read", inside));
    expect(free).toEqual({ permission: "allow" });
  });
});

describe("the check after each command in Cursor", () => {
  it("adds to the conversation what a command changed outside the task (AC1)", async () => {
    const root = await implementing();
    expect(await answer(shell(root, "preToolUse", "c1"))).toEqual({ permission: "allow" });
    await writeFiles(root, { "src/app.ts": "in scope\n", "src/other.ts": "generated\n" });
    const after = await answer(shell(root, "postToolUse", "c1"));
    expect(Object.keys(after)).toEqual(["additional_context"]);
    expect(after.additional_context).toMatch(
      /^specty: El comando cambió lo que el flujo no permite/,
    );
    expect(after.additional_context).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(after.additional_context).toContain(
      'pide ampliar el alcance con `specty scope add src/other.ts --task T1 --reason "<motivo>"`.',
    );
  });

  it("says nothing when the command stayed in the task, and checks failed ones too (AC1)", async () => {
    const root = await implementing();
    await shell(root, "preToolUse", "c2");
    await writeFiles(root, { "src/app.ts": "in scope\n" });
    expect(await answer(shell(root, "postToolUse", "c2"))).toEqual({});
    await shell(root, "preToolUse", "c3");
    await writeFiles(root, { "src/third.ts": "x\n" });
    const failed = await answer(shell(root, "postToolUseFailure", "c3"));
    expect(failed.additional_context).toContain("`src/third.ts` está fuera del alcance de T1.");
    // Without a snapshot from before the command, there is nothing to compare.
    expect(await answer(shell(root, "postToolUse", "unknown"))).toEqual({});
  });
});

/** Cursor's `preCompact` before it compacts conversation `c`: it only observes. */
const compacting = (root: string) =>
  cli(root, ["guard", "--tool", "cursor"], {
    stdin: JSON.stringify({
      hook_event_name: "preCompact",
      conversation_id: "c",
      workspace_roots: [root],
      trigger: "auto",
      context_usage_percent: 92,
    }),
  });

describe("the card after a compaction in Cursor", () => {
  it("comes with the next command's result, and only once (AC1, AC2)", async () => {
    const root = await implementing();
    expect(await answer(compacting(root))).toEqual({});
    await shell(root, "preToolUse", "c5");
    const after = await answer(shell(root, "postToolUse", "c5"));
    expect(after.additional_context).toContain("TAREA T1: Saludar por nombre");
    expect(after.additional_context).toBe((await cli(root, ["next"])).out);
    await shell(root, "preToolUse", "c6");
    expect(await answer(shell(root, "postToolUse", "c6"))).toEqual({});
  });

  it("comes after the command's own warning (AC1)", async () => {
    const root = await implementing();
    await compacting(root);
    await shell(root, "preToolUse", "c7");
    await writeFiles(root, { "src/other.ts": "generated\n" });
    const after = await answer(shell(root, "postToolUse", "c7"));
    expect(after.additional_context).toMatch(/^specty: El comando cambió/);
    expect(after.additional_context).toContain("TAREA T1: Saludar por nombre");
  });

  it("is not left outside a repository with Specty (AC2)", async () => {
    const root = await tempRepo({ "src/app.ts": "x\n" });
    expect(await answer(compacting(root))).toEqual({});
  });
});

describe("installing the check in Cursor", () => {
  it("writes `preCompact`, and doctor misses it (AC3)", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    await cli(root, ["init", "--language", "es", "--tools", "cursor"]);
    const config = JSON.parse(await read(root, ".cursor/hooks.json"));
    expect(config.hooks.preCompact).toEqual([
      { command: expect.stringContaining("guard --tool cursor") },
    ]);
    const hooks = { ...config.hooks, preCompact: [] };
    await writeFiles(root, { ".cursor/hooks.json": JSON.stringify({ ...config, hooks }) });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Cursor: falta la tarjeta de Specty tras compactar (preCompact); ejecuta `specty init --tools cursor`.",
    );
  });

  it("writes `postToolUse` and `postToolUseFailure`, and doctor misses them (AC5)", async () => {
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    expect((await cli(root, ["init", "--language", "es", "--tools", "cursor"])).code).toBe(0);
    const config = JSON.parse(await read(root, ".cursor/hooks.json"));
    for (const event of ["postToolUse", "postToolUseFailure"]) {
      expect(config.hooks[event]).toEqual([
        { command: expect.stringContaining("guard --tool cursor"), matcher: "Shell" },
      ]);
    }
    expect((await cli(root, ["doctor"])).out).toContain("Cursor: guard instalado.");
    const hooks = { ...config.hooks, postToolUseFailure: [] };
    await writeFiles(root, { ".cursor/hooks.json": JSON.stringify({ ...config, hooks }) });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Cursor: falta la comprobación tras cada comando (postToolUseFailure); ejecuta `specty init --tools cursor`.",
    );
  });
});

const SANDBOX = ".cursor/sandbox.json";
const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
/** The folders Specty's commands write in outside a change's folder: git's own and the worktrees'. */
const foldersOf = (root: string) => [
  join(root, ".git"),
  join(dirname(root), `${basename(root)}.worktrees`),
];
const sandboxOf = async (root: string) => JSON.parse(await read(root, SANDBOX));

describe("Cursor's sandbox and Specty's commits", () => {
  it("lets Specty write in git's folder and the worktrees', kept out of git, and doctor checks it (AC4)", async () => {
    const root = await tempRepo(PACKAGE);
    const init = await cli(root, ["init", "--language", "es", "--tools", "cursor"]);
    expect(init.out).toContain(
      "Cursor: .cursor/sandbox.json (local) deja escribir a los comandos de Specty en la carpeta de git y en la de las worktrees, que su sandbox deja fuera.",
    );
    expect((await sandboxOf(root)).additionalReadwritePaths).toEqual(foldersOf(root));
    expect(await read(root, ".git/info/exclude")).toContain(`/${SANDBOX}`);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect((await cli(root, ["doctor"])).out).toContain(
      "Cursor: su sandbox deja escribir a Specty en la carpeta de git y en la de las worktrees (.cursor/sandbox.json).",
    );

    // What the person had stays, and running init again adds nothing twice.
    const mine = { networkPolicy: { default: "deny" }, additionalReadwritePaths: ["/opt/cache"] };
    await writeFiles(root, { [SANDBOX]: JSON.stringify(mine) });
    await cli(root, ["init", "--tools", "cursor"]);
    await cli(root, ["init", "--tools", "cursor"]);
    expect(await sandboxOf(root)).toEqual({
      networkPolicy: { default: "deny" },
      additionalReadwritePaths: ["/opt/cache", ...foldersOf(root)],
    });

    await writeFiles(root, { [SANDBOX]: JSON.stringify(mine) });
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "Cursor: su sandbox no deja escribir a Specty en la carpeta de git de las worktrees, así que fallan sus commits; ejecuta `specty init --tools cursor`.",
    );
  });

  it("leaves a sandbox.json the person versions alone, and says what to add (AC4)", async () => {
    const root = await tempRepo({
      ...PACKAGE,
      [SANDBOX]: '{"networkPolicy":{"default":"deny"}}\n',
    });
    const init = await cli(root, ["init", "--language", "es", "--tools", "cursor"]);
    const [gitFolder, worktrees] = foldersOf(root);
    expect(init.out).toContain(
      `Cursor: .cursor/sandbox.json está en git, así que Specty no lo toca; añade \`${gitFolder}\`, \`${worktrees}\` a \`additionalReadwritePaths\` para que los commits de Specty funcionen en su sandbox.`,
    );
    expect(await sandboxOf(root)).toEqual({ networkPolicy: { default: "deny" } });
  });

  it("takes out only Specty's folders when uninstalling (AC4)", async () => {
    const root = await tempRepo(PACKAGE);
    await cli(root, ["init", "--language", "es", "--tools", "cursor"]);
    const sandbox = await sandboxOf(root);
    await writeFiles(root, {
      [SANDBOX]: JSON.stringify({
        ...sandbox,
        additionalReadwritePaths: ["/opt/cache", ...sandbox.additionalReadwritePaths],
      }),
    });
    await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(await sandboxOf(root)).toEqual({ additionalReadwritePaths: ["/opt/cache"] });
  });
});
