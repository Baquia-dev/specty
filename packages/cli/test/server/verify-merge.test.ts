// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { renderText } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { changeRuns, type Run } from "../../src/server/runs";
import {
  CHANGE,
  CONFIG,
  cli,
  APP as FILES,
  git,
  inWorktree,
  person,
  read,
  SPEC_PATH,
  stateIn,
  toAcceptance,
  tryGit,
  writeFiles,
} from "../support";
import { sessionAt } from "./support";

/**
 * A full verification that says a line, lasts long enough for the server to see it live, and
 * counts its runs in the repository's `.git/runs`, from any worktree.
 */
const COUNTED = `echo verificando-lo-incorporado && sleep 2 && node -e "require('fs').appendFileSync(process.argv[1] + '/runs', 'x')" "$(git rev-parse --git-common-dir)"`;
const COUNTING = {
  ...FILES,
  ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(COUNTED)}\n`,
};
const MERGED = /Antes, main se incorporó a la rama del cambio \(merge [0-9a-f]{7}\)/;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Waits, in real time, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (!done()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await wait(20);
  }
}

/** How many full verifications ran in the clone of `root`. */
const counted = async (root: string) =>
  existsSync(join(root, ".git", "runs")) ? (await read(root, ".git/runs")).length : 0;

/** The change's audit in `folder`, oldest first. */
async function audit(folder: string): Promise<Readonly<Record<string, unknown>>[]> {
  const text = await read(folder, `.specty/changes/${CHANGE}/audit.jsonl`);
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

/** Main moves on in `root` with a file the change does not touch. */
async function mainMoves(root: string): Promise<void> {
  await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "otro trabajo en main");
}

/** Whether `folder` has a merge in progress. */
const merging = (folder: string) =>
  tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status === 0;

/**
 * The runs of `root`'s server, and what it heard of the change's: `ended` once the run that
 * started ends. `queued` is the server's queue of the person's actions.
 */
async function serverOf(root: string, queued?: <T>(task: () => Promise<T>) => Promise<T>) {
  const session = await sessionAt(root, person());
  const heard: (Run | undefined)[] = [];
  const runs = changeRuns(
    session,
    (id, run) => {
      if (id === CHANGE) heard.push(run);
    },
    queued,
  );
  const ended = () => until(() => heard.length > 1 && heard.at(-1) === undefined);
  const lines = () => heard.flatMap((run) => run?.output ?? []);
  return { runs, heard, ended, lines };
}

describe("«Verificar» of the UI when main moved on", () => {
  it("AC1: merges main, verifies the merged code once and live, and `accept` does not repeat it", async () => {
    const { root, folder } = await inWorktree(COUNTING);
    await toAcceptance(folder);
    await mainMoves(root);
    const server = await serverOf(root);
    try {
      const started = await server.runs.start(CHANGE);
      expect(started.status).toBe("ok");
      expect(renderText(started, "es")).toContain(
        "main avanzó: se incorpora a la rama del cambio y la verificación completa corre sobre el código incorporado:",
      );
      await server.ended();
    } finally {
      server.runs.close();
    }
    expect(server.lines()).toContain("verificando-lo-incorporado");
    expect(server.lines().some((line) => MERGED.test(line))).toBe(true);
    expect(await counted(root)).toBe(1);
    expect(merging(folder)).toBe(false);
    expect(tryGit(folder, "merge-base", "--is-ancestor", "main", "HEAD").status).toBe(0);
    expect(await read(folder, "src/other.ts")).toBe("export const other = 1;\n");
    const verified = (await audit(folder)).filter(({ event }) => event === "change.verified");
    expect(verified.at(-1)).toMatchObject({
      data: { cmd: COUNTED, exit: 0, tree: expect.stringMatching(/^sha256:/) },
    });
    const terminal = person();
    const accepted = await cli(folder, ["accept"], { terminal });
    expect(accepted.code).toBe(0);
    expect(accepted.out).not.toMatch(MERGED);
    expect(terminal.notes.join("\n")).toContain(
      "ya pasó con este mismo código en una verificación anterior: no se repite.",
    );
    expect(await counted(root)).toBe(1);
  });

  it("AC2: leaves a merge with conflicts for the agent, and a second «Verificar» says it waits", async () => {
    const { root, folder } = await inWorktree(COUNTING);
    await toAcceptance(folder);
    await writeFiles(root, { "src/app.ts": "main\n" });
    git(root, "commit", "-q", "-am", "main cambia el saludo");
    const main = git(root, "rev-parse", "main");
    const server = await serverOf(root);
    try {
      await server.runs.start(CHANGE);
      await server.ended();
      const again = await server.runs.start(CHANGE);
      expect(again.status).toBe("blocked");
      expect(renderText(again, "es")).toContain(
        "El agente aún resuelve la incorporación de main en esta carpeta.",
      );
    } finally {
      server.runs.close();
    }
    expect(server.lines()).toContain("main choca con este cambio.");
    expect(merging(folder)).toBe(true);
    expect(await stateIn(folder)).toMatchObject({
      phase: "acceptance",
      integration: { target: "main", commit: main, reason: "conflicts", conflicts: ["src/app.ts"] },
    });
    expect(await counted(root)).toBe(0);
    expect((await audit(folder)).some(({ event }) => event === "change.verified")).toBe(false);
  });

  it("AC2: leaves a merge whose verification fails for the agent, and says why", async () => {
    const config = `${CONFIG()}  full: "echo roto && exit 1"\n`;
    const { root, folder } = await inWorktree({ ...FILES, ".specty/config.yaml": config });
    await toAcceptance(folder);
    await mainMoves(root);
    const server = await serverOf(root);
    try {
      await server.runs.start(CHANGE);
      await server.ended();
    } finally {
      server.runs.close();
    }
    expect(server.lines()).toContain("Con main incorporado, `echo roto && exit 1` falla.");
    expect(server.lines()).toContain("  roto");
    expect(merging(folder)).toBe(true);
    expect(await stateIn(folder)).toMatchObject({
      phase: "acceptance",
      integration: { reason: "verify", conflicts: [], paths: ["src/app.ts", "src/other.ts"] },
    });
    expect((await audit(folder)).some(({ event }) => event === "change.verified")).toBe(false);
  });

  it("AC3: runs as before when main did not move on: no merge, the usual answer, its result", async () => {
    const { root, folder } = await inWorktree(COUNTING);
    await toAcceptance(folder);
    const head = git(folder, "rev-parse", "HEAD");
    const server = await serverOf(root);
    try {
      const started = await server.runs.start(CHANGE);
      expect(renderText(started, "es")).toContain(
        `Verificación completa en marcha: \`${COUNTED}\`.`,
      );
      expect(renderText(started, "es")).not.toContain("avanzó");
      await server.ended();
    } finally {
      server.runs.close();
    }
    expect(await counted(root)).toBe(1);
    expect(git(folder, "rev-parse", "HEAD")).toBe(head);
    expect(merging(folder)).toBe(false);
    expect((await audit(folder)).at(-1)).toMatchObject({
      event: "change.verified",
      data: { cmd: COUNTED, exit: 0 },
    });
  });

  it("AC4: the incorporation waits for the queue of the person's actions", async () => {
    const { root, folder } = await inWorktree(COUNTING);
    await toAcceptance(folder);
    await mainMoves(root);
    const head = git(folder, "rev-parse", "HEAD");
    let release: () => void = () => undefined;
    const busy = new Promise<void>((done) => {
      release = done;
    });
    const server = await serverOf(root, (task) => busy.then(task));
    try {
      await server.runs.start(CHANGE);
      // The run shows at once, but nothing merges while the queue is busy.
      expect(server.heard[0]).toMatchObject({ command: COUNTED });
      await wait(1000);
      expect(git(folder, "rev-parse", "HEAD")).toBe(head);
      expect(merging(folder)).toBe(false);
      expect(await counted(root)).toBe(0);
      release();
      await server.ended();
    } finally {
      server.runs.close();
    }
    expect(tryGit(folder, "merge-base", "--is-ancestor", "main", "HEAD").status).toBe(0);
    expect(await counted(root)).toBe(1);
  });
});

describe("«Verificar» of the UI when the incorporation stops without moving anything", () => {
  it("AC1: keeps its run, stopped and saying why, until the person presses it again, whose run does not carry it", async () => {
    const { root, folder } = await inWorktree(COUNTING);
    await toAcceptance(folder);
    await mainMoves(root);
    // Uncommitted here, a file main added: the merge would overwrite it, so it does not start.
    await writeFiles(folder, { "src/other.ts": "export const other = 2;\n" });
    const head = git(folder, "rev-parse", "HEAD");
    const server = await serverOf(root);
    try {
      await server.runs.start(CHANGE);
      await until(() => server.heard.at(-1)?.stopped === true);
      // Nothing after it: its end is the stopped run.
      await wait(600);
      const kept = server.runs.current(CHANGE);
      expect(kept).toMatchObject({ command: COUNTED, stopped: true });
      expect(kept?.output.join("\n")).toContain(
        "main también cambió archivos que aquí tienen cambios sin commit: el merge los pisaría, así que no empezó.",
      );
      expect(server.heard.at(-1)).toEqual(kept);
      expect(git(folder, "rev-parse", "HEAD")).toBe(head);
      expect(merging(folder)).toBe(false);
      expect(await counted(root)).toBe(0);
      await rm(join(folder, "src/other.ts"));
      const from = server.heard.length;
      await server.runs.start(CHANGE);
      expect(server.heard[from]).toMatchObject({ command: COUNTED });
      expect(server.heard[from]?.stopped).toBeUndefined();
      expect(server.runs.current(CHANGE)?.stopped).toBeUndefined();
      await server.ended();
      expect(server.heard.slice(from).some((run) => run?.stopped === true)).toBe(false);
      expect(server.runs.current(CHANGE)).toBeUndefined();
    } finally {
      server.runs.close();
    }
    expect(await counted(root)).toBe(1);
  });

  it("AC2: a run that leaves the merge to the agent ends as before, without staying", async () => {
    const { root, folder } = await inWorktree(COUNTING);
    await toAcceptance(folder);
    await writeFiles(root, { "src/app.ts": "main\n" });
    git(root, "commit", "-q", "-am", "main cambia el saludo");
    const server = await serverOf(root);
    try {
      await server.runs.start(CHANGE);
      await server.ended();
      await wait(600);
      expect(server.heard.at(-1)).toBeUndefined();
      expect(server.heard.some((run) => run?.stopped === true)).toBe(false);
      expect(server.runs.current(CHANGE)).toBeUndefined();
    } finally {
      server.runs.close();
    }
    expect(merging(folder)).toBe(true);
  });
});

/** The glossary of a project in Spanish, where a closing adds the terms it introduced. */
const GLOSSARY = "docs/dominio.md";
const TERMS = "# Dominio\n\n- Saludo: lo que dice la app al abrirse.\n";
const NAME = "\n- Nombre: cómo se llama quien abre la app.\n";
const CLOSING = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";

/** The first parent of the last merge in `folder`'s branch, the one that brought main in: its subject. */
const beforeMerge = (folder: string) =>
  git(folder, "log", "-1", "--format=%s", `${git(folder, "rev-list", "--merges", "-1", "HEAD")}^1`);

describe("«Verificar» of the UI with the closing sent when main changed the glossary it edits", () => {
  it("commits the closing first, merges main and verifies the merged code, without stopping", async () => {
    const { root, folder } = await inWorktree({ ...COUNTING, [GLOSSARY]: TERMS });
    await toAcceptance(folder);
    const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect(on.code).toBe(0);
    const spec = `${await read(folder, SPEC_PATH)}${CLOSING}`;
    await writeFiles(folder, { [SPEC_PATH]: spec, [GLOSSARY]: `${TERMS}${NAME}` });
    expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
    const main = TERMS.replace("# Dominio", "# Dominio de la app");
    await writeFiles(root, { [GLOSSARY]: main });
    git(root, "commit", "-q", "-am", "main cambia el glosario");
    const server = await serverOf(root);
    try {
      await server.runs.start(CHANGE);
      // It ends, or it stops and is kept.
      await until(() => {
        const last = server.heard.at(-1);
        return server.heard.length > 1 && (last === undefined || last.stopped === true);
      });
    } finally {
      server.runs.close();
    }
    expect(server.heard.some((run) => run?.stopped === true)).toBe(false);
    expect(server.lines().some((line) => MERGED.test(line))).toBe(true);
    expect(await counted(root)).toBe(1);
    expect(merging(folder)).toBe(false);
    expect(beforeMerge(folder)).toBe("docs(spec): cierre de Saludo personalizado");
    expect(await read(folder, GLOSSARY)).toBe(`${main}${NAME}`);
  });
});
