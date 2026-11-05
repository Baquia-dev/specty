// SPDX-License-Identifier: Apache-2.0
import { readdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import type { AgentTool } from "../../packages/core/src";
import { disposableRepo, git, openChanges, read, specty, write } from "./repo";
import type { Verdict } from "./scenarios";

/**
 * The suite's experiments (ARCHITECTURE §16): not whether the agent follows the flow, but what
 * the flow costs. Three quick changes in a row, in delegated mode, by the agent itself or each by
 * a subagent of its own, which starts with a context of its own; and an approved epic of three
 * slices, built in order or with a subagent per slice, as its card says. They take longer than a
 * scenario, and only run when `SPECTY_EVALS_SCENARIOS` names them.
 */

export type ExperimentId = "changes" | "changes-subagent" | "epic" | "epic-subagent";

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

/** The epic: three slices that can start at once, each one a constant of FIXES. */
const EPIC_TITLE = "Constantes nuevas";
const EPIC_SPEC = `---
kind: epic
---

# ${EPIC_TITLE}

## Objetivo

Las tres constantes de la demo cambian de valor, cada una en su propio corte.

## Fuera de alcance

- Cualquier otro archivo de la demo.

## Supuestos

- A1: Ningún otro código usa estas constantes.

## Criterios de aceptación

- AC1: CUANDO se importa \`a\` de src/a.ts ENTONCES vale 2.
- AC2: CUANDO se importa \`b\` de src/b.ts ENTONCES vale 3.
- AC3: CUANDO se importa \`c\` de src/c.ts ENTONCES vale 4.

## Cortes

- C1: La constante a vale 2
  - ac: AC1
- C2: La constante b vale 3
  - ac: AC2
- C3: La constante c vale 4
  - ac: AC3
`;
/** Each change in its own worktree, with nothing to install in it, and a verification that passes. */
const EPIC_CONFIG = 'version: 1\nlanguage: es\ngit:\n  setup: false\nverify:\n  default: "true"\n';
/** The same errand in order and with subagents: the epic's card decides how its slices go. */
const EPIC_ERRAND = `Construye la épica aprobada «${EPIC_TITLE}», que está en su carpeta de .worktrees/: haz cada uno de sus cortes, de la spec al cierre, siguiendo \`specty next\`. Estás en modo delegado: aprueba, acepta y cierra tú. Termina cuando todos sus cortes estén cerrados, sin pasar la épica a aceptación.`;
/** In order, the agent does three standard changes, and moves between their folders. */
const EPIC_TURNS = 200;
const EPIC_MINUTES = 45;
/** The archived spec of an epic's slice. */
const SLICE = /^slice: /m;

/** A repository with Specty for `tool`, its decisions delegated by the person, and `extra`. */
async function delegated(
  tool: AgentTool,
  extra: Readonly<Record<string, string>>,
  config = CONFIG,
) {
  const root = await disposableRepo(FILES);
  await specty(root, ["init", "--language", "es", "--tools", tool]);
  await write(root, { ".specty/config.yaml": config, ...extra });
  await specty(root, ["delegate", "on"], { person: true, choose: "yes" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "chore: specty");
  return root;
}

/**
 * An approved epic in its own folder of `.worktrees/`, in a repository like `delegated`'s, as a
 * person leaves it for another session: no conversation holds it, and its state was last written
 * two hours ago, so `next` in the main folder offers to resume it. With `subagents` off, its card
 * goes slice by slice.
 */
async function approvedEpic(tool: AgentTool, subagents: boolean): Promise<string> {
  const config = subagents ? EPIC_CONFIG : `${EPIC_CONFIG}subagents: false\n`;
  const root = await delegated(tool, {}, config);
  await succeed(root, ["new", "--kind", "epic", EPIC_TITLE]);
  const [id = ""] = await readdir(join(root, ".worktrees"));
  const folder = join(root, ".worktrees", id);
  await write(folder, { [`.specty/changes/${id}/spec.md`]: EPIC_SPEC });
  await succeed(folder, ["propose"]);
  await succeed(folder, ["approve"], { person: true });
  const before = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(join(folder, ".specty", "changes", id, "state.json"), before, before);
  return root;
}

/** `specty <argv>` in `root`, which the preparation needs to go through. */
async function succeed(
  root: string,
  argv: readonly string[],
  options: { readonly person?: boolean } = {},
): Promise<void> {
  const { code, out } = await specty(root, argv, options);
  if (code !== 0) throw new Error(`specty ${argv.join(" ")} (${code}): ${out}`);
}

/** The files of FIXES that changed, and how many were fixed. */
async function fixesIn(
  root: string,
): Promise<{ readonly changed: string[]; readonly fixed: number }> {
  const changed: string[] = [];
  let fixed = 0;
  for (const [path, [before, after]] of Object.entries(FIXES)) {
    const now = await read(root, path);
    if (now !== before) changed.push(path);
    if (now === after) fixed += 1;
  }
  return { changed, fixed };
}

/** Three fixes with three closed changes comply; code without any change of Specty violates. */
async function judge(root: string): Promise<Verdict> {
  const { changed, fixed } = await fixesIn(root);
  const closed = (await archivedSpecs(root)).length;
  if (changed.length > 0 && closed === 0 && (await openChanges(root)).length === 0) {
    return { outcome: "violated", reason: `código sin un cambio de Specty: ${changed.join(", ")}` };
  }
  return fixed === 3 && closed >= 3 ? { outcome: "followed" } : { outcome: "stalled" };
}

/**
 * The epic's slices land in the main folder as they close: its three fixes with three closed
 * slices comply, and a changed file that no closed slice's spec names is code without a change
 * of Specty. The epic is always open, so its own spec never names one.
 */
async function judgeEpic(root: string): Promise<Verdict> {
  const { changed, fixed } = await fixesIn(root);
  const slices = (await archivedSpecs(root)).filter((spec) => SLICE.test(spec));
  const loose = changed.filter((path) => !slices.some((spec) => spec.includes(path)));
  if (loose.length > 0) {
    return { outcome: "violated", reason: `código sin un cambio de Specty: ${loose.join(", ")}` };
  }
  return fixed === 3 && slices.length >= 3 ? { outcome: "followed" } : { outcome: "stalled" };
}

/** The spec of each change the archive keeps, of any year; empty for one without it. */
async function archivedSpecs(root: string): Promise<string[]> {
  const archive = join(root, ".specty", "archive");
  const years = await readdir(archive).catch(() => []);
  const folders = await Promise.all(
    years.map(async (year) =>
      (await readdir(join(archive, year)).catch(() => [])).map((id) => join(year, id)),
    ),
  );
  return Promise.all(
    folders.flat().map(async (folder) => (await read(archive, join(folder, "spec.md"))) ?? ""),
  );
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
  {
    id: "epic",
    prompt: EPIC_ERRAND,
    turns: EPIC_TURNS,
    minutes: EPIC_MINUTES,
    prepare: (tool) => approvedEpic(tool, false),
    judge: judgeEpic,
  },
  {
    id: "epic-subagent",
    prompt: EPIC_ERRAND,
    turns: EPIC_TURNS,
    minutes: EPIC_MINUTES,
    prepare: (tool) => approvedEpic(tool, true),
    judge: judgeEpic,
  },
];

/** The experiments `SPECTY_EVALS_SCENARIOS` names: none without it, since they take long. */
export function namedExperiments(variable: string | undefined): Experiment[] {
  const wanted = variable?.split(",").map((id) => id.trim()) ?? [];
  return EXPERIMENTS.filter((each) => wanted.includes(each.id));
}
