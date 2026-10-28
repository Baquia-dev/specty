// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activate } from "../src/extension";

/** A stand-in for the `vscode` module: what the extension asks of VS Code, recorded. */
const fake = vi.hoisted(() => {
  type Listener = (value: unknown) => unknown;
  function emitter() {
    const listeners = new Set<Listener>();
    return {
      event: (listener: Listener) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
      fire: (value: unknown) => {
        for (const listener of listeners) listener(value);
      },
    };
  }
  interface Item {
    text: string;
    tooltip: unknown;
    command: unknown;
    backgroundColor: unknown;
    shown: boolean;
    disposed: boolean;
  }
  interface Watcher {
    readonly pattern: unknown;
    readonly change: ReturnType<typeof emitter>;
    readonly create: ReturnType<typeof emitter>;
    readonly remove: ReturnType<typeof emitter>;
    disposed: boolean;
  }
  interface Folder {
    readonly uri: { readonly fsPath: string };
    readonly name: string;
    readonly index: number;
  }
  const folders: Folder[] = [];
  const items: Item[] = [];
  const watchers: Watcher[] = [];
  const executed: unknown[][] = [];
  const opened: string[] = [];
  const warnings: { readonly message: string; readonly items: readonly string[] }[] = [];
  const errors: string[] = [];
  const state = {
    folders,
    settings: new Map<string, unknown>(),
    language: "es",
    items,
    commands: new Map<string, (...args: unknown[]) => unknown>(),
    executed,
    opened,
    warnings,
    errors,
    watchers,
    focus: emitter(),
    configuration: emitter(),
  };

  class ThemeColor {
    readonly id: string;
    constructor(id: string) {
      this.id = id;
    }
  }
  class RelativePattern {
    readonly base: unknown;
    readonly pattern: string;
    constructor(base: unknown, pattern: string) {
      this.base = base;
      this.pattern = pattern;
    }
  }

  const vscode = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor,
    RelativePattern,
    Uri: { parse: (value: string) => ({ value, toString: () => value }) },
    window: {
      createStatusBarItem: () => {
        const item: Item = {
          text: "",
          tooltip: undefined,
          command: undefined,
          backgroundColor: undefined,
          shown: false,
          disposed: false,
        };
        items.push(item);
        return Object.assign(item, {
          show: () => {
            item.shown = true;
          },
          hide: () => {
            item.shown = false;
          },
          dispose: () => {
            item.disposed = true;
          },
        });
      },
      showWarningMessage: async (message: string, ...choices: string[]) => {
        warnings.push({ message, items: choices });
        return choices[0];
      },
      showErrorMessage: async (message: string) => {
        errors.push(message);
        return undefined;
      },
      onDidChangeWindowState: state.focus.event,
    },
    commands: {
      registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
        state.commands.set(id, handler);
        return { dispose: () => state.commands.delete(id) };
      },
      executeCommand: async (...args: unknown[]) => {
        executed.push(args);
        return undefined;
      },
    },
    workspace: {
      get workspaceFolders() {
        return folders;
      },
      getConfiguration: (section: string) => ({
        get: (key: string, fallback?: unknown) => {
          const name = `${section}.${key}`;
          return state.settings.has(name) ? state.settings.get(name) : fallback;
        },
      }),
      createFileSystemWatcher: (pattern: unknown) => {
        const watcher: Watcher = {
          pattern,
          change: emitter(),
          create: emitter(),
          remove: emitter(),
          disposed: false,
        };
        watchers.push(watcher);
        return {
          onDidChange: watcher.change.event,
          onDidCreate: watcher.create.event,
          onDidDelete: watcher.remove.event,
          dispose: () => {
            watcher.disposed = true;
          },
        };
      },
      onDidChangeConfiguration: state.configuration.event,
    },
    env: {
      get language() {
        return state.language;
      },
      openExternal: async (uri: { toString(): string }) => {
        opened.push(uri.toString());
        return true;
      },
      asExternalUri: async (uri: unknown) => uri,
    },
  };

  function reset(): void {
    for (const list of [folders, items, watchers, executed, opened, warnings, errors]) {
      list.splice(0);
    }
    state.settings.clear();
    state.commands.clear();
    state.language = "es";
  }

  return { state, vscode, reset };
});

vi.mock("vscode", () => fake.vscode);

const LINK = "http://localhost:4173/?token=abc_DEF-123";

/** A stand-in for `specty`: it notes each call, prints `status.json` and, for `ui`, its link. */
const SCRIPT = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const here = (name) => path.join(__dirname, name);
const args = process.argv.slice(2);
fs.appendFileSync(here("calls.log"), args.join(" ") + " @ " + process.cwd() + "\\n");
if (args.includes("status")) {
  process.stdout.write(fs.readFileSync(here("status.json"), "utf8"));
  process.exit(0);
}
if (args[0] === "ui") {
  process.on("SIGTERM", () => {
    fs.writeFileSync(here("stopped"), "");
    process.exit(0);
  });
  process.stdout.write("SPECTY · UI\\nAbre ${LINK} en el navegador.\\n");
  setInterval(() => undefined, 1000);
}
`;

interface Change {
  readonly id: string;
  readonly phase: string;
  readonly title: string;
  readonly waitingFor: string;
  readonly current: boolean;
}

/** What `specty --json status` prints with these open changes. */
function statusOf(changes: readonly Change[]) {
  const data = changes.map((change) => ({ ...change, kind: "standard", pendingScope: [] }));
  return {
    status: "ok",
    header: "SPECTY · estado",
    blocks: [],
    next: "",
    exitCode: 0,
    changes: data,
    delegated: false,
  };
}

const REVIEW: Change = {
  id: "20261028-saludo",
  phase: "review",
  title: "Saludo",
  waitingFor: "human",
  current: true,
};

/** The card of a `specty` from before the status came as data. */
const OLD_CARD = { status: "ok", header: "SPECTY · estado", blocks: [], next: "", exitCode: 0 };

type Context = { readonly subscriptions: { dispose(): unknown }[] };
const contexts: Context[] = [];

interface Options {
  /** Whether the folder has Specty (`.specty/config.yaml`); it has by default. */
  readonly specty?: boolean;
  /** Point `specty.path` to a command that does not exist. */
  readonly missing?: boolean;
  readonly status?: unknown;
}

/** Opens a folder in the fake VS Code, with a fake `specty`, and activates the extension. */
async function open(options: Options = {}) {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-repo-")));
  if (options.specty !== false) {
    await mkdir(join(folder, ".specty"));
    await writeFile(join(folder, ".specty", "config.yaml"), "version: 1\n");
  }
  const bin = await mkdtemp(join(tmpdir(), "specty-bin-"));
  await writeFile(join(bin, "specty"), SCRIPT, { mode: 0o755 });
  const setStatus = (status: unknown) =>
    writeFile(join(bin, "status.json"), JSON.stringify(status));
  await setStatus(options.status ?? statusOf([REVIEW]));
  fake.state.folders.push({ uri: { fsPath: folder }, name: "repo", index: 0 });
  fake.state.settings.set(
    "specty.path",
    join(bin, options.missing === true ? "missing" : "specty"),
  );
  const context: Context = { subscriptions: [] };
  contexts.push(context);
  activate(context);
  const calls = async () =>
    existsSync(join(bin, "calls.log"))
      ? (await readFile(join(bin, "calls.log"), "utf8")).trim().split("\n")
      : [];
  return {
    folder,
    bin,
    context,
    setStatus,
    calls,
    stopped: () => existsSync(join(bin, "stopped")),
  };
}

/** Closes the window: VS Code disposes what the extension subscribed. */
function close(context: Context): void {
  for (const subscription of context.subscriptions.splice(0)) subscription.dispose();
}

async function run(command: string): Promise<void> {
  await fake.state.commands.get(command)?.();
}

const until = (assertion: () => void) => vi.waitFor(assertion, { timeout: 4000 });
const bar = () => fake.state.items.find((item) => item.shown);

afterEach(() => {
  for (const context of contexts.splice(0)) close(context);
  fake.reset();
});

describe("the extension", () => {
  it("AC1: shows the folder's change, its phase and that it waits for the person", async () => {
    const { folder, calls } = await open();
    await until(() => expect(bar()?.text).toContain("Revisión"));
    expect(bar()?.text).toContain("te espera");
    expect(String(bar()?.tooltip)).toContain("20261028-saludo");
    expect(bar()?.command).toBe("specty.openUi");
    expect(await calls()).toContain(`--json status @ ${folder}`);
  });

  it("AC1: stays out of a folder without Specty", async () => {
    const { calls } = await open({ specty: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bar()).toBeUndefined();
    expect(await calls()).toEqual([]);
  });

  it("AC2: updates the status bar when a change's state.json changes", async () => {
    const { folder, setStatus } = await open();
    await until(() => expect(bar()?.text).toContain("Revisión"));
    const watcher = fake.state.watchers[0];
    expect(watcher?.pattern).toMatchObject({ pattern: ".specty/changes/*/state.json" });
    await setStatus(statusOf([{ ...REVIEW, phase: "implementing", waitingFor: "agent" }]));
    watcher?.change.fire({ fsPath: join(folder, ".specty/changes/20261028-saludo/state.json") });
    await until(() => expect(bar()?.text).toContain("Implementación"));
    expect(bar()?.text).not.toContain("te espera");
  });

  it("AC2: updates the status bar when the window gets the focus back and with a new specty.path", async () => {
    const { bin, setStatus } = await open();
    await until(() => expect(bar()?.text).toContain("Revisión"));
    await setStatus(statusOf([{ ...REVIEW, current: false }]));
    fake.state.focus.fire({ focused: true });
    await until(() => expect(bar()?.text).toContain("1 cambio abierto"));

    fake.state.settings.set("specty.path", join(bin, "missing"));
    fake.state.configuration.fire({
      affectsConfiguration: (section: string) => section === "specty" || section === "specty.path",
    });
    await until(() => expect(bar()?.text).toContain("$(warning)"));
  });

  it("AC3: opens the UI in the browser, starting `specty ui` once, and stops it with the window", async () => {
    const { folder, context, calls, stopped } = await open();
    await run("specty.openUi");
    expect(fake.state.opened).toEqual([LINK]);
    await run("specty.openUi");
    expect(fake.state.opened).toEqual([LINK, LINK]);
    expect((await calls()).filter((call) => call.startsWith("ui"))).toEqual([`ui @ ${folder}`]);
    expect(stopped()).toBe(false);
    close(context);
    await until(() => expect(stopped()).toBe(true));
  });

  it("AC4: warns when specty is missing and offers its setting", async () => {
    await open({ missing: true });
    await until(() => expect(bar()?.text).toContain("$(warning)"));
    await run("specty.openUi");
    expect(fake.state.warnings[0]?.message).toContain("npm install -g @baquia-dev/specty");
    expect(fake.state.warnings[0]?.message).toContain("specty.path");
    expect(fake.state.warnings[0]?.items).toEqual(["Abrir ajustes"]);
    expect(fake.state.executed).toContainEqual(["workbench.action.openSettings", "specty.path"]);
    expect(fake.state.opened).toEqual([]);
  });

  it("AC4: warns when specty does not give the status as data, without starting the UI", async () => {
    const { calls } = await open({ status: OLD_CARD });
    await until(() => expect(bar()?.text).toContain("$(warning)"));
    await run("specty.openUi");
    expect(fake.state.warnings[0]?.message).toContain("npm install -g @baquia-dev/specty@latest");
    expect((await calls()).filter((call) => call.startsWith("ui"))).toEqual([]);
    expect(fake.state.opened).toEqual([]);
  });
});
