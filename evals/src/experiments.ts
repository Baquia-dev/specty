// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentTool } from "../../packages/core/src";
import { disposableRepo, git, openChanges, read, specty, write } from "./repo";
import type { Verdict } from "./scenarios";

/**
 * The suite's experiments (ARCHITECTURE §16): not whether the agent follows the flow, but what
 * the flow costs. Three quick changes in a row, in delegated mode, by the agent itself or each by
 * a subagent of its own, which starts with a context of its own. They take longer than a
 * scenario, and only run when `SPECTY_EVALS_SCENARIOS` names them.
 */

export type ExperimentId = "changes" | "changes-subagent";

export interface Experiment {
  readonly id: ExperimentId;
  /** The errand, as the user would write it. */
  readonly prompt: string;
  /** The model's turns and the minutes a run may take. */
  readonly turns: number;
  readonly minutes: number;
  prepare(tool: AgentTool): Promise<string>;
  judge(root: string): Promise<Verdict>;
}

/** Each file to fix: as it starts, and as the errand leaves it. */
const FIXES: Readonly<Record<string, readonly [string, string]>> = {
  "src/a.ts": ["export const a = 1;\n", "export const a = 2;\n"],
  "src/b.ts": ["export const b = 1;\n", "export const b = 3;\n"],
  "src/c.ts": ["export const c = 1;\n", "export const c = 4;\n"],
};
const FILES = {
  "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  ...Object.fromEntries(Object.entries(FIXES).map(([path, [before]]) => [path, before])),
};
/** Changes in this folder, and a verification that always passes. */
const CONFIG = 'version: 1\nlanguage: es\ngit:\n  worktrees: false\nverify:\n  default: "true"\n';
const ERRAND =
  "Haz estos tres arreglos, cada uno como un cambio quick propio de Specty, uno tras otro: en src/a.ts, que `a` valga 2; en src/b.ts, que `b` valga 3; en src/c.ts, que `c` valga 4. Estás en modo delegado: aprueba, acepta y cierra tú.";
const SUBAGENT_PATH = ".claude/agents/specty-change.md";
/** Claude Code's subagent for one change, from its spec to its closing. */
const SUBAGENT = `---
name: specty-change
description: Hace un cambio completo con Specty, de la spec al cierre, y devuelve un informe breve. Úsalo para cada cambio que pida la persona.
---

Eres el agente de un solo cambio de Specty. Recibes la petición literal de la persona. Ejecuta \`specty next\` y sigue su salida hasta la línea \`SIGUIENTE:\`, paso a paso, hasta cerrar el cambio. Al terminar, responde en tres líneas: qué cambió, qué se verificó y qué queda pendiente.
`;

const TURNS = 150;
const MINUTES = 30;

/** A repository with Specty for `tool`, its decisions delegated by the person, and `extra`. */
async function delegated(tool: AgentTool, extra: Readonly<Record<string, string>>) {
  const root = await disposableRepo(FILES);
  await specty(root, ["init", "--language", "es", "--tools", tool]);
  await write(root, { ".specty/config.yaml": CONFIG, ...extra });
  await specty(root, ["delegate", "on"], { person: true, choose: "yes" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "chore: specty");
  return root;
}

/** Three fixes with three closed changes comply; code without any change of Specty violates. */
async function judge(root: string): Promise<Verdict> {
  const changed: string[] = [];
  let fixed = 0;
  for (const [path, [before, after]] of Object.entries(FIXES)) {
    const now = await read(root, path);
    if (now !== before) changed.push(path);
    if (now === after) fixed += 1;
  }
  const closed = await archived(root);
  if (changed.length > 0 && closed === 0 && (await openChanges(root)).length === 0) {
    return { outcome: "violated", reason: `código sin un cambio de Specty: ${changed.join(", ")}` };
  }
  return fixed === 3 && closed >= 3 ? { outcome: "followed" } : { outcome: "stalled" };
}

/** How many changes the archive keeps, of any year. */
async function archived(root: string): Promise<number> {
  const archive = join(root, ".specty", "archive");
  const years = await readdir(archive).catch(() => []);
  const counts = await Promise.all(
    years.map(async (year) => (await readdir(join(archive, year)).catch(() => [])).length),
  );
  return counts.reduce((total, count) => total + count, 0);
}

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: "changes",
    prompt: ERRAND,
    turns: TURNS,
    minutes: MINUTES,
    prepare: (tool) => delegated(tool, {}),
    judge,
  },
  {
    id: "changes-subagent",
    prompt: `${ERRAND} Haz cada cambio con el subagente specty-change: dale la petición de ese arreglo y espera su informe antes de pasar al siguiente.`,
    turns: TURNS,
    minutes: MINUTES,
    prepare: (tool) => delegated(tool, { [SUBAGENT_PATH]: SUBAGENT }),
    judge,
  },
];

/** The experiments `SPECTY_EVALS_SCENARIOS` names: none without it, since they take long. */
export function namedExperiments(variable: string | undefined): Experiment[] {
  const wanted = variable?.split(",").map((id) => id.trim()) ?? [];
  return EXPERIMENTS.filter((each) => wanted.includes(each.id));
}
