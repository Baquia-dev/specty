// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
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
