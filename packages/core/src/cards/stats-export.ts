// SPDX-License-Identifier: Apache-2.0
// The words of the panel's export (docs/ui.md, «Panel», «Exportar»): the CSV's header and the
// lanes by the names of their badges, in Spanish and in English.
import type { Lang } from "../i18n";
import type { ChangeKind } from "../spec/model";
import type { StatsExportColumn } from "../stats/export";
import { translator } from "./text";

/** The CSV's header of each column, in `lang`. */
export function statsExportHeaders(lang: Lang): Readonly<Record<StatsExportColumn, string>> {
  const t = translator(lang);
  return {
    id: t("Cambio", "Change"),
    title: t("Título", "Title"),
    kind: t("Carril", "Lane"),
    size: t("Tamaño", "Size"),
    person: t("Persona", "Person"),
    agent: t("Agente", "Agent"),
    model: t("Modelo", "Model"),
    created: t("Creado", "Created"),
    closed: t("Cerrado", "Closed"),
    tasks: t("Tareas", "Tasks"),
    cycle: t("Ciclo (horas)", "Cycle (hours)"),
    verifications: t("Verificaciones", "Verifications"),
    failed: t("Verificaciones fallidas", "Failed verifications"),
    cost: t("Coste (USD)", "Cost (USD)"),
  };
}

/** A lane by the name of its badge in the UI: Feature, Quick, Épica, Spike or Manual. */
export function statsLaneName(kind: ChangeKind, lang: Lang): string {
  const names: Readonly<Record<ChangeKind, string>> = {
    standard: "Feature",
    quick: "Quick",
    epic: translator(lang)("Épica", "Epic"),
    spike: "Spike",
    retro: "Manual",
  };
  return names[kind];
}
