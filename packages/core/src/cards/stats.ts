// SPDX-License-Identifier: Apache-2.0
import { counted } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { CHANGE_KINDS } from "../spec/model";
import type { StatsPeriod, StatsQuery, StatsWho, StatsWhoKind } from "../stats/period";
import type { StatsFigure, StatsSummary, StatsView } from "../stats/summary";
import { blockedCard } from "./flow";
import { aligned, share, span, usd } from "./stats-format";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// The texts of `specty stats` (ARCHITECTURE §6): the panel of `specty ui` in the terminal, written
// from the same `StatsView` that `GET /api/stats` answers.

/** Why `specty stats` prints no summary: the value of an option it does not understand. */
export interface StatsRefusal {
  readonly reason: "period" | "who" | "kind";
  readonly value: string;
}

/**
 * The summary of a cut: its six figures, against the period before unless it is «all», and a
 * table per person, agent and model. With no change of the cut in the period, it says so.
 */
export function statsCard(view: StatsView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { command } = ctx;
  const header = headerOf(
    "stats",
    periodName(view.query.period, t),
    `${view.range.from} – ${view.range.to}`,
    ...cutOf(view.query, t),
  );
  if (view.changes === 0) {
    return {
      status: "ok",
      header,
      blocks: section(undefined, [
        t(
          "No hay ningún cambio en este corte en el periodo.",
          "There is no change in this cut in the period.",
        ),
      ]),
      next: t(
        `prueba un corte más amplio: \`${command} stats --period all\`, sin \`--who\` ni \`--kind\`.`,
        `try a wider cut: \`${command} stats --period all\`, without \`--who\` or \`--kind\`.`,
      ),
    };
  }
  const { period } = view.query;
  const days = view.previous === undefined || period === "all" ? undefined : DAYS[period];
  return {
    status: "ok",
    header,
    blocks: [
      ...section(
        days === undefined
          ? t("INDICADORES", "FIGURES")
          : t(
              `INDICADORES, FRENTE A LOS ${days} DÍAS ANTERIORES`,
              `FIGURES, VS. THE PREVIOUS ${days} DAYS`,
            ),
        figureLines(view.summary, t),
      ),
      ...WHO_KINDS.flatMap((kind) => peopleBlock(view, kind, t)),
      ...phasesBlock(view, t),
      ...costliestBlock(view, t),
    ],
    next: t(
      `el panel completo, con sus gráficas, está en \`${command} ui\` (Panel); para otro corte, \`--period 7d|30d|90d|all\`, \`--who person:<nombre>|agent:<herramienta>|model:<modelo>\` o \`--kind <carril>\`.`,
      `the whole panel, with its charts, is in \`${command} ui\` (Panel); for another cut, \`--period 7d|30d|90d|all\`, \`--who person:<name>|agent:<tool>|model:<model>\` or \`--kind <lane>\`.`,
    ),
  };
}

/** `specty stats` with a period, a who or a lane it does not understand: the valid ones. */
export function statsRefusalCard(refusal: StatsRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { command } = ctx;
  const { value } = refusal;
  const refuse = (reason: string, next: string): Output => ({
    ...blockedCard(headerOf("stats"), reason, next),
    status: "invalid",
  });
  switch (refusal.reason) {
    case "period":
      return refuse(
        t(`No conozco el periodo ${value}.`, `I do not know the period ${value}.`),
        t(
          `elige uno: \`${command} stats --period 7d\`, \`--period 30d\`, \`--period 90d\` o \`--period all\`.`,
          `choose one: \`${command} stats --period 7d\`, \`--period 30d\`, \`--period 90d\` or \`--period all\`.`,
        ),
      );
    case "who":
      return refuse(
        t(
          `No sé a quién se refiere \`--who ${value}\`.`,
          `I do not know who \`--who ${value}\` is.`,
        ),
        t(
          `di quién con \`${command} stats --who person:<nombre>\`, \`--who agent:<herramienta>\` o \`--who model:<modelo>\`; con el nombre vacío, los cambios que no lo dicen.`,
          `say who with \`${command} stats --who person:<name>\`, \`--who agent:<tool>\` or \`--who model:<model>\`; with an empty name, the changes that do not say.`,
        ),
      );
    case "kind": {
      const kinds = `${CHANGE_KINDS.slice(0, -1).join(", ")} ${t("o", "or")} ${CHANGE_KINDS.at(-1)}`;
      return refuse(
        t(`No conozco el carril ${value}.`, `I do not know the lane ${value}.`),
        t(
          `elige uno: ${kinds}, con \`${command} stats --kind <carril>\`.`,
          `choose one: ${kinds}, with \`${command} stats --kind <lane>\`.`,
        ),
      );
    }
  }
}

const DAYS: Readonly<Record<Exclude<StatsPeriod, "all">, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function periodName(period: StatsPeriod, t: Translate): string {
  return period === "all"
    ? t("todo", "all time")
    : t(`últimos ${DAYS[period]} días`, `last ${DAYS[period]} days`);
}

/** The person, agent or model and the lane of the cut, as the header says them. */
function cutOf(query: StatsQuery, t: Translate): string[] {
  return [
    ...(query.who === undefined ? [] : [`${whoWord(query.who.kind, t)} ${nameOf(query.who, t)}`]),
    ...(query.kind === undefined ? [] : [`${t("carril", "lane")} ${query.kind}`]),
  ];
}

function whoWord(kind: StatsWhoKind, t: Translate): string {
  switch (kind) {
    case "person":
      return t("persona", "person");
    case "agent":
      return t("agente", "agent");
    case "model":
      return t("modelo", "model");
  }
}

/** The name, or «(sin dato)» for the changes that do not say. */
function nameOf(who: StatsWho, t: Translate): string {
  return who.name === "" ? t("(sin dato)", "(no data)") : who.name;
}

/** How a figure's value reads. */
type Shape = "count" | "duration" | "share" | "usd";

/** The six figures, in the panel's order: their label and how each reads. */
const FIGURES: readonly {
  readonly id: keyof StatsSummary;
  readonly es: string;
  readonly en: string;
  readonly shape: Shape;
}[] = [
  { id: "closed", es: "Cambios cerrados", en: "Changes closed", shape: "count" },
  { id: "tasks", es: "Tareas completadas", en: "Tasks completed", shape: "count" },
  { id: "cycle", es: "Ciclo (mediana)", en: "Cycle (median)", shape: "duration" },
  {
    id: "verifications",
    es: "Verificaciones que pasan",
    en: "Verifications passing",
    shape: "share",
  },
  { id: "cost", es: "Coste medido", en: "Measured cost", shape: "usd" },
  { id: "pending", es: "Pendientes abiertos", en: "Open pending items", shape: "count" },
];

/** A line per figure: its value, what it is counted on and how it changed. */
function figureLines(summary: StatsSummary, t: Translate): string[] {
  return FIGURES.map(({ id, es, en, shape }) => {
    const figure: StatsFigure = summary[id];
    const value = figure.value === null ? "—" : shown(figure.value, shape, t);
    const delta = figure.value === null ? undefined : deltaOf(figure, t);
    return `${t(es, en)}: ${value}${noteOf(id, summary, t)}${delta === undefined ? "" : ` · ${delta}`}`;
  });
}

/** What a figure is counted on: the task verifications, or the changes the cost was measured on. */
function noteOf(id: keyof StatsSummary, summary: StatsSummary, t: Translate): string {
  const { verifications, cost } = summary;
  switch (id) {
    case "verifications":
      return t(
        ` de ${counted(verifications.count, "verificación de tarea", "verificaciones de tarea")}`,
        ` of ${counted(verifications.count, "task verification", "task verifications")}`,
      );
    case "cost":
      return t(
        ` en ${cost.measured} de ${counted(cost.of, "cambio cerrado", "cambios cerrados")}`,
        ` in ${cost.measured} of ${counted(cost.of, "closed change", "closed changes")}`,
      );
    default:
      return "";
  }
}

/** How a figure changed against the period before: none with «all», as the panel says it. */
function deltaOf(figure: StatsFigure, t: Translate): string | undefined {
  const { change } = figure;
  if (change === undefined) return undefined;
  if (change === null) return t("sin datos antes", "no data before");
  const percent = Math.round(Math.abs(change) * 100);
  if (Math.round(change * 100) === 0) return t("sin cambios", "no change");
  return `${change > 0 ? "▲" : "▼"} ${t(`${percent} %`, `${percent}%`)}`;
}

function shown(value: number, shape: Shape, t: Translate): string {
  switch (shape) {
    case "duration":
      return span(value, t);
    case "share":
      return share(value, t);
    case "usd":
      return usd(value, t);
    case "count":
      return String(value);
  }
}

const WHO_KINDS: readonly StatsWhoKind[] = ["person", "agent", "model"];

/** The table of each person, agent or model of `kind`: none when the view has no row of it. */
function peopleBlock(view: StatsView, kind: StatsWhoKind, t: Translate) {
  const rows = (view.people ?? []).filter((row) => row.who.kind === kind);
  if (rows.length === 0) return [];
  const title = {
    person: t("POR PERSONA", "BY PERSON"),
    agent: t("POR AGENTE", "BY AGENT"),
    model: t("POR MODELO", "BY MODEL"),
  }[kind];
  const head = [
    t("Nombre", "Name"),
    t("Cambios", "Changes"),
    t("Tareas", "Tasks"),
    t("Ciclo", "Cycle"),
    t("Pasan", "Passing"),
    t("Sesiones", "Sessions"),
    t("Coste", "Cost"),
  ];
  const cells = rows.map((row) => [
    nameOf(row.who, t),
    String(row.changes),
    String(row.tasks),
    row.cycle === null ? "—" : span(row.cycle, t),
    row.verifications === null ? "—" : share(row.verifications, t),
    String(row.sessions),
    row.cost === null ? "—" : usd(row.cost, t),
  ]);
  return section(title, aligned([head, ...cells]));
}

/** The phases, in the order of the flow, as the panel names them. */
const PHASES: Readonly<
  Record<
    NonNullable<StatsView["flow"]>["phases"][number]["phase"],
    { readonly es: string; readonly en: string }
  >
> = {
  spec: { es: "Redactar la spec", en: "Write the spec" },
  review: { es: "Revisión hasta aprobar", en: "Review until approved" },
  implementation: { es: "Implementación", en: "Implementation" },
  closing: { es: "Aceptación y cierre", en: "Acceptance and closing" },
};

/** The median time of each phase and on how many changes: none when no phase measures any. */
function phasesBlock(view: StatsView, t: Translate) {
  const phases = view.flow?.phases ?? [];
  if (phases.every((one) => one.changes === 0)) return [];
  const lines = phases.map(({ phase, median, changes }) => {
    const name = t(PHASES[phase].es, PHASES[phase].en);
    if (median === null || changes === 0) return `${name}: —`;
    return `${name}: ${span(median, t)} · ${t(
      `en ${counted(changes, "cambio", "cambios")}`,
      `in ${counted(changes, "change", "changes")}`,
    )}`;
  });
  return section(t("TIEMPO POR FASE (MEDIANA)", "TIME PER PHASE (MEDIAN)"), lines);
}

/** The changes that cost the most in the period, in a table: none when none has a cost. */
function costliestBlock(view: StatsView, t: Translate) {
  const top = view.cost?.top ?? [];
  if (top.length === 0) return [];
  const head = [
    t("Cambio", "Change"),
    t("Carril", "Lane"),
    t("Tareas", "Tasks"),
    t("Ciclo", "Cycle"),
    t("Sesiones", "Sessions"),
    t("Coste", "Cost"),
  ];
  const cells = top.map((change) => [
    change.id,
    change.kind,
    String(change.tasks),
    change.cycle === null ? "—" : span(change.cycle, t),
    String(change.sessions),
    usd(change.cost, t),
  ]);
  return section(t("LOS CAMBIOS MÁS CAROS", "THE COSTLIEST CHANGES"), aligned([head, ...cells]));
}
