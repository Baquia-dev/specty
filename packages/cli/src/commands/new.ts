// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  blockedCard,
  type ChangeKind,
  headerOf,
  makeChangeId,
  nextCard,
  type Output,
  section,
  specTemplate,
  translator,
  withLead,
} from "@baquia-dev/specty-core";
import { commitState, isFinished, resolveActive } from "../flow/active";
import { sliceRefusal } from "../flow/epic";
import { removeFinished } from "../flow/prune";
import { changeView } from "../flow/views";
import { addWorktree, parallelBase, prepareWorktree, worktreesHome } from "../flow/worktree";
import { entersByName } from "../install/agents";
import { freshProject } from "../install/product";
import { exists, writeText } from "../io/files";
import type { Session } from "../session";
import { initialState, type StoredChange } from "../store/changes";
import { writePointer } from "../store/local";
import { changeFiles, repoPaths } from "../store/paths";
import { dirtyGoverned } from "./next";

export interface NewOptions {
  readonly title: string;
  readonly kind: ChangeKind;
  readonly follows: readonly string[];
  readonly epic?: string;
  readonly slice?: string;
  readonly timebox?: string;
  /** Create the change in a new worktree instead of switching this folder's branch. */
  readonly worktree?: boolean;
  /** With `worktree`, the branch to start from (by default, the main branch). */
  readonly from?: string;
  /** Set by `new` itself: the first change of a new project, its skeleton (ARCHITECTURE §14). */
  readonly bootstrap?: boolean;
  /** The user's literal request, kept in the audit as they wrote it. */
  readonly request?: string;
}

/**
 * `specty new`: creates the change, its branch and the spec skeleton. In a new project, the first
 * change is its skeleton: standard, so the scaffolding is traced, with hints of its own.
 */
export async function newChange(session: Session, options: NewOptions): Promise<Output> {
  const bootstrap = await freshProject(session);
  if (bootstrap && options.kind === "quick") {
    const t = translator(session.lang);
    return {
      ...blockedCard(
        headerOf(),
        t(
          "Es el primer cambio de un proyecto nuevo: el esqueleto va en un cambio standard, no quick.",
          "This is a new project's first change: the skeleton goes in a standard change, not a quick one.",
        ),
        t(
          `ejecuta \`${session.cards.command} new "${options.title.trim()}" --request "<petición literal del usuario>"\`, sin \`--kind quick\`.`,
          `run \`${session.cards.command} new "${options.title.trim()}" --request "<the user's literal request>"\`, without \`--kind quick\`.`,
        ),
      ),
      status: "invalid",
    };
  }
  return createNew(session, bootstrap ? { ...options, bootstrap } : options);
}

async function createNew(session: Session, options: NewOptions): Promise<Output> {
  const t = translator(session.lang);
  const { cards } = session;
  const title = options.title.trim();
  if (title.length === 0 || options.request?.trim() === "") {
    return {
      ...blockedCard(
        headerOf(),
        title.length === 0
          ? t("Falta el título.", "The title is missing.")
          : t("La petición (--request) está vacía.", "The request (--request) is empty."),
        t(
          `ejecuta \`${cards.command} new "<título>" --request "<petición literal del usuario>"\`.`,
          `run \`${cards.command} new "<title>" --request "<the user's literal request>"\`.`,
        ),
      ),
      status: "invalid",
    };
  }
  const refusal = await sliceRefusal(session, options.epic, options.slice);
  if (refusal !== undefined) return refusal;
  // Every change gets a worktree of its own unless the repository turned that off.
  const { git: settings } = session.config;
  const inWorktree = options.worktree === true || (settings.worktrees && settings.branchPerChange);
  if (options.from !== undefined && !inWorktree) {
    return {
      ...blockedCard(
        headerOf(),
        t("`--from` solo vale con `--worktree`.", "`--from` only works with `--worktree`."),
        t(
          `ejecuta \`${cards.command} new --worktree --from ${options.from} "<título>"\`.`,
          `run \`${cards.command} new --worktree --from ${options.from} "<title>"\`.`,
        ),
      ),
      status: "invalid",
    };
  }
  if (inWorktree) return newInWorktree(session, options, title);
  const active = await resolveActive(session);
  if (active !== undefined && !isFinished(active.state)) {
    return blockedCard(
      headerOf(active.state.id, active.state.phase),
      t(
        `Ya hay un cambio en curso: ${active.state.id}.`,
        `A change is already in progress: ${active.state.id}.`,
      ),
      session.config.git.branchPerChange
        ? t(
            `termínalo (\`${cards.command} next\`) o crea el nuevo en paralelo, en otra carpeta: \`${cards.command} new --worktree "<título>"\`.`,
            `finish it (\`${cards.command} next\`) or create the new one in parallel, in another folder: \`${cards.command} new --worktree "<title>"\`.`,
          )
        : t(
            `termínalo (\`${cards.command} next\`) o cámbiate a otra rama antes de crear otro.`,
            `finish it (\`${cards.command} next\`) or switch to another branch before creating a new one.`,
          ),
    );
  }
  const dirty = await dirtyGoverned(session);
  if (dirty.length > 0) return nextCard({ dirty }, cards);

  const id = await uniqueId(session, makeChangeId(session.environment.now(), title));
  const branch = session.config.git.branchPerChange ? branchOf(options.kind, id) : undefined;
  if (branch !== undefined) await session.git.output(["switch", "-q", "-c", branch]);
  else await writePointer(session.git, "active", id);
  const created = await createChange(session, options, {
    id,
    title,
    branch,
    baseCommit: await session.git.head(),
    dir: session.paths.changeDir(id),
  });
  const where = branch === undefined ? "" : t(` (rama ${branch})`, ` (branch ${branch})`);
  return withLead(
    t(`Cambio creado: ${id}${where}.`, `Change created: ${id}${where}.`),
    nextCard({ change: await changeView(session, created), dirty: [] }, cards),
  );
}

/**
 * `specty new --worktree`: the change gets its own branch and folder, so another session can keep
 * working here. This folder's change and uncommitted code are not looked at: nothing here moves.
 */
async function newInWorktree(
  session: Session,
  options: NewOptions,
  title: string,
): Promise<Output> {
  const t = translator(session.lang);
  const { cards, git } = session;
  if (!session.config.git.branchPerChange) {
    return blockedCard(
      headerOf(),
      t(
        "`--worktree` necesita una rama por cambio, y `git.branchPerChange` está desactivado.",
        "`--worktree` needs a branch per change, and `git.branchPerChange` is off.",
      ),
      t(
        `ejecuta \`${cards.command} new "<título>"\` sin \`--worktree\`.`,
        `run \`${cards.command} new "<title>"\` without \`--worktree\`.`,
      ),
    );
  }
  const base = await parallelBase(git, options.from, session.config.git.target);
  if (base.commit === undefined) {
    return blockedCard(
      headerOf(),
      t(
        `\`${base.name}\` no es una rama ni un commit.`,
        `\`${base.name}\` is neither a branch nor a commit.`,
      ),
      t(
        "indica una rama que exista con `--from <rama>`.",
        "name an existing branch with `--from <branch>`.",
      ),
    );
  }
  // Folders of changes already closed (and incorporated) or cancelled are no longer needed.
  const { removed } = await removeFinished(session);
  const home = await worktreesHome(git);
  const id = await uniqueId(session, makeChangeId(session.environment.now(), title), home);
  const branch = branchOf(options.kind, id);
  const folder = join(home, id);
  const copied = await addWorktree(git, { folder, branch, base: base.commit });
  await createChange(session, options, {
    id,
    title,
    branch,
    baseCommit: base.commit,
    dir: repoPaths(folder).changeDir(id),
  });
  const prepared = await prepareWorktree(session, folder);
  const from = `${base.name} (${base.commit.slice(0, 7)})`;
  const failed = prepared?.ok === false ? prepared : undefined;
  // With Specty's worktree hooks, entering by name skips the prompt a folder outside `.claude` gets.
  const byName = (await entersByName(session.root))
    ? t(
        `en Claude Code, \`EnterWorktree\` con \`name: "${id}"\`; `,
        `in Claude Code, \`EnterWorktree\` with \`name: "${id}"\`; `,
      )
    : "";
  const carryOn = t(
    `cambia allí la carpeta de trabajo de tu sesión (${byName}o abre allí un agente) y ejecuta \`${cards.command} next\`; esta carpeta sigue con su propio trabajo.`,
    `switch your session's working folder there (${byName}or open an agent there) and run \`${cards.command} next\`; this folder carries on with its own work.`,
  );
  return {
    status: "ok",
    header: headerOf(id, "draft"),
    blocks: [
      {
        lines: [
          t(
            `Cambio creado: ${id} (rama ${branch}) en ${folder}, desde ${from}.`,
            `Change created: ${id} (branch ${branch}) in ${folder}, from ${from}.`,
          ),
          ...(prepared?.ok === true
            ? [
                t(
                  `Carpeta preparada con \`${prepared.command}\`.`,
                  `Folder prepared with \`${prepared.command}\`.`,
                ),
              ]
            : []),
        ],
      },
      ...(copied.length > 0
        ? [{ title: t("HOOKS DEL AGENTE COPIADOS", "AGENT HOOKS COPIED"), lines: copied }]
        : []),
      ...section(
        t("CARPETAS DE CAMBIOS TERMINADOS, BORRADAS", "FOLDERS OF FINISHED CHANGES, REMOVED"),
        removed,
      ),
      ...(failed === undefined
        ? []
        : [
            {
              title: t(`FALLÓ \`${failed.command}\``, `\`${failed.command}\` FAILED`),
              lines: failed.output,
            },
          ]),
    ],
    next:
      failed === undefined
        ? t(`continúa en ${folder}: ${carryOn}`, `carry on in ${folder}: ${carryOn}`)
        : t(
            `en ${folder}, ejecuta \`${failed.command}\`; después ${carryOn}`,
            `in ${folder}, run \`${failed.command}\`; then ${carryOn}`,
          ),
  };
}

function branchOf(kind: ChangeKind, id: string): string {
  return `${kind === "spike" ? "spike" : "specty"}/${id}`;
}

/** Writes the spec skeleton and the initial state of a new change in `target.dir`. */
async function createChange(
  session: Session,
  options: NewOptions,
  target: {
    readonly id: string;
    readonly title: string;
    readonly branch: string | undefined;
    readonly baseCommit: string | undefined;
    readonly dir: string;
  },
): Promise<StoredChange> {
  const { id, branch } = target;
  const files = changeFiles(target.dir);
  await writeText(
    files.spec,
    specTemplate({
      kind: options.kind,
      lang: session.lang,
      title: target.title,
      follows: options.follows,
      ...(options.epic !== undefined ? { epic: options.epic } : {}),
      ...(options.slice !== undefined ? { slice: options.slice } : {}),
      ...(options.timebox !== undefined ? { timebox: options.timebox } : {}),
      ...(options.bootstrap === true ? { bootstrap: true } : {}),
    }),
  );
  const state = initialState({ id, kind: options.kind, branch, baseCommit: target.baseCommit });
  return commitState(session, { files, state, archived: false }, state, "change.created", {
    kind: options.kind,
    ...(branch !== undefined ? { branch } : {}),
    ...(options.follows.length > 0 ? { follows: options.follows } : {}),
    ...(options.epic !== undefined ? { epic: options.epic, slice: options.slice } : {}),
    ...(options.request !== undefined ? { request: options.request.trim() } : {}),
    ...(options.bootstrap === true ? { bootstrap: true } : {}),
  });
}

/** An id no change, branch or worktree folder (`home`) uses yet. */
async function uniqueId(
  session: Session,
  base: string,
  home?: string,
  attempt = 1,
): Promise<string> {
  const candidate = attempt === 1 ? base : `${base}-${attempt}`;
  const taken =
    (await exists(session.paths.changeDir(candidate))) ||
    (home !== undefined && (await exists(join(home, candidate)))) ||
    (await session.git.run(["rev-parse", "--verify", "-q", `refs/heads/specty/${candidate}`]))
      .code === 0;
  return taken ? uniqueId(session, base, home, attempt + 1) : candidate;
}
