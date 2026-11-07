// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import type { StatsExportFormat, StatsQuery } from "@baquia-dev/specty-core";
import { LucideDownload } from "../components/icons";
import { Menu, type MenuEntry } from "../components/menu";
import { Toasts } from "../components/toast";
import type { Download } from "../data/export";
import { ActionError, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";

/** The formats, in the menu's order, by the name they go by in both languages. */
const FORMATS: readonly StatsExportFormat[] = ["csv", "json"];

/**
 * «Exportar» of the «Panel» page (docs/ui.md): the changes of the cut in sight, one row each
 * with its figures, as the CSV or JSON file the source writes (`GET /api/stats/export`).
 */
@Component({
  selector: "sp-dashboard-export",
  imports: [Menu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex" },
  template: `
    <sp-menu [label]="t()('Exportar', 'Export')" [icon]="icon" [items]="items" (selected)="export($event)" />
  `,
})
export class DashboardExport {
  /** The cut in sight, as the source understood it. */
  readonly query = input.required<StatsQuery>();

  private readonly data = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly icon = LucideDownload;
  protected readonly items: readonly MenuEntry[] = FORMATS.map((id) => ({
    id,
    label: id.toUpperCase(),
  }));

  protected async export(id: string): Promise<void> {
    const format = FORMATS.find((known) => known === id);
    if (format === undefined) return;
    const { period, who, kind } = this.query();
    const lang = this.preferences.lang();
    const t = this.t();
    try {
      const file = await this.data.statsExport({
        period,
        ...(who === undefined ? {} : { who: `${who.kind}:${who.name}` }),
        ...(kind === undefined ? {} : { kind }),
        format,
        lang,
      });
      if (file === undefined) {
        this.toasts.show(
          t(
            "Esta fuente no da la exportación del panel.",
            "This source does not export the dashboard.",
          ),
          "error",
        );
        return;
      }
      save(file);
    } catch (error) {
      const reason = error instanceof ActionError ? ` ${error.text[lang]}` : "";
      this.toasts.show(
        t(`No se pudo exportar el panel.${reason}`, `Could not export the dashboard.${reason}`),
        "error",
      );
    }
  }
}

/** Hands the file to the browser, which saves it as a download, as History's export does. */
function save(download: Download): void {
  const url = URL.createObjectURL(new Blob([download.content], { type: download.type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = download.name;
  link.click();
  // The download starts from the link; the URL can go once it did.
  setTimeout(() => URL.revokeObjectURL(url));
}
