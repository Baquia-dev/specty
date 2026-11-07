// SPDX-License-Identifier: Apache-2.0
import { readdir, utimes } from "node:fs/promises";
import { basename, join } from "node:path";
import type { AgentTool } from "../../packages/core/src";
import { answerOf, subagentCommandsOf } from "./agents";
import { disposableRepo, git, openChanges, read, specty, write } from "./repo";
import type { Verdict } from "./scenarios";

/**
 * The suite's experiments (ARCHITECTURE §16): not whether the agent follows the flow, but what
 * the flow costs. Three quick changes, in delegated mode, by the agent itself or each by a
 * subagent, which starts with a context of its own, as the card without an active change hands
 * them out; and an approved epic of three slices, built in order or with a subagent per slice, as
 * its card says. And a change whose spec needs what the user did not say, which its subagent
 * takes back to the session as a question; and an approved change that no conversation holds,
 * which the session hands to a subagent to resume. They take longer than a scenario, and only run
 * when `SPECTY_EVALS_SCENARIOS` names them.
 */

export type ExperimentId =
  | "changes"
  | "changes-subagent"
  | "epic"
  | "epic-subagent"
  | "question"
  | "orphan";

export interface Experiment {
  readonly id: ExperimentId;
  /** The errand, as the user would write it. */
  readonly prompt: string;
  /** The model's turns and the minutes a run may take. */
  readonly turns: number;
  readonly minutes: number;
  prepare(tool: AgentTool): Promise<string>;
  /** By the repository and, where it does not tell, by the run's transcript. */
  judge(root: string, transcript?: string): Promise<Verdict>;
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
/**
 * Each change in its own worktree, with nothing to install in it, and a verification that always
 * passes. Subagents in parallel need the folders: in this one, a second `new` waits for the first
 * change to finish.
 */
const CONFIG = 'version: 1\nlanguage: es\ngit:\n  setup: false\nverify:\n  default: "true"\n';
/** The same errand by the agent and with subagents: the card without an active change decides. */
const ERRAND =
  "Haz estos tres arreglos, cada uno como un cambio quick propio de Specty: en src/a.ts, que `a` valga 2; en src/b.ts, que `b` valga 3; en src/c.ts, que `c` valga 4. Estás en modo delegado: aprueba, acepta y cierra tú.";

/** A function that needs a discount no file of the repository tells. */
const DISCOUNT = "src/descuento.ts";
const QUESTION_ERRAND = `Añade en ${DISCOUNT} una función \`conDescuento(precio)\` que aplique el descuento de la campaña de primavera. Estás en modo delegado: aprueba, acepta y cierra tú.`;
/** The command a subagent's brief creates its change with. */
const SUBAGENT_NEW = /\bnew\s[\s\S]*--subagent\b/;

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
/** The same errand in order and with subagents: the epic's card decides how its slices go. */
const EPIC_ERRAND = `Construye la épica aprobada «${EPIC_TITLE}», que está en su carpeta de .worktrees/: haz cada uno de sus cortes, de la spec al cierre, siguiendo \`specty next\`. Estás en modo delegado: aprueba, acepta y cierra tú. Termina cuando todos sus cortes estén cerrados, sin pasar la épica a aceptación.`;
/** In order, the agent does three standard changes, and moves between their folders. */
const EPIC_TURNS = 200;
const EPIC_MINUTES = 45;
/** The archived spec of an epic's slice. */
const SLICE = /^slice: /m;

/** The orphan: an approved quick change that fixes the first file of FIXES. */
const ORPHAN_FILE = "src/a.ts";
const ORPHAN_TITLE = "La constante a vale 2";
const ORPHAN_SPEC = `---
kind: quick
---

# ${ORPHAN_TITLE}

## Objetivo

La constante \`a\` de la demo pasa a valer 2.

## Archivos

- modificar ${ORPHAN_FILE} — el valor de la constante

## Tareas

- [ ] T1: ${ORPHAN_TITLE}
  - files: ${ORPHAN_FILE}
  - type: fix
`;
/** The errand names the change: how to resume it is up to the card. */
const ORPHAN_ERRAND = `Sigue con el cambio «${ORPHAN_TITLE}», que dejé aprobado en su carpeta de .worktrees/, hasta cerrarlo. Estás en modo delegado: aprueba, acepta y cierra tú.`;
/** Where the preparation notes the orphan's id: the throwaway repository's own git configuration. */
const ORPHAN_KEY = "evals.orphan";

/**
 * A repository with Specty for `tool`, its decisions delegated by the person; with `subagents`
 * off, neither the changes nor an epic's slices go to subagents.
 */
async function delegated(tool: AgentTool, subagents = true) {
  const root = await disposableRepo(FILES);
  await specty(root, ["init", "--language", "es", "--tools", tool]);
  const config = subagents ? CONFIG : `${CONFIG}subagents: false\n`;
  await write(root, { ".specty/config.yaml": config });
  await specty(root, ["delegate", "on"], { person: true, choose: "yes" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "chore: specty");
  return root;
}

/**
 * A change of `kind` with `spec`, approved in its own folder of `.worktrees/` of `root`, as a
 * person leaves it for another session: no conversation holds it, and its state was last written
 * two hours ago, so `next` in the main folder offers to resume it. Its id.
 */
async function leftApproved(
  root: string,
  kind: "epic" | "quick",
  title: string,
  spec: string,
): Promise<string> {
  await succeed(root, ["new", "--kind", kind, title]);
  const [id = ""] = await readdir(join(root, ".worktrees"));
  const folder = join(root, ".worktrees", id);
  await write(folder, { [`.specty/changes/${id}/spec.md`]: spec });
  await succeed(folder, ["propose"]);
  await succeed(folder, ["approve"], { person: true });
  const before = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(join(folder, ".specty", "changes", id, "state.json"), before, before);
  return id;
}

/** The approved epic, in a repository like `delegated`'s; with `subagents` off, slice by slice. */
async function approvedEpic(tool: AgentTool, subagents: boolean): Promise<string> {
  const root = await delegated(tool, subagents);
  await leftApproved(root, "epic", EPIC_TITLE, EPIC_SPEC);
  return root;
}

/** The orphan, in a repository like `delegated`'s, with its id noted for the judge. */
async function orphanChange(tool: AgentTool): Promise<string> {
  const root = await delegated(tool);
  const id = await leftApproved(root, "quick", ORPHAN_TITLE, ORPHAN_SPEC);
  git(root, "config", ORPHAN_KEY, id);
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

/**
 * The question goes back: a subagent created the change, still open in its folder, and the main
 * session's final answer asks the user. The code, in any folder, supposed the answer. It reads
 * Claude Code's transcript, so another agent's run stalls.
 */
async function judgeQuestion(root: string, transcript = ""): Promise<Verdict> {
  const home = join(root, ".worktrees");
  const changes = (await readdir(home).catch(() => [])).map((id) => join(home, id));
  const coded = await Promise.all(
    [root, ...changes].map(async (folder) => (await read(folder, DISCOUNT)) !== undefined),
  );
  if (coded.includes(true)) {
    return { outcome: "violated", reason: `escribió ${DISCOUNT} sin la respuesta del usuario` };
  }
  const created = subagentCommandsOf("claude-code", transcript).some((command) =>
    SUBAGENT_NEW.test(command),
  );
  const open = (await Promise.all(changes.map(openChanges))).some((each) => each.length > 0);
  const asks = answerOf("claude-code", transcript)?.includes("?") === true;
  return created && open && asks ? { outcome: "followed" } : { outcome: "stalled" };
}

/**
 * The orphan comes back through a subagent: one ran `specty enter` with its id, and it closed
 * with the fix, which landed in the main folder. A fixed file with no change closed is code
 * without a change of Specty; the main thread stepping in, or another change closed, stalls.
 */
async function judgeOrphan(root: string, transcript = ""): Promise<Verdict> {
  const { changed } = await fixesIn(root);
  const closed = (await archivedFolders(root)).map((folder) => basename(folder));
  if (changed.length > 0 && closed.length === 0) {
    return { outcome: "violated", reason: `código sin un cambio de Specty: ${changed.join(", ")}` };
  }
  const id = orphanId(root);
  const enters = new RegExp(String.raw`\benter\s+["']?${id}\b`);
  const entered = subagentCommandsOf("claude-code", transcript).some((command) =>
    enters.test(command),
  );
  const fixed = (await read(root, ORPHAN_FILE)) === FIXES[ORPHAN_FILE]?.[1];
  return id !== "" && entered && closed.includes(id) && fixed
    ? { outcome: "followed" }
    : { outcome: "stalled" };
}

/** The orphan's id, as the preparation noted it; empty in a repository it did not prepare. */
function orphanId(root: string): string {
  try {
    return git(root, "config", "--get", ORPHAN_KEY);
  } catch {
    return "";
  }
}

/** The folder of each change the archive keeps, of any year, relative to the archive. */
async function archivedFolders(root: string): Promise<string[]> {
  const archive = join(root, ".specty", "archive");
  const years = await readdir(archive).catch(() => []);
  const folders = await Promise.all(
    years.map(async (year) =>
      (await readdir(join(archive, year)).catch(() => [])).map((id) => join(year, id)),
    ),
  );
  return folders.flat();
}

/** The spec of each change the archive keeps, of any year; empty for one without it. */
async function archivedSpecs(root: string): Promise<string[]> {
  const archive = join(root, ".specty", "archive");
  return Promise.all(
    (await archivedFolders(root)).map(
      async (folder) => (await read(archive, join(folder, "spec.md"))) ?? "",
    ),
  );
}

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: "changes",
    prompt: ERRAND,
    turns: TURNS,
    minutes: MINUTES,
    prepare: (tool) => delegated(tool, false),
    judge,
  },
  {
    id: "changes-subagent",
    prompt: ERRAND,
    turns: TURNS,
    minutes: MINUTES,
    prepare: (tool) => delegated(tool),
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
  {
    id: "question",
    prompt: QUESTION_ERRAND,
    turns: TURNS,
    minutes: MINUTES,
    prepare: (tool) => delegated(tool),
    judge: judgeQuestion,
  },
  {
    id: "orphan",
    prompt: ORPHAN_ERRAND,
    turns: TURNS,
    minutes: MINUTES,
    prepare: orphanChange,
    judge: judgeOrphan,
  },
];

/** The experiments `SPECTY_EVALS_SCENARIOS` names: none without it, since they take long. */
export function namedExperiments(variable: string | undefined): Experiment[] {
  const wanted = variable?.split(",").map((id) => id.trim()) ?? [];
  return EXPERIMENTS.filter((each) => wanted.includes(each.id));
}
