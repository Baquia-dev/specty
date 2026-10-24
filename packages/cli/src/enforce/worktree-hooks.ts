// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from "node:path";
import { translator } from "@baquia-dev/specty-core";
import { reasonOf } from "../flow/integrate";
import { within } from "../flow/land";
import { worktreesHome } from "../flow/worktree";
import { createGit, findRoot, type Git, resolved } from "../io/git";
import { COMMAND, type Environment, openSession, systemLanguage } from "../session";

export interface HookReply {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The folder a worktree name stands for. */
export interface NamedWorktree {
  readonly folder: string;
  /** The folder `specty new` prepared for the change with that id. */
  readonly prepared: boolean;
  /** Git already lists it as a worktree. */
  readonly listed: boolean;
}

type Translate = ReturnType<typeof translator>;

/**
 * Where `EnterWorktree({ name })` goes: the folder `specty new` prepared for the change with that
 * id or, for any other name, `.claude/worktrees/<name>` in this worktree, as Claude Code does.
 */
export async function namedWorktree(git: Git, name: string): Promise<NamedWorktree> {
  const listed = (await git.worktrees()).map(({ folder }) => folder);
  const prepared = join(await worktreesHome(git), name);
  if (listed.includes(prepared)) return { folder: prepared, prepared: true, listed: true };
  const own = join(git.root, ".claude", "worktrees", name);
  return { folder: own, prepared: false, listed: listed.includes(own) };
}

export function isWorktreeEvent(event: Record<string, unknown>): boolean {
  return event.hook_event_name === "WorktreeCreate" || event.hook_event_name === "WorktreeRemove";
}

/**
 * Claude Code's `WorktreeCreate` and `WorktreeRemove`, which take over how it creates and removes
 * worktrees (`EnterWorktree`, `ExitWorktree`, isolated subagents). They need only git, so they
 * work even when Specty's configuration does not.
 */
export async function worktreeHook(
  environment: Environment,
  event: Record<string, unknown>,
  cwd: string,
): Promise<HookReply> {
  const opened = await openSession({ ...environment, cwd });
  const t = translator(
    opened.kind === "ok" ? opened.session.lang : systemLanguage(environment.env),
  );
  const root = await findRoot(cwd);
  if (root === undefined) {
    return refuse(
      t(`${cwd} no está en un repositorio de git.`, `${cwd} is not in a git repository.`),
    );
  }
  const git = createGit(root, environment.env);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return event.hook_event_name === "WorktreeCreate"
    ? create(git, text(event.name), t)
    : remove(git, text(event.worktree_path), t);
}

/** Answers with the folder's path, the only thing Claude Code reads from stdout. */
async function create(git: Git, name: string, t: Translate): Promise<HookReply> {
  if (name.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return refuse(
      t(`Nombre de worktree no válido: «${name}».`, `Invalid worktree name: "${name}".`),
    );
  }
  const target = await namedWorktree(git, name);
  if (target.listed) return { code: 0, stdout: target.folder, stderr: "" };
  const branch = `worktree-${name.replaceAll("/", "-")}`;
  const known = await git.run(["rev-parse", "--verify", "-q", `refs/heads/${branch}`]);
  const added = await git.run(
    known.code === 0
      ? ["worktree", "add", target.folder, branch]
      : ["worktree", "add", "-b", branch, target.folder, "HEAD"],
  );
  if (added.code !== 0) return refuse(reasonOf(added));
  return { code: 0, stdout: target.folder, stderr: "" };
}

/** A change's folder stays: its work is not done until the change is, and `new` cleans it up. */
async function remove(git: Git, path: string, t: Translate): Promise<HookReply> {
  if (path === "")
    return refuse(t("Falta la carpeta de la worktree.", "The worktree's folder is missing."));
  const folder = await resolved(resolve(git.root, path));
  if (await within(folder, await worktreesHome(git))) {
    return refuse(
      t(
        `${folder} es la carpeta de un cambio de Specty: se queda, y \`${COMMAND} new\` la borra cuando el cambio termina.`,
        `${folder} is a Specty change's folder: it stays, and \`${COMMAND} new\` removes it once the change is finished.`,
      ),
    );
  }
  const worktrees = await git.worktrees();
  const main = worktrees[0]?.folder ?? git.root;
  const real = await Promise.all(worktrees.map(({ folder }) => resolved(folder)));
  const branch = worktrees[real.indexOf(folder)]?.branch;
  const removed = await git.run(["-C", main, "worktree", "remove", "--force", folder]);
  if (removed.code !== 0) return refuse(reasonOf(removed));
  // Only a branch with nothing left to merge: `-d` refuses any other.
  if (branch?.startsWith("worktree-")) await git.run(["-C", main, "branch", "-d", branch]);
  return { code: 0, stdout: "", stderr: "" };
}

function refuse(reason: string): HookReply {
  return { code: 1, stdout: "", stderr: `specty: ${reason}` };
}
