// SPDX-License-Identifier: Apache-2.0
// The panel's export from the local server (`GET /api/stats/export`): the file as it comes, bytes
// and all, so the BOM that tells a spreadsheet the CSV is UTF-8 stays.
import type { StatsExportFormat } from "@baquia-dev/specty-core";
import type { Lang } from "@baquia-dev/specty-core/light";
import type { Download } from "./export";
import { ActionError } from "./records";
import { answered, NO_SESSION } from "./server-answers";
import type { StatsParams } from "./source";

/**
 * What the panel's export asks for (docs/ui.md, «Panel», «Exportar»): the cut, as
 * `StatsParams`, the file's format and the language of the CSV's header.
 */
export interface StatsExportParams extends StatsParams {
  readonly format: StatsExportFormat;
  readonly lang: Lang;
}

/** The file of the cut as the local server writes it, by the name it gives, or by its format. */
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
