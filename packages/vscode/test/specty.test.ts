// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readStatus, startUi } from "../src/specty";

const LINK = "http://localhost:4173/?token=abc_DEF-123";

/**
 * A stand-in for `specty`: it notes each call and its folder, prints the status of
 * `settings.json` and, for `ui`, its link (or nothing, or a failure) until it is stopped. It
 * listens for the stop before anything else, so a stop that comes early still leaves its mark.
 */
const SCRIPT = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const here = (name) => path.join(__dirname, name);
process.on("SIGTERM", () => {
  fs.writeFileSync(here("stopped"), "");
  process.exit(0);
});
const args = process.argv.slice(2);
fs.appendFileSync(here("calls.log"), args.join(" ") + " @ " + process.cwd() + "\\n");
const settings = JSON.parse(fs.readFileSync(here("settings.json"), "utf8"));
if (args.includes("status")) {
  process.stdout.write(settings.status);
  process.exit(settings.statusExit);
}
if (args[0] === "ui") {
  if (settings.ui === "exit") {
    process.stderr.write("specty: el puerto 4173 está ocupado\\n");
    process.exit(1);
  }
  if (settings.ui === "link") process.stdout.write("SPECTY · UI\\nAbre ${LINK} en el navegador.\\n");
  setInterval(() => undefined, 1000);
}
`;

/** What `specty --json status` prints: the card, and the open changes as data. */
const STATUS = {
  status: "ok",
  header: "SPECTY · estado",
  blocks: [],
  next: "te toca decidir en 20261028-saludo: `specty approve`.",
  exitCode: 0,
  changes: [
    {
      id: "20261028-saludo",
      kind: "standard",
      phase: "review",
      title: "Saludo",
      waitingFor: "human",
      current: true,
      pendingScope: [],
    },
    {
      id: "20261028-otro",
      kind: "quick",
      phase: "implementing",
      title: "Otro",
      waitingFor: "agent",
      current: false,
      pendingScope: [],
      folder: "../repo.worktrees/20261028-otro",
    },
  ],
  delegated: false,
};

interface Behavior {
  /** What the status prints: STATUS by default, as JSON unless it is already text. */
  readonly status?: unknown;
  readonly statusExit?: number;
  readonly ui?: "link" | "silent" | "exit";
}

async function fakeSpecty(behavior: Behavior = {}) {
  const bin = await mkdtemp(join(tmpdir(), "specty-bin-"));
  const command = join(bin, "specty");
  await writeFile(command, SCRIPT, { mode: 0o755 });
  const status = behavior.status ?? STATUS;
  await writeFile(
    join(bin, "settings.json"),
    JSON.stringify({
      status: typeof status === "string" ? status : JSON.stringify(status),
      statusExit: behavior.statusExit ?? 0,
      ui: behavior.ui ?? "link",
    }),
  );
  const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-repo-")));
  const calls = async () =>
    existsSync(join(bin, "calls.log"))
      ? (await readFile(join(bin, "calls.log"), "utf8")).trim().split("\n")
      : [];
  return { bin, command, folder, calls, stopped: () => existsSync(join(bin, "stopped")) };
}

describe("reading the status", () => {
  it("AC1: reads the open changes from `specty --json status`, run in the folder", async () => {
    const { command, folder, calls } = await fakeSpecty();
    const read = await readStatus(command, folder);
    expect(read).toMatchObject({
      kind: "status",
      status: {
        delegated: false,
        changes: [
          {
            id: "20261028-saludo",
            phase: "review",
            title: "Saludo",
            waitingFor: "human",
            current: true,
          },
          {
            id: "20261028-otro",
            phase: "implementing",
            title: "Otro",
            waitingFor: "agent",
            current: false,
            folder: "../repo.worktrees/20261028-otro",
          },
        ],
      },
    });
    expect(await calls()).toEqual([`--json status @ ${folder}`]);
  });

  it("AC4: says the command is missing", async () => {
    const { bin, folder } = await fakeSpecty();
    expect(await readStatus(join(bin, "missing"), folder)).toEqual({ kind: "missing" });
    expect(await startUi(join(bin, "missing"), folder)).toEqual({ kind: "missing" });
  });

  it("AC4: says specty is outdated when its status brings no changes as data", async () => {
    const { status, header, blocks, next, exitCode } = STATUS;
    const card = { status, header, blocks, next, exitCode };
    const { command, folder } = await fakeSpecty({ status: card });
    expect(await readStatus(command, folder)).toEqual({ kind: "outdated" });
  });

  it("fails with the CLI's reason when it cannot give the status", async () => {
    const blocked = {
      status: "blocked",
      header: "SPECTY",
      blocks: [{ lines: ["Specty no está configurado en esta carpeta."] }],
      next: "ejecuta `specty init`.",
      exitCode: 2,
    };
    const refused = await fakeSpecty({ status: blocked, statusExit: 2 });
    const read = await readStatus(refused.command, refused.folder);
    expect(read.kind).toBe("failed");
    expect(read.kind === "failed" ? read.message : "").toContain("specty init");

    const garbled = await fakeSpecty({ status: "esto no es JSON" });
    expect((await readStatus(garbled.command, garbled.folder)).kind).toBe("failed");
  });
});

describe("starting the UI", () => {
  it("AC3: starts `specty ui` in the folder, gives its link and stops it", async () => {
    const { command, folder, calls, stopped } = await fakeSpecty();
    const started = await startUi(command, folder);
    expect(started.kind).toBe("started");
    if (started.kind !== "started") return;
    expect(started.server.link).toBe(LINK);
    expect(await calls()).toEqual([`ui @ ${folder}`]);
    started.server.stop();
    await started.server.exited;
    expect(stopped()).toBe(true);
  });

  it("AC3: fails when `specty ui` ends without a link, or gives none in time", async () => {
    const ended = await fakeSpecty({ ui: "exit" });
    const refused = await startUi(ended.command, ended.folder);
    expect(refused.kind).toBe("failed");
    expect(refused.kind === "failed" ? refused.message : "").toContain("ocupado");

    // Two seconds: time enough for Node to start the stand-in even on a busy machine, so the
    // stop it gets is the one for not giving a link.
    const silent = await fakeSpecty({ ui: "silent" });
    expect((await startUi(silent.command, silent.folder, 2000)).kind).toBe("failed");
    await vi.waitFor(() => expect(silent.stopped()).toBe(true), { timeout: 4000 });
  }, 10_000);
});
