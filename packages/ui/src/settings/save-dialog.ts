// SPDX-License-Identifier: Apache-2.0
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import type { ConfigEdit, SettingChange } from "@baquia-dev/specty-core/light";
import { Button } from "../components/button";
import { DialogFrame } from "../components/dialog";
import { ActionError, type Bilingual, SpectyData } from "../data/records";
import type { ConfigRecord, ConfigSaved } from "../data/source";
import { BeforeLine, WordDiff } from "../review/spec-sections";
import { Preferences } from "../theme/preferences";
import { type ChangeLine, changeLines } from "./settings-edit";

/** What the dialog saves: the changes of the server's last check, the edits and the file read. */
export interface SaveData {
  readonly changes: readonly SettingChange[];
  readonly edits: readonly ConfigEdit[];
  readonly record: ConfigRecord;
}

const PILL = "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium";

/** The marks a change carries in the dialog, with their warning, in the tone of their mark on the page. */
const WARNED = [
  {
    mark: "command",
    tone: "acceptance",
    label: { es: "Ejecuta un comando", en: "Runs a command" },
    warning: {
      es: "Specty ejecutará este comando en tu máquina.",
      en: "Specty will run this command on your machine.",
    },
  },
  {
    mark: "permissions",
    tone: "review",
    label: { es: "Afecta permisos", en: "Affects permissions" },
    warning: {
      es: "Cambia lo que el agente puede hacer sin pedírtelo.",
      en: "It changes what the agent may do without asking you.",
    },
  },
] as const;

/**
 * «Revisar y guardar»: each change of `.specty/config.yaml` with its new value, its added words or
 * elements marked and, only when something was removed, the line «Antes». A change that runs a
 * command or affects permissions says what it implies, and the latter need a confirmation of their
 * own. Saving is the person's alone; a refusal stays in sight, and a save closes with its commit.
 */
@Component({
  selector: "sp-save-dialog",
  imports: [DialogFrame, Button, WordDiff, BeforeLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-dialog #frame [heading]="t()('Revisar y guardar', 'Review and save')" [description]="count()">
      <div role="list" class="-mx-1 flex max-h-[min(60vh,32rem)] flex-col gap-2.5 overflow-y-auto px-1">
        @for (line of lines(); track line.key) {
          <div role="listitem" class="flex flex-col gap-1.5 rounded-lg bg-bg px-3 py-2.5" [attr.data-change]="line.key">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-sm font-medium" data-name>{{ line.name }}</span>
              <code class="font-mono text-[11px] text-text-muted" data-key>{{ line.key }}</code>
              @for (warned of warnedOf(line); track warned.mark) {
                <span [class]="pill" [style.color]="'var(--color-phase-' + warned.tone + ')'" [style.background]="'var(--color-phase-' + warned.tone + '-bg)'" [attr.data-mark]="warned.mark">{{ t()(warned.label.es, warned.label.en) }}</span>
              }
            </div>
            <sp-word-diff class="font-mono text-[12.5px] break-words" data-now [parts]="line.text" />
            @if (line.reset) {
              <span class="text-xs text-text-muted" data-reset-note>{{ t()('Vuelve al valor por defecto', 'Back to its default') }}</span>
            }
            @if (line.before; as before) {
              <sp-before-line class="font-mono" [parts]="before" />
            }
            @for (warned of warnedOf(line); track warned.mark) {
              <p class="m-0 text-xs" [style.color]="'var(--color-phase-review)'" data-warning>{{ t()(warned.warning.es, warned.warning.en) }}</p>
            }
          </div>
        }
      </div>
      @if (permissions()) {
        <label class="flex cursor-pointer items-start gap-2 text-sm" data-confirm>
          <input type="checkbox" class="mt-0.5" [checked]="confirmed()" (change)="confirmed.set(!confirmed())" />
          <span>{{ t()('Entiendo que estos cambios afectan permisos: lo que el agente puede hacer sin pedírmelo.', 'I understand these changes affect permissions: what the agent may do without asking me.') }}</span>
        </label>
      }
      @if (refused(); as why) {
        <p role="alert" class="m-0 rounded-lg border border-border p-3 text-sm" [style.color]="'var(--color-phase-cancelled)'">{{ why }}</p>
      }
      <p class="m-0 text-xs text-text-muted" data-footnote>
        {{ t()('Se guarda en .specty/config.yaml de la carpeta de specty ui, con un commit propio. Los cambios en curso lo reciben al incorporar main.', 'It is saved in the .specty/config.yaml of the specty ui folder, with its own commit. Changes in progress get it when they bring in main.') }}
      </p>
      <sp-button actions data-cancel (pressed)="frame.close()">{{ t()('Cancelar', 'Cancel') }}</sp-button>
      <sp-button actions data-save variant="primary" [disabledReason]="unconfirmed()" [loading]="saving()" (pressed)="save()">{{ t()('Guardar', 'Save') }}</sp-button>
    </sp-dialog>
  `,
})
export class SaveDialog {
  private readonly data = inject<SaveData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<ConfigSaved>>(DialogRef);
  private readonly source = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly pill = PILL;
  protected readonly confirmed = signal(false);
  protected readonly saving = signal(false);
  private readonly refusal = signal<Bilingual | undefined>(undefined);

  protected readonly lines = computed(() =>
    changeLines(this.data.changes, this.data.record, this.preferences.lang()),
  );

  protected readonly permissions = computed(() =>
    this.lines().some((line) => line.setting.permissions === true),
  );

  /** «3 cambios en .specty/config.yaml». */
  protected readonly count = computed(() => {
    const count = this.lines().length;
    return count === 1
      ? this.t()("1 cambio en .specty/config.yaml", "1 change in .specty/config.yaml")
      : this.t()(
          `${count} cambios en .specty/config.yaml`,
          `${count} changes in .specty/config.yaml`,
        );
  });

  /** Why «Guardar» waits: a change of permissions the person has not confirmed. */
  protected readonly unconfirmed = computed(() =>
    this.permissions() && !this.confirmed()
      ? this.t()(
          "Marca antes la confirmación de los permisos.",
          "Tick the confirmation of the permissions first.",
        )
      : "",
  );

  protected readonly refused = computed(() => this.refusal()?.[this.preferences.lang()] ?? "");

  /** The marks of a change that warn: it runs a command, it affects permissions. */
  protected warnedOf(line: ChangeLine) {
    return WARNED.filter(({ mark }) => line.setting[mark] === true);
  }

  protected save(): void {
    this.saving.set(true);
    this.refusal.set(undefined);
    this.source.saveConfig(this.data.edits).then(
      (saved) => this.ref.close(saved),
      (error: unknown) => {
        this.saving.set(false);
        const text = String(error);
        this.refusal.set(error instanceof ActionError ? error.text : { es: text, en: text });
      },
    );
  }
}
