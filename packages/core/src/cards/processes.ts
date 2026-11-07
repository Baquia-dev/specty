// SPDX-License-Identifier: Apache-2.0
import { counted, type Lang } from "../i18n";
import { type Translate, translator } from "./text";

// The line a verification's command says as it starts: how many processes it may start
// (`verify.processes`), and why, so that a suite that takes longer tells the person what held it.

/** A variable of `verify.processes.env` and the number it gets. */
interface ProcessVariable {
  readonly name: string;
  readonly value: number;
}

/** What a verification's command counts on, and the number it gets. */
export interface ProcessBudgetView {
  /** The processes it may start: the fewest of its cores and of those that fit in its memory. */
  readonly budget: number;
  /** Each variable of `verify.processes.env`, with the number it gets, or the smaller one it kept. */
  readonly variables: readonly ProcessVariable[];
  /** The memory available on the machine as the command starts, in bytes. */
  readonly memory: number;
  readonly cores: number;
  /** The places of `verify.slots` it holds. */
  readonly places: number;
  readonly slots: number;
}

const GB = 1024 ** 3;

/** Names in a sentence: the last one after «y» or «and». */
function listed(names: readonly string[], t: Translate): string {
  const last = names.at(-1) ?? "";
  return names.length < 2 ? last : `${names.slice(0, -1).join(", ")}${t(" y ", " and ")}${last}`;
}

/**
 * The line a verification's command says on the error output as it starts, as `verifyingNote`
 * does: the number, the variables that get it, apart those that keep the smaller number of their
 * environment, and what it comes from, the memory available in GB, the cores and its places.
 */
export function processBudgetNote(view: ProcessBudgetView, lang: Lang): string {
  const t = translator(lang);
  const { budget, variables, memory, cores, places, slots } = view;
  const given = variables.filter(({ value }) => value === budget).map(({ name }) => name);
  const kept = variables.filter(({ value }) => value !== budget);
  const into = given.length === 0 ? "" : `${t(" en ", " in ")}${listed(given, t)}`;
  const own = kept.map(({ name, value }) => `${name}=${value}`).join(", ");
  const apart =
    kept.length === 0
      ? ""
      : kept.length === 1
        ? t(`; se queda con el de su entorno: ${own}`, `; keeps its environment's: ${own}`)
        : t(`; se quedan con el de su entorno: ${own}`, `; keep their environment's: ${own}`);
  const gb = (memory / GB).toFixed(1).replace(".", t(",", "."));
  const from = t(
    `${gb} GB de memoria disponible, ${counted(cores, "núcleo", "núcleos")}, ${places} de ${counted(slots, "plaza", "plazas")}`,
    `${gb} GB of memory available, ${counted(cores, "core", "cores")}, ${places} of ${counted(slots, "place", "places")}`,
  );
  const number = t(counted(budget, "proceso", "procesos"), counted(budget, "process", "processes"));
  return `specty: ${number}${into}${apart} (${from})`;
}
