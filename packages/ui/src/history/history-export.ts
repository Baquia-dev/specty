// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core";
import { LucideDownload } from "../components/icons";
import { Menu, type MenuEntry } from "../components/menu";
import { Toasts } from "../components/toast";
import { type Download, type ExportChoice, exportOf } from "../data/export";
import { SpectyData } from "../data/records";
import { ActionError } from "../data/source";
import { Preferences } from "../theme/preferences";

/** Each format, in the menu's order, by the name it goes by: the same in both languages. */
const LABELS: Readonly<Record<ExportChoice, string>> = {
  markdown: "Markdown",
  json: "JSON",
  openspec: "OpenSpec",
  speckit: "Spec Kit",
  kiro: "Kiro",
};
const FORMATS: readonly ExportChoice[] = ["markdown", "json", "openspec", "speckit", "kiro"];

/**
 * «Exportar» of the History tab (docs/ui.md, Historial): the change's audit report in Markdown or
 * JSON, as `specty audit` writes it, or its spec in OpenSpec, Spec Kit or Kiro, as `specty
 * export` does, downloaded from the change as the source has it now.
 */
@Component({
  selector: "sp-history-export",
  imports: [Menu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex" },
  template: `
    <sp-menu [label]="t()('Exportar', 'Export')" [icon]="icon" [items]="items" (selected)="export($event)" />
  `,
})
export class HistoryExport {
  readonly change = input.required<string>();

  private readonly data = inject(SpectyData);
  private readonly toasts = inject(Toasts);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly icon = LucideDownload;
  protected readonly items: readonly MenuEntry[] = FORMATS.map((id) => ({ id, label: LABELS[id] }));
  protected async export(id: string): Promise<void> {
    const choice = FORMATS.find((format) => format === id);
    if (choice === undefined) return;
    const t = this.t();
    try {
      const record = (await this.data.changes()).find((item) => item.state.id === this.change());
      if (record === undefined) {
        this.toasts.show(
          t(
            "Este cambio ya no está en la fuente de datos: no hay nada que exportar.",
            "This change is no longer in the data source: there is nothing to export.",
          ),
          "error",
        );
        return;
      }
      save(exportOf(record, choice, this.preferences.lang()));
    } catch (error) {
      const reason = error instanceof ActionError ? ` ${error.text[this.preferences.lang()]}` : "";
      this.toasts.show(
        t(
          `No se pudo leer el cambio para exportarlo.${reason}`,
          `Could not read the change to export it.${reason}`,
        ),
        "error",
      );
    }
  }
}

/** Hands the file to the browser, which saves it as a download. */
function save(download: Download): void {
  const url = URL.createObjectURL(new Blob([download.content], { type: download.type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = download.name;
  link.click();
  // The download starts from the link; the URL can go once it did.
  setTimeout(() => URL.revokeObjectURL(url));
}
