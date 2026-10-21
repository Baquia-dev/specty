// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { LucideDownload } from "@lucide/angular";
import { PhaseBadge } from "../components/badge";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { Collapsible } from "../components/collapsible";
import { DialogFrame, Dialogs } from "../components/dialog";
import { Field } from "../components/field";
import { Kbd } from "../components/kbd";
import { Menu } from "../components/menu";
import { TabPanel, Tabs } from "../components/tabs";
import { type ToastKind, Toasts } from "../components/toast";
import { Shortcuts } from "../keyboard/shortcuts";
import { Preferences } from "../theme/preferences";

/** Example dialog: reject an assumption and tell the agent why. */
@Component({
  selector: "sp-reject-dialog",
  imports: [DialogFrame, Field, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog
      #frame
      [heading]="t()('Rechazar el supuesto A2', 'Reject assumption A2')"
      [description]="t()('El agente leerá el motivo en specty next.', 'The agent will read the reason in specty next.')"
    >
      <sp-field [label]="t()('Motivo', 'Reason')" [multiline]="true" [(value)]="reason" />
      <sp-button actions (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button
        actions
        variant="primary"
        [disabledReason]="reason() ? '' : t()('Escribe el motivo primero.', 'Write the reason first.')"
        (pressed)="frame.close()"
      >
        {{ t()('Rechazar', 'Reject') }}
      </sp-button>
    </sp-dialog>
  `,
})
export class RejectDialog {
  protected readonly t = inject(Preferences).t;
  protected readonly reason = signal("");
}

/** Overlays and keyboard pieces in use, plus a j/k list. */
@Component({
  selector: "sp-overlays",
  imports: [Button, Card, Collapsible, Kbd, Menu, PhaseBadge, TabPanel, Tabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mt-0 mb-2 text-xl font-semibold">{{ t()('Superposiciones y teclado', 'Overlays and keyboard') }}</h1>
    <p class="mt-0 mb-8 flex max-w-[64ch] flex-wrap items-center gap-2 text-text-muted">
      {{ t()('Abre la paleta con', 'Open the palette with') }} <sp-kbd keys="mod+k" />
      {{ t()('y la lista de atajos con', 'and the shortcut list with') }} <sp-kbd keys="?" />.
    </p>

    <section class="mb-10" aria-labelledby="floating">
      <h2 id="floating" class="mb-4 text-lg font-semibold">{{ t()('Diálogo, menú y avisos', 'Dialog, menu and toasts') }}</h2>
      <div class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <sp-button id="open-dialog" (pressed)="openDialog()">{{ t()('Rechazar supuesto…', 'Reject assumption…') }}</sp-button>
        <sp-menu [label]="t()('Exportar', 'Export')" [icon]="download" [items]="formats" (selected)="exported($event)" />
        @for (kind of kinds; track kind) {
          <sp-button variant="ghost" size="sm" (pressed)="toast(kind)">{{ kindLabel(kind) }}</sp-button>
        }
      </div>
    </section>

    <section class="mb-10" aria-labelledby="structure">
      <h2 id="structure" class="mb-4 text-lg font-semibold">{{ t()('Pestañas y plegable', 'Tabs and collapsible') }}</h2>
      <div class="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <sp-tabs [label]="t()('Cambio', 'Change')">
          <sp-tab-panel value="spec" label="Spec">{{ t()('Supuestos, criterios y archivos.', 'Assumptions, criteria and files.') }}</sp-tab-panel>
          <sp-tab-panel value="progress" [label]="t()('Progreso', 'Progress')">{{ t()('Tareas y verificación.', 'Tasks and verification.') }}</sp-tab-panel>
          <sp-tab-panel value="history" [label]="t()('Historial', 'History')">{{ t()('Eventos del cambio.', 'Events of the change.') }}</sp-tab-panel>
        </sp-tabs>
        <sp-collapsible [label]="t()('Diseño', 'Design')">
          <p class="m-0 text-sm text-text-muted">{{ t()('El detalle técnico, plegado por defecto.', 'Technical detail, folded by default.') }}</p>
        </sp-collapsible>
      </div>
    </section>

    <section aria-labelledby="keyboard">
      <h2 id="keyboard" class="mb-4 flex items-center gap-2 text-lg font-semibold">
        {{ t()('Lista con', 'List with') }} <sp-kbd keys="j" /> <sp-kbd keys="k" />
      </h2>
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        @for (change of changes(); track change.title; let index = $index) {
          <li>
            <sp-card [selected]="index === current()">
              <sp-phase-badge [phase]="change.phase" />
              <span>{{ change.title }}</span>
            </sp-card>
          </li>
        }
      </ul>
    </section>
  `,
})
export class Overlays {
  private readonly preferences = inject(Preferences);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  protected readonly t = this.preferences.t;
  protected readonly download = LucideDownload;
  protected readonly kinds: readonly ToastKind[] = ["info", "success", "warning", "error"];
  protected readonly formats = [
    { id: "md", label: "Markdown" },
    { id: "json", label: "JSON" },
    { id: "openspec", label: "OpenSpec" },
  ];
  protected readonly current = signal(0);
  protected readonly changes = computed(() => {
    const t = this.t();
    return [
      { phase: "review", title: t("Agrupar la evolución por trimestre", "Group progress by term") },
      {
        phase: "implementing",
        title: t("Exportar boletines en PDF", "Export report cards as PDF"),
      },
      { phase: "acceptance", title: t("Panel de asistencia", "Attendance panel") },
      { phase: "done", title: t("Login con Google", "Google sign-in") },
    ] as const;
  });

  constructor() {
    const shortcuts = inject(Shortcuts);
    const move = (step: number) => () =>
      this.current.update((index) =>
        Math.min(Math.max(index + step, 0), this.changes().length - 1),
      );
    shortcuts.register({
      keys: "j",
      description: { es: "Siguiente de la lista", en: "Next in the list" },
      run: move(1),
    });
    shortcuts.register({
      keys: "k",
      description: { es: "Anterior de la lista", en: "Previous in the list" },
      run: move(-1),
    });
  }

  protected openDialog(): void {
    this.dialogs.open(RejectDialog);
  }

  protected exported(format: string): void {
    const label = this.formats.find((entry) => entry.id === format)?.label ?? format;
    this.toasts.show(this.t()(`Exportado a ${label}.`, `Exported to ${label}.`), "success");
  }

  protected toast(kind: ToastKind): void {
    this.toasts.show(this.kindLabel(kind), kind);
  }

  protected kindLabel(kind: ToastKind): string {
    const t = this.t();
    return {
      info: t("Aviso informativo", "Info toast"),
      success: t("Aviso de éxito", "Success toast"),
      warning: t("Aviso de cuidado", "Warning toast"),
      error: t("Aviso de error", "Error toast"),
    }[kind];
  }
}
