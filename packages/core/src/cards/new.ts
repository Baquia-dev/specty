// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, type AgentTool } from "../agents";
import { AGENT_CAPABILITIES } from "../capabilities";
import type { Phase } from "../flow/phases";
import { headerOf, type Output, section } from "../output";
import { CHANGE_KINDS, COMMIT_TYPES } from "../spec/model";
import { blockedCard } from "./flow";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/** Why `specty new` creates nothing. */
export type NewRefusal =
  | { readonly reason: "unknown-kind"; readonly kind: string }
  /** `--type`, which names the branch under `git.flow`, is not a commit type. */
  | { readonly reason: "unknown-type"; readonly type: string }
  /** A new project's first change is its skeleton: standard, so the scaffolding is traced. */
  | { readonly reason: "bootstrap-quick"; readonly title: string }
  | { readonly reason: "no-title" }
  | { readonly reason: "empty-request" }
  | { readonly reason: "from-without-worktree"; readonly from: string }
  /** `--worktree` while `git.branchPerChange` is off. */
  | { readonly reason: "worktree-without-branches" }
  | { readonly reason: "unknown-base"; readonly base: string }
  /** Without worktrees, a folder holds one change at a time. */
  | {
      readonly reason: "in-progress";
      readonly id: string;
      readonly phase: Phase;
      readonly branchPerChange: boolean;
    };

/**
 * The card of a `specty new` that creates nothing, with the way forward: `invalid` when the
 * command itself is wrong, `blocked` when the repository's state or settings stop it.
 */
export function newRefusalCard(refusal: NewRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const header =
    refusal.reason === "in-progress" ? headerOf(refusal.id, refusal.phase) : headerOf();
  const card = blockedCard(
    header,
    newRefusalReason(refusal, t),
    newRefusalNext(refusal, t, ctx.command),
  );
  return BLOCKED_BY_STATE.has(refusal.reason) ? card : { ...card, status: "invalid" };
}

// The refusals the repository's state or settings make; a wrong command makes the others.
const BLOCKED_BY_STATE: ReadonlySet<NewRefusal["reason"]> = new Set([
  "worktree-without-branches",
  "unknown-base",
  "in-progress",
]);

function newRefusalReason(refusal: NewRefusal, t: Translate): string {
  switch (refusal.reason) {
    case "unknown-kind":
      return t(
        `Tipo de cambio desconocido: ${refusal.kind}.`,
        `Unknown change kind: ${refusal.kind}.`,
      );
    case "unknown-type":
      return t(
        `Tipo de commit desconocido: ${refusal.type}.`,
        `Unknown commit type: ${refusal.type}.`,
      );
    case "bootstrap-quick":
      return t(
        "Es el primer cambio de un proyecto nuevo: el esqueleto va en un cambio standard, no quick.",
        "This is a new project's first change: the skeleton goes in a standard change, not a quick one.",
      );
    case "no-title":
      return t("Falta el título.", "The title is missing.");
    case "empty-request":
      return t("La petición (--request) está vacía.", "The request (--request) is empty.");
    case "from-without-worktree":
      return t("`--from` solo vale con `--worktree`.", "`--from` only works with `--worktree`.");
    case "worktree-without-branches":
      return t(
        "`--worktree` necesita una rama por cambio, y `git.branchPerChange` está desactivado.",
        "`--worktree` needs a branch per change, and `git.branchPerChange` is off.",
      );
    case "unknown-base":
      return t(
        `\`${refusal.base}\` no es una rama ni un commit.`,
        `\`${refusal.base}\` is neither a branch nor a commit.`,
      );
    case "in-progress":
      return t(
        `Ya hay un cambio en curso: ${refusal.id}.`,
        `A change is already in progress: ${refusal.id}.`,
      );
  }
}

function newRefusalNext(refusal: NewRefusal, t: Translate, command: string): string {
  switch (refusal.reason) {
    case "unknown-kind":
      return `--kind ${CHANGE_KINDS.join("|")}`;
    case "unknown-type":
      return `--type ${COMMIT_TYPES.join("|")}`;
    case "bootstrap-quick":
      return t(
        `ejecuta \`${command} new "${refusal.title}" --request "<petición literal del usuario>"\`, sin \`--kind quick\`.`,
        `run \`${command} new "${refusal.title}" --request "<the user's literal request>"\`, without \`--kind quick\`.`,
      );
    case "no-title":
    case "empty-request":
      return t(
        `ejecuta \`${command} new "<título>" --request "<petición literal del usuario>"\`.`,
        `run \`${command} new "<title>" --request "<the user's literal request>"\`.`,
      );
    case "from-without-worktree":
      return t(
        `ejecuta \`${command} new --worktree --from ${refusal.from} "<título>"\`.`,
        `run \`${command} new --worktree --from ${refusal.from} "<title>"\`.`,
      );
    case "worktree-without-branches":
      return t(
        `ejecuta \`${command} new "<título>"\` sin \`--worktree\`.`,
        `run \`${command} new "<title>"\` without \`--worktree\`.`,
      );
    case "unknown-base":
      return t(
        "indica una rama que exista con `--from <rama>`.",
        "name an existing branch with `--from <branch>`.",
      );
    case "in-progress":
      return refusal.branchPerChange
        ? t(
            `termínalo (\`${command} next\`) o crea el nuevo en paralelo, en otra carpeta: \`${command} new --worktree "<título>"\`.`,
            `finish it (\`${command} next\`) or create the new one in parallel, in another folder: \`${command} new --worktree "<title>"\`.`,
          )
        : t(
            `termínalo (\`${command} next\`) o cámbiate a otra rama antes de crear otro.`,
            `finish it (\`${command} next\`) or switch to another branch before creating a new one.`,
          );
  }
}

/** The lead of `specty new` when the change is created in this folder. */
export function changeCreatedLead(
  id: string,
  branch: string | undefined,
  ctx: CardContext,
): string {
  const t = translator(ctx.lang);
  const where = branch === undefined ? "" : t(` (rama ${branch})`, ` (branch ${branch})`);
  return t(`Cambio creado: ${id}${where}.`, `Change created: ${id}${where}.`);
}

/** A change created in a worktree of its own, for `worktreeCreatedCard`. */
export interface WorktreeCreated {
  readonly id: string;
  readonly branch: string;
  readonly folder: string;
  /** Where it starts: the branch or commit named, and its short hash, as `main (d64c425)`. */
  readonly from: string;
  /** The command that prepared the folder, and the end of its output, shown when it failed. */
  readonly prepared?: {
    readonly command: string;
    readonly ok: boolean;
    readonly output: readonly string[];
  };
  /** The agent's hook files copied into the folder. */
  readonly copied: readonly string[];
  /** Folders of finished changes removed on the way. */
  readonly removed: readonly string[];
  /** With Specty's worktree hooks, Claude Code enters the folder by name, without a prompt. */
  readonly byName: boolean;
  /** The agent that ran `new`, known by its environment: how it carries on in the folder. */
  readonly agent?: AgentTool | undefined;
}

/**
 * How the person opens each tool in a folder, for a session of its own there: the other way for
 * an agent that enters the change's folder with `specty enter`.
 */
const OPEN_IN: Partial<Readonly<Record<AgentTool, (folder: string, t: Translate) => string>>> = {
  codex: (folder, t) =>
    t(
      `Codex en esa carpeta (\`codex -C "${folder}"\`)`,
      `Codex in that folder (\`codex -C "${folder}"\`)`,
    ),
  opencode: (folder, t) =>
    t(
      `OpenCode en esa carpeta (\`opencode "${folder}"\`)`,
      `OpenCode in that folder (\`opencode "${folder}"\`)`,
    ),
  cursor: (folder, t) =>
    t(
      `una ventana de Cursor en esa carpeta (\`cursor "${folder}"\`)`,
      `a Cursor window in that folder (\`cursor "${folder}"\`)`,
    ),
  "gemini-cli": (folder, t) =>
    t(
      `Gemini CLI en esa carpeta (\`cd "${folder}" && gemini\`)`,
      `Gemini CLI in that folder (\`cd "${folder}" && gemini\`)`,
    ),
  antigravity: (folder, t) =>
    t(
      `Antigravity CLI en esa carpeta (\`cd "${folder}" && agy\`)`,
      `Antigravity CLI in that folder (\`cd "${folder}" && agy\`)`,
    ),
};

/**
 * `specty new` in a worktree: the change and where it lives, and how the session moves there,
 * since this folder carries on with its own work. A failed preparation goes first in the way on.
 */
export function worktreeCreatedCard(created: WorktreeCreated, ctx: CardContext): Output {
  return {
    status: "ok",
    header: headerOf(created.id, "draft"),
    blocks: worktreeCreatedBlocks(created, translator(ctx.lang)),
    next: worktreeCreatedNext(created, ctx),
  };
}

/** The change, its folder and how it was prepared, the hooks copied and the folders removed. */
function worktreeCreatedBlocks(created: WorktreeCreated, t: Translate): Output["blocks"] {
  const { id, branch, folder, from, prepared } = created;
  return [
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
    ...section(t("HOOKS DEL AGENTE COPIADOS", "AGENT HOOKS COPIED"), created.copied),
    ...section(
      t("CARPETAS DE CAMBIOS TERMINADOS, BORRADAS", "FOLDERS OF FINISHED CHANGES, REMOVED"),
      created.removed,
    ),
    ...(prepared?.ok === false
      ? [
          {
            title: t(`FALLÓ \`${prepared.command}\``, `\`${prepared.command}\` FAILED`),
            lines: prepared.output,
          },
        ]
      : []),
  ];
}

/** Moving the session to the new folder, after preparing it again if that failed. */
function worktreeCreatedNext(created: WorktreeCreated, ctx: CardContext): string {
  const t = translator(ctx.lang);
  const { folder, prepared } = created;
  const carryOn = carryOnText(created, ctx, t);
  return prepared?.ok === false
    ? t(
        `en ${folder}, ejecuta \`${prepared.command}\`; después ${carryOn}`,
        `in ${folder}, run \`${prepared.command}\`; then ${carryOn}`,
      )
    : t(`continúa en ${folder}: ${carryOn}`, `carry on in ${folder}: ${carryOn}`);
}

/**
 * How the session carries on in the change's folder: an agent with Specty's guard enters it from
 * the same session (`specty enter`), or the person opens its tool there; Claude Code enters it on
 * its own, and an unknown agent hears both ways.
 */
function carryOnText(created: WorktreeCreated, ctx: CardContext, t: Translate): string {
  const { id, folder, agent } = created;
  if (agent !== undefined && AGENT_CAPABILITIES[agent].worktreeByName.state === "indirect") {
    const open = OPEN_IN[agent]?.(folder, t);
    const other =
      open === undefined
        ? ""
        : t(
            ` Si la persona prefiere otra sesión, pídele que abra ${open} y termina tu turno.`,
            ` If the person would rather have another session, ask them to open ${open} and end your turn.`,
          );
    return t(
      `${AGENT_NAMES[agent]} entra en ella desde esta misma sesión: ejecuta \`${ctx.command} enter ${id}\` y sigue su salida.${other} Esta carpeta sigue con su propio trabajo.`,
      `${AGENT_NAMES[agent]} enters it from this same session: run \`${ctx.command} enter ${id}\` and follow its output.${other} This folder carries on with its own work.`,
    );
  }
  const byName = created.byName
    ? t(
        `en Claude Code, \`EnterWorktree\` con \`name: "${id}"\`; `,
        `in Claude Code, \`EnterWorktree\` with \`name: "${id}"\`; `,
      )
    : "";
  return t(
    `cambia allí la carpeta de trabajo de tu sesión (${byName}o abre allí un agente) y ejecuta \`${ctx.command} next\`; esta carpeta sigue con su propio trabajo.`,
    `switch your session's working folder there (${byName}or open an agent there) and run \`${ctx.command} next\`; this folder carries on with its own work.`,
  );
}
