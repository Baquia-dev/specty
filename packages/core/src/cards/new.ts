// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import { headerOf, type Output, section } from "../output";
import { CHANGE_KINDS } from "../spec/model";
import { blockedCard } from "./flow";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/** Why `specty new` creates nothing. */
export type NewRefusal =
  | { readonly reason: "unknown-kind"; readonly kind: string }
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
}

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
  const { id, folder, prepared } = created;
  const byName = created.byName
    ? t(
        `en Claude Code, \`EnterWorktree\` con \`name: "${id}"\`; `,
        `in Claude Code, \`EnterWorktree\` with \`name: "${id}"\`; `,
      )
    : "";
  const carryOn = t(
    `cambia allí la carpeta de trabajo de tu sesión (${byName}o abre allí un agente) y ejecuta \`${ctx.command} next\`; esta carpeta sigue con su propio trabajo.`,
    `switch your session's working folder there (${byName}or open an agent there) and run \`${ctx.command} next\`; this folder carries on with its own work.`,
  );
  return prepared?.ok === false
    ? t(
        `en ${folder}, ejecuta \`${prepared.command}\`; después ${carryOn}`,
        `in ${folder}, run \`${prepared.command}\`; then ${carryOn}`,
      )
    : t(`continúa en ${folder}: ${carryOn}`, `carry on in ${folder}: ${carryOn}`);
}
