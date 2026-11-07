// SPDX-License-Identifier: Apache-2.0
// The panel's requests to the local server (docs/ui.md, «Panel»), as ServerData makes them: the
// panel of a cut (`GET /api/stats`), a page of its table of changes (`GET /api/stats/changes`)
// and its export (`GET /api/stats/export`), with the checks of what each answers.
import type { StatsChangesPage, StatsExportFormat, StatsView } from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import type { Download } from "./export";
import { ActionError } from "./records";
import { answered, isObject, isText, NO_SESSION, UNEXPECTED } from "./server-answers";
import type { StatsChangesParams, StatsParams } from "./source";

/**
 * What the panel's export asks for (docs/ui.md, «Panel», «Exportar»): the cut, as
 * `StatsParams`, the file's format and the language of the CSV's header.
 */
export interface StatsExportParams extends StatsParams {
  readonly format: StatsExportFormat;
  readonly lang: Lang;
}

/** The panel of the cut, with only the parameters the page's URL has. */
export async function fetchStats(params: StatsParams): Promise<StatsView> {
  const query = new URLSearchParams();
  for (const key of ["period", "who", "kind"] as const) {
    const value = params[key];
    if (value !== undefined) query.set(key, value);
  }
  const search = query.size === 0 ? "" : `?${query}`;
  const response = await fetch(`/api/stats${search}`);
  if (response.status === 403) throw new ActionError(NO_SESSION);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isStatsView(body)) throw new ActionError(UNEXPECTED);
  return body;
}

/** A page of the panel's table of changes, found, sorted and cut by the server. */
export async function fetchStatsChanges(params: StatsChangesParams): Promise<StatsChangesPage> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const response = await fetch(`/api/stats/changes?${query}`);
  if (response.status === 403) throw new ActionError(NO_SESSION);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isStatsChangesPage(body)) throw new ActionError(UNEXPECTED);
  return body;
}

/**
 * The file of the cut as the local server writes it, by the name it gives, or by its format: as
 * it comes, bytes and all, so the BOM that tells a spreadsheet the CSV is UTF-8 stays.
 */
export async function fetchStatsExport(params: StatsExportParams): Promise<Download> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, value);
  }
  const response = await fetch(`/api/stats/export?${query}`);
  if (response.status === 403) throw new ActionError(NO_SESSION);
  if (!response.ok) throw new ActionError(answered(response.status));
  const disposition = response.headers.get("content-disposition") ?? "";
  const named = /filename="([^"]+)"/.exec(disposition)?.[1];
  return {
    name: named ?? `specty-stats.${params.format}`,
    type: response.headers.get("content-type") ?? "",
    content: new Uint8Array(await response.arrayBuffer()),
  };
}

/** The figures the panel shows first (`StatsSummary`). */
const FIGURES = ["closed", "tasks", "cycle", "verifications", "cost", "pending"] as const;

/**
 * `GET /api/stats`' answer: its cut and period, how many changes, who can be chosen, and each of
 * the six figures with a number or nothing for its value.
 */
function isStatsView(value: unknown): value is StatsView {
  if (!isObject(value) || !isObject(value.query) || !isObject(value.range)) return false;
  const { summary } = value;
  const figure = (item: unknown) =>
    isObject(item) && (item.value === null || typeof item.value === "number");
  return (
    typeof value.changes === "number" &&
    Array.isArray(value.options) &&
    isObject(summary) &&
    FIGURES.every((key) => figure(summary[key]))
  );
}

/**
 * `GET /api/stats/changes`' answer: its cut, period and table values, how many match, and each
 * change of the page with the texts and numbers its row needs.
 */
function isStatsChangesPage(value: unknown): value is StatsChangesPage {
  if (!isObject(value) || !isObject(value.query) || !isObject(value.range)) return false;
  return (
    isObject(value.table) &&
    typeof value.total === "number" &&
    Array.isArray(value.changes) &&
    value.changes.every(
      (change) =>
        isObject(change) &&
        ["id", "title", "kind"].every((key) => isText(change[key])) &&
        typeof change.tasks === "number" &&
        typeof change.failed === "number",
    )
  );
}
