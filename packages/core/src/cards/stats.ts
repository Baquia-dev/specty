// SPDX-License-Identifier: Apache-2.0
import { counted } from "../i18n";
import { headerOf, type Output, section } from "../output";
import { CHANGE_KINDS } from "../spec/model";
import type { StatsPeriod, StatsQuery, StatsWho, StatsWhoKind } from "../stats/period";
import type { StatsFigure, StatsSummary, StatsView } from "../stats/summary";
import { blockedCard } from "./flow";
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

/** The rows of a table, their columns apart: the first to the left, the others to the right. */
function aligned(rows: readonly (readonly string[])[]): string[] {
  const widths = (rows[0] ?? []).map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  return rows.map((row) =>
    row
      .map((cell, column) =>
        column === 0 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0),
      )
      .join("  "),
  );
}

/** A share from 0 to 1, with a decimal when it has one: `92,5 %` or `92.5%`. */
function share(value: number, t: Translate): string {
  const tenths = Math.round(value * 1000) / 10;
  const number = Number.isInteger(tenths) ? String(tenths) : decimal(tenths, 1, t);
  return t(`${number} %`, `${number}%`);
}

/** US dollars, with two decimals: `12,30 USD` or `12.30 USD`. */
function usd(value: number, t: Translate): string {
  return `${decimal(value, 2, t)} USD`;
}

function decimal(value: number, digits: number, t: Translate): string {
  return value.toFixed(digits).replace(".", t(",", "."));
}

/** Milliseconds as the panel says them: seconds, minutes, hours and minutes, or days and hours. */
function span(ms: number, t: Translate): string {
  if (ms < 1_000) return t("menos de 1 s", "under 1 s");
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) {
    const rest = minutes % 60;
    return rest === 0
      ? `${Math.floor(minutes / 60)} h`
      : `${Math.floor(minutes / 60)} h ${rest} min`;
  }
  const hours = Math.round(ms / 3_600_000);
  const rest = hours % 24;
  return rest === 0 ? `${Math.floor(hours / 24)} d` : `${Math.floor(hours / 24)} d ${rest} h`;
}
