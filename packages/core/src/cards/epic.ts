// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext, ChangeView, SliceView } from "./view";

/**
 * An approved epic's card: it has no tasks, so it shows its slices, each one a change of its own,
 * and the next step, to go on with the slice in progress or to start the first one ready.
 */
export function epicCard(change: ChangeView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const slices = change.slices ?? [];
  const closed = slices.filter((slice) => slice.status === "done").length;
  const open = slices.find((slice) => slice.status === "open");
  const ready = slices.find((slice) => slice.status === "ready");
  const start = (slice: SliceView) =>
    `\`${ctx.command} new "${slice.title}" --epic ${change.id} --slice ${slice.id}\``;
  return {
    status: "ok",
    header: headerOf(change.id, "implementing"),
    blocks: section(
      t(
        `CORTES (${closed} de ${slices.length} cerrados)`,
        `SLICES (${closed} of ${slices.length} closed)`,
      ),
      sliceLines(slices, ctx),
    ),
    next:
      open !== undefined
        ? t(
            `sigue con el corte ${open.id} en su carpeta, ${open.child?.folder ?? open.child?.id}: ejecuta \`${ctx.command} next\` allí.`,
            `go on with slice ${open.id} in its folder, ${open.child?.folder ?? open.child?.id}: run \`${ctx.command} next\` there.`,
          )
        : ready !== undefined
          ? t(
              `empieza el corte ${ready.id}: ${start(ready)} y sigue su salida.`,
              `start slice ${ready.id}: ${start(ready)} and follow its output.`,
            )
          : closed === slices.length
            ? t(
                `todos los cortes están cerrados: ejecuta \`${ctx.command} next\` para pasar la épica a aceptación.`,
                `every slice is closed: run \`${ctx.command} next\` to move the epic to acceptance.`,
              )
            : t(
                "ningún corte puede empezar: sus `depends` esperan cortes que no se cierran. Revísalo con el usuario.",
                "no slice can start: their `depends` wait for slices that do not close. Review it with the user.",
              ),
  };
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
  const { command } = ctx;
  const refuse = (status: "invalid" | "blocked", reason: string, next: string): Output => ({
    ...blockedCard(headerOf(), reason, next),
    status,
  });
  const resume = t(
    `ejecuta \`${command} next\` en la carpeta de la épica, que dice qué corte sigue.`,
    `run \`${command} next\` in the epic's folder, which says which slice comes next.`,
  );
  switch (refusal.reason) {
    case "incomplete":
      return refuse(
        "invalid",
        t(
          "`--epic` y `--slice` van juntos: la épica y el corte que implementa el cambio.",
          "`--epic` and `--slice` go together: the epic and the slice the change implements.",
        ),
        t(
          `ejecuta \`${command} new "<título>" --epic <épica> --slice <corte>\`.`,
          `run \`${command} new "<title>" --epic <epic> --slice <slice>\`.`,
        ),
      );
    case "no-epic":
      return refuse(
        "invalid",
        t(
          `No hay ninguna épica abierta ${refusal.epic}.`,
          `There is no open epic ${refusal.epic}.`,
        ),
        t(`revisa su id con \`${command} status\`.`, `check its id with \`${command} status\`.`),
      );
    case "not-approved":
      return refuse(
        "blocked",
        t(
          `La épica ${refusal.epic} aún no está aprobada (fase ${refusal.phase}).`,
          `Epic ${refusal.epic} is not approved yet (phase ${refusal.phase}).`,
        ),
        resume,
      );
    case "no-slice": {
      const ids = refusal.slices.join(", ");
      return refuse(
        "invalid",
        t(
          `La épica ${refusal.epic} no tiene el corte ${refusal.slice}; sus cortes: ${ids}.`,
          `Epic ${refusal.epic} has no slice ${refusal.slice}; its slices: ${ids}.`,
        ),
        resume,
      );
    }
    case "taken":
      return refuse(
        "blocked",
        t(
          `El corte ${refusal.slice} ya tiene un cambio: ${refusal.child.id}, en ${refusal.child.phase}.`,
          `Slice ${refusal.slice} already has a change: ${refusal.child.id}, in ${refusal.child.phase}.`,
        ),
        resume,
      );
    case "waiting": {
      const waiting = refusal.waiting.join(", ");
      return refuse(
        "blocked",
        t(
          `El corte ${refusal.slice} depende de cortes que aún no están cerrados: ${waiting}.`,
          `Slice ${refusal.slice} depends on slices that are not closed yet: ${waiting}.`,
        ),
        resume,
      );
    }
  }
}
