// SPDX-License-Identifier: Apache-2.0
import { AGENT_CAPABILITIES } from "../capabilities";
import type { Phase } from "../flow/phases";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { blockedCard } from "./flow";
import { inItsFolder, launchedWith, numbered, toSubagents } from "./subagents";
import { type Translate, translator } from "./text";
import type { CardContext, ChangeView, SliceView } from "./view";

/**
 * An approved epic's card: it has no tasks, so it shows its slices, each one a change of its own,
 * and the next step. When its tool hands the slices to subagents, it brings a brief for each slice
 * ready or orphaned, one subagent each, and the session stays in the epic; a session that moved
 * into the epic's worktree with its tool leaves it first, so that its subagents can write in their
 * slices' folders. Otherwise it goes on with the slice in progress or starts the first one ready.
 */
export function epicCard(change: ChangeView, ctx: CardContext): Output {
  const slices = change.slices ?? [];
  const header = headerOf(change.id, "implementing");
  const list = slicesBlock(slices, ctx);
  if (!toSubagents(ctx)) {
    return { status: "ok", header, blocks: list, next: inOrderNext(change.id, slices, ctx) };
  }
  const briefs = slices.flatMap((slice) => briefOf(change.id, slice, ctx));
  const where = change.inWorktree === true && movesItsSession(ctx) ? "leave" : "inside";
  return {
    status: "ok",
    header,
    blocks: [...list, ...briefs],
    next: subagentsNext(slices, briefs.length, ctx, where),
  };
}

/**
 * The epic's card for its conversation outside the epic's folder (`folder`), while it hands its
 * slices to subagents and some slice is left for them: the briefs are launched from there, and the
 * conversation does not go back into the epic. Undefined once no slice is ready nor in progress.
 */
export function awayEpicCard(
  epic: ChangeView,
  folder: string,
  ctx: CardContext,
): Output | undefined {
  const slices = epic.slices ?? [];
  const left = slices.some((slice) => slice.status === "ready" || slice.status === "open");
  if (!toSubagents(ctx) || !left) return undefined;
  const t = translator(ctx.lang);
  const lead = section(t("TU ÉPICA", "YOUR EPIC"), [
    t(
      `Esta conversación lleva la épica ${epic.id} («${epic.title}»), en ${folder}, y reparte sus cortes desde fuera de esa carpeta: no vuelvas a entrar en ella para lanzar los encargos.`,
      `This conversation carries epic ${epic.id} («${epic.title}»), in ${folder}, and hands out its slices from outside that folder: do not go back into it to launch the briefs.`,
    ),
  ]);
  const briefs = slices.flatMap((slice) => briefOf(epic.id, slice, ctx));
  return {
    status: "ok",
    header: headerOf(epic.id, "implementing"),
    blocks: [...lead, ...slicesBlock(slices, ctx), ...briefs],
    next: subagentsNext(slices, briefs.length, ctx, "away"),
  };
}

function slicesBlock(slices: readonly SliceView[], ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  const closed = slices.filter((slice) => slice.status === "done").length;
  return section(
    t(
      `CORTES (${closed} de ${slices.length} cerrados)`,
      `SLICES (${closed} of ${slices.length} closed)`,
    ),
    sliceLines(slices, ctx),
  );
}

/** The tool moves its whole session into a change's folder (Claude Code, with `EnterWorktree`). */
function movesItsSession(ctx: CardContext): boolean {
  return ctx.tool !== undefined && AGENT_CAPABILITIES[ctx.tool].worktreeByName.state === "yes";
}

/** Without subagents: go on with the slice in progress, or start the first one ready. */
function inOrderNext(epic: string, slices: readonly SliceView[], ctx: CardContext): string {
  const t = translator(ctx.lang);
  const open = slices.find((slice) => slice.status === "open");
  if (open !== undefined) {
    const where = open.child?.folder ?? open.child?.id;
    return t(
      `sigue con el corte ${open.id} en su carpeta, ${where}: ejecuta \`${ctx.command} next\` allí.`,
      `go on with slice ${open.id} in its folder, ${where}: run \`${ctx.command} next\` there.`,
    );
  }
  const ready = slices.find((slice) => slice.status === "ready");
  if (ready === undefined) return settledNext(slices, ctx);
  const start = `\`${ctx.command} new "${ready.title}" --epic ${epic} --slice ${ready.id}\``;
  return t(
    `empieza el corte ${ready.id}: ${start} y sigue su salida. Para trabajar en paralelo con varios agentes, redacta antes las specs de los cortes listos.`,
    `start slice ${ready.id}: ${start} and follow its output. To work in parallel with multiple agents, draft the specs of the ready slices first.`,
  );
}

/**
 * Where the session that hands out the slices asks: in the epic's folder (`inside`), in the
 * epic's worktree that its tool moved it into (`leave`, which it leaves before launching), or
 * outside the epic's folder (`away`).
 */
type Where = "inside" | "leave" | "away";

/** With subagents: launch the briefs, or wait for the subagents of the slices in progress. */
function subagentsNext(
  slices: readonly SliceView[],
  briefs: number,
  ctx: CardContext,
  where: Where,
): string {
  const t = translator(ctx.lang);
  const next = `\`${ctx.command} next\``;
  const here = where === "away" ? t("aquí", "here") : t("aquí, en la épica", "here, in the epic");
  if (briefs > 0 && where === "leave") {
    return t(
      `sal antes de la carpeta de la épica sin borrarla (en Claude Code, \`ExitWorktree\` con \`action: "keep"\`), porque desde ella tus subagentes no pueden escribir en las carpetas de sus cortes; después, lanza en paralelo, en un solo mensaje, un subagente por encargo con su texto tal cual y, cuando terminen, ejecuta ${next} en la carpeta principal.`,
      `leave the epic's folder first without removing it (in Claude Code, \`ExitWorktree\` with \`action: "keep"\`), since from it your subagents cannot write in their slices' folders; then launch in parallel, in a single message, one subagent per brief with its text as is and, once they finish, run ${next} in the main folder.`,
    );
  }
  if (briefs > 0) {
    const how = launchedWith(ctx);
    return t(
      `lanza en paralelo, en un solo mensaje, un subagente por encargo con su texto tal cual${how}; cuando terminen, vuelve a ejecutar ${next} ${here}.`,
      `launch in parallel, in a single message, one subagent per brief with its text as is${how}; once they finish, run ${next} again ${here}.`,
    );
  }
  if (!slices.some((slice) => slice.status === "open")) return settledNext(slices, ctx);
  return t(
    `los cortes en curso siguen con sus subagentes: espera sus informes y, cuando terminen, vuelve a ejecutar ${next} ${here}.`,
    `the slices in progress go on with their subagents: wait for their reports and, once they finish, run ${next} again ${here}.`,
  );
}

/** Nothing in progress nor ready: every slice is closed, or none can start. */
function settledNext(slices: readonly SliceView[], ctx: CardContext): string {
  const t = translator(ctx.lang);
  return slices.every((slice) => slice.status === "done")
    ? t(
        `todos los cortes están cerrados: ejecuta \`${ctx.command} next\` para pasar la épica a aceptación.`,
        `every slice is closed: run \`${ctx.command} next\` to move the epic to acceptance.`,
      )
    : t(
        "ningún corte puede empezar: sus `depends` esperan cortes que no se cierran. Revísalo con el usuario.",
        "no slice can start: their `depends` wait for slices that do not close. Review it with the user.",
      );
}

/**
 * The brief a subagent gets as is: for a ready slice, to create its change and close it; for an
 * orphan, the same from `enter`. A slice in progress that a conversation holds has none.
 */
function briefOf(epic: string, slice: SliceView, ctx: CardContext): OutputBlock[] {
  const t = translator(ctx.lang);
  const { command } = ctx;
  const placeholder = t("<carpeta del cambio>", "<change folder>");
  if (slice.status === "ready") {
    return section(t(`ENCARGO ${slice.id}`, `BRIEF ${slice.id}`), [
      t(
        `Haz el corte ${slice.id} con sus tareas en orden y sin lanzar otros subagentes:`,
        `Do slice ${slice.id} with its tasks in order and without launching other subagents:`,
      ),
      ...numbered([
        `\`${command} new "${slice.title}" --epic ${epic} --slice ${slice.id} --subagent\``,
        t(
          `\`${command} enter <id>\`, con el id que te dé \`new\`.`,
          `\`${command} enter <id>\`, with the id \`new\` gives you.`,
        ),
        ...inItsFolder(placeholder, ctx),
      ]),
    ]);
  }
  const { child } = slice;
  if (slice.status !== "open" || child?.orphan !== true) return [];
  return section(t(`ENCARGO ${slice.id} (huérfano)`, `BRIEF ${slice.id} (orphaned)`), [
    t(
      `Retoma el corte ${slice.id} con sus tareas en orden y sin lanzar otros subagentes:`,
      `Resume slice ${slice.id} with its tasks in order and without launching other subagents:`,
    ),
    ...numbered([
      `\`${command} enter ${child.id}\``,
      ...inItsFolder(child.folder ?? placeholder, ctx),
    ]),
  ]);
}

/** One line per slice: its id and title, and how far it got. */
export function sliceLines(slices: readonly SliceView[], ctx: CardContext): string[] {
  const t = translator(ctx.lang);
  const closed = new Set(slices.filter((slice) => slice.status === "done").map(({ id }) => id));
  return slices.map((slice) => {
    const { child } = slice;
    const waiting = slice.depends.filter((id) => !closed.has(id)).join(", ");
    const state =
      slice.status === "done"
        ? t(`cerrado (${child?.id})`, `closed (${child?.id})`)
        : slice.status === "open"
          ? t(
              `en curso: ${child?.id}, en ${child?.phase}`,
              `in progress: ${child?.id}, in ${child?.phase}`,
            )
          : slice.status === "ready"
            ? t("listo para empezar", "ready to start")
            : t(`espera a ${waiting}`, `waits for ${waiting}`);
    return `${slice.id} ${slice.title} — ${state}`;
  });
}

/** Why `new --epic <epic> --slice <slice>` cannot start that slice. */
export type SliceRefusal =
  /** `--epic` and `--slice` go together. */
  | { readonly reason: "incomplete" }
  | { readonly reason: "no-epic"; readonly epic: string }
  | { readonly reason: "not-approved"; readonly epic: string; readonly phase: Phase }
  | {
      readonly reason: "no-slice";
      readonly epic: string;
      readonly slice: string;
      readonly slices: readonly string[];
    }
  | {
      readonly reason: "taken";
      readonly slice: string;
      readonly child: { readonly id: string; readonly phase: Phase };
    }
  /** Slices it depends on that are not closed yet. */
  | { readonly reason: "waiting"; readonly slice: string; readonly waiting: readonly string[] };

/** A slice that cannot start: `invalid` when the command names it wrong, `blocked` by the epic. */
export function sliceRefusalCard(refusal: SliceRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    ...blockedCard(
      headerOf(),
      sliceRefusalReason(refusal, t),
      sliceRefusalNext(refusal, t, ctx.command),
    ),
    status: NAMED_WRONG.has(refusal.reason) ? "invalid" : "blocked",
  };
}

// The refusals of a command that names the epic or the slice wrong; the epic blocks the others.
const NAMED_WRONG: ReadonlySet<SliceRefusal["reason"]> = new Set([
  "incomplete",
  "no-epic",
  "no-slice",
]);

function sliceRefusalReason(refusal: SliceRefusal, t: Translate): string {
  switch (refusal.reason) {
    case "incomplete":
      return t(
        "`--epic` y `--slice` van juntos: la épica y el corte que implementa el cambio.",
        "`--epic` and `--slice` go together: the epic and the slice the change implements.",
      );
    case "no-epic":
      return t(
        `No hay ninguna épica abierta ${refusal.epic}.`,
        `There is no open epic ${refusal.epic}.`,
      );
    case "not-approved":
      return t(
        `La épica ${refusal.epic} aún no está aprobada (fase ${refusal.phase}).`,
        `Epic ${refusal.epic} is not approved yet (phase ${refusal.phase}).`,
      );
    case "no-slice": {
      const ids = refusal.slices.join(", ");
      return t(
        `La épica ${refusal.epic} no tiene el corte ${refusal.slice}; sus cortes: ${ids}.`,
        `Epic ${refusal.epic} has no slice ${refusal.slice}; its slices: ${ids}.`,
      );
    }
    case "taken":
      return t(
        `El corte ${refusal.slice} ya tiene un cambio: ${refusal.child.id}, en ${refusal.child.phase}.`,
        `Slice ${refusal.slice} already has a change: ${refusal.child.id}, in ${refusal.child.phase}.`,
      );
    case "waiting": {
      const waiting = refusal.waiting.join(", ");
      return t(
        `El corte ${refusal.slice} depende de cortes que aún no están cerrados: ${waiting}.`,
        `Slice ${refusal.slice} depends on slices that are not closed yet: ${waiting}.`,
      );
    }
  }
}

function sliceRefusalNext(refusal: SliceRefusal, t: Translate, command: string): string {
  switch (refusal.reason) {
    case "incomplete":
      return t(
        `ejecuta \`${command} new "<título>" --epic <épica> --slice <corte>\`.`,
        `run \`${command} new "<title>" --epic <epic> --slice <slice>\`.`,
      );
    case "no-epic":
      return t(
        `revisa su id con \`${command} status\`.`,
        `check its id with \`${command} status\`.`,
      );
    default:
      return t(
        `ejecuta \`${command} next\` en la carpeta de la épica, que dice qué corte sigue.`,
        `run \`${command} next\` in the epic's folder, which says which slice comes next.`,
      );
  }
}
