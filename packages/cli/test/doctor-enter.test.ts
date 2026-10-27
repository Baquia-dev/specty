// SPDX-License-Identifier: Apache-2.0
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { cli, read, tempRepo, writeFiles } from "./support";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };

const init = (root: string, tool: string) =>
  cli(root, ["init", "--language", "es", "--tools", tool]);

/** What `doctor` says of an agent's file from before `specty enter`. */
const outdated = (agent: string, file: string, tool: string) =>
  `${agent}: ${file} es de antes de \`specty enter\`, así que no lleva sus acciones a la carpeta de un cambio; ejecuta \`specty init --tools ${tool}\`.`;

/** `doctor`'s output, and whether it says `line`. */
async function says(root: string, line: string): Promise<boolean> {
  const doctor = await cli(root, ["doctor"]);
  if (doctor.out.includes(line)) expect(doctor.code).toBe(1);
  return doctor.out.includes(line);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A JSON settings file of the repository, changed by `update`. */
async function rewrite(
  root: string,
  file: string,
  update: (value: Record<string, unknown>) => unknown,
): Promise<void> {
  const value: unknown = parse(await read(root, file));
  await writeFiles(root, {
    [file]: JSON.stringify(update(isObject(value) ? value : {}), null, 2),
  });
}

/** `hooks` with the guard of `tool` under `event` given `matcher`, as an older install had it. */
function withMatcher(hooks: unknown, event: string, tool: string, matcher: string) {
  const all = isObject(hooks) ? hooks : {};
  const entries: unknown[] = Array.isArray(all[event]) ? all[event] : [];
  const older = (entry: unknown) =>
    isObject(entry) && JSON.stringify(entry).includes(`guard --tool ${tool}`)
      ? { ...entry, matcher }
      : entry;
  return { ...all, [event]: entries.map(older) };
}

describe("doctor and an install from before specty enter", () => {
  it("names Gemini CLI's settings without the reads or the worktrees' folder (AC1, AC2)", async () => {
    const root = await tempRepo(PACKAGE);
    await init(root, "gemini-cli");
    const file = ".gemini/settings.json";
    const line = outdated("Gemini CLI", file, "gemini-cli");
    expect(await says(root, line)).toBe(false);
    await rewrite(root, file, (value) => ({
      ...value,
      hooks: withMatcher(
        value.hooks,
        "BeforeTool",
        "gemini-cli",
        "run_shell_command|write_file|replace",
      ),
    }));
    expect(await says(root, line)).toBe(true);
    await init(root, "gemini-cli");
    expect(await says(root, line)).toBe(false);
    await rewrite(root, file, ({ context: _, ...rest }) => rest);
    expect(await says(root, line)).toBe(true);
  });

  it("leaves Gemini CLI's settings kept in git, which init gives no machine path (AC3)", async () => {
    const root = await tempRepo({ ...PACKAGE, ".gemini/settings.json": "{}\n" });
    await init(root, "gemini-cli");
    expect(await says(root, outdated("Gemini CLI", ".gemini/settings.json", "gemini-cli"))).toBe(
      false,
    );
  });

  it("names OpenCode's plugin that does not run the rewritten input, and its settings without the worktrees (AC1, AC2)", async () => {
    const root = await tempRepo(PACKAGE);
    await init(root, "opencode");
    const plugin = ".opencode/plugins/specty.js";
    const line = outdated("OpenCode", plugin, "opencode");
    expect(await says(root, line)).toBe(false);
    const text = await read(root, plugin);
    await writeFiles(root, { [plugin]: text.replace("redirects: true", "older: true") });
    expect(await says(root, line)).toBe(true);
    await init(root, "opencode");
    expect(await says(root, line)).toBe(false);
    const settings = ".opencode/opencode.jsonc";
    await rm(join(root, settings));
    expect(await says(root, outdated("OpenCode", settings, "opencode"))).toBe(true);
  });

  it("leaves OpenCode's settings kept in git (AC3)", async () => {
    const root = await tempRepo({ ...PACKAGE, ".opencode/opencode.jsonc": "{}\n" });
    await init(root, "opencode");
    const line = outdated("OpenCode", ".opencode/opencode.jsonc", "opencode");
    expect(await says(root, line)).toBe(false);
  });

  it("names Codex's rules without cd, and its missing config.toml (AC1, AC2)", async () => {
    const root = await tempRepo(PACKAGE);
    await init(root, "codex");
    const rules = ".codex/rules/specty.rules";
    const line = outdated("Codex", rules, "codex");
    expect(await says(root, line)).toBe(false);
    const text = await read(root, rules);
    await writeFiles(root, { [rules]: text.slice(0, text.indexOf("# A `cd`")) });
    expect(await says(root, line)).toBe(true);
    await init(root, "codex");
    expect(await says(root, line)).toBe(false);
    await rm(join(root, ".codex/config.toml"));
    expect(await says(root, outdated("Codex", ".codex/config.toml", "codex"))).toBe(true);
  });

  it("leaves a config.toml of the person's, which init does not touch (AC3)", async () => {
    const root = await tempRepo({ ...PACKAGE, ".codex/config.toml": 'model = "gpt-5.5"\n' });
    await init(root, "codex");
    expect(await says(root, outdated("Codex", ".codex/config.toml", "codex"))).toBe(false);
  });

  it("names Antigravity's hook without the reads (AC1, AC2)", async () => {
    const root = await tempRepo(PACKAGE);
    await init(root, "antigravity");
    const file = ".agents/hooks.json";
    const line = outdated("Antigravity", file, "antigravity");
    expect(await says(root, line)).toBe(false);
    const older =
      "run_command|write_to_file|replace_file_content|multi_replace_file_content|manage_task";
    await rewrite(root, file, (value) => ({
      ...value,
      specty: withMatcher(value.specty, "PreToolUse", "antigravity", older),
    }));
    expect(await says(root, line)).toBe(true);
    await init(root, "antigravity");
    expect(await says(root, line)).toBe(false);
  });

  it("names Devin's hooks without the reads, and its local settings without the worktrees (AC1, AC2)", async () => {
    const root = await tempRepo(PACKAGE);
    await init(root, "windsurf");
    const hooks = ".devin/hooks.v1.json";
    const line = outdated("Devin (Windsurf)", hooks, "windsurf");
    expect(await says(root, line)).toBe(false);
    const older = "^(exec|write|edit|notebook_edit|apply_patch|write_to_process)$";
    await rewrite(root, hooks, (value) => withMatcher(value, "PreToolUse", "windsurf", older));
    expect(await says(root, line)).toBe(true);
    await init(root, "windsurf");
    expect(await says(root, line)).toBe(false);
    const local = ".devin/config.local.json";
    await rewrite(root, local, (value) => {
      const permissions = isObject(value.permissions) ? value.permissions : {};
      const allow = Array.isArray(permissions.allow) ? permissions.allow : [];
      const writes = allow.filter((rule) => !String(rule).startsWith("Read("));
      return { ...value, permissions: { ...permissions, allow: writes } };
    });
    expect(await says(root, outdated("Devin (Windsurf)", local, "windsurf"))).toBe(true);
  });

  it("leaves Devin's local settings kept in git (AC3)", async () => {
    const root = await tempRepo({ ...PACKAGE, ".devin/config.local.json": "{}\n" });
    await init(root, "windsurf");
    const line = outdated("Devin (Windsurf)", ".devin/config.local.json", "windsurf");
    expect(await says(root, line)).toBe(false);
  });

  it("names Cursor's hooks without the reads (AC1, AC2)", async () => {
    const root = await tempRepo(PACKAGE);
    await init(root, "cursor");
    const file = ".cursor/hooks.json";
    const line = outdated("Cursor", file, "cursor");
    expect(await says(root, line)).toBe(false);
    await rewrite(root, file, (value) => ({
      ...value,
      hooks: withMatcher(value.hooks, "preToolUse", "cursor", "Write|Delete|Shell"),
    }));
    expect(await says(root, line)).toBe(true);
    await init(root, "cursor");
    expect(await says(root, line)).toBe(false);
  });
});
