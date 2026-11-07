// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import { type Piece, pieceText, type Setting } from "@baquia-dev/specty-core/light";
import { LucideDynamicIcon } from "@lucide/angular";
import { DelegationSetting } from "../app/delegation";
import { Button } from "../components/button";
import { LucideLock } from "../components/icons";
import { Preferences } from "../theme/preferences";
import { type FieldView, SettingRowView } from "./setting-row";
import { type Draft, resetDraft } from "./settings-edit";
import type { SettingRow } from "./settings-view";

const PILL = "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium";

/**
 * A piece of the chosen phase in Avanzado: its name, its marks and what it does; of a guarantee, a
 * lock and why it is not removed. Equipped, its settings with their controls and «Quitar» if it can
 * be removed; to equip, «Equipar». Delegated mode has the preferences menu's control instead.
 */
@Component({
  selector: "sp-flow-piece",
  imports: [LucideDynamicIcon, Button, SettingRowView, DelegationSetting],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "listitem",
    class: "flex flex-col gap-2 py-3",
    "[attr.data-piece]": "piece().id",
  },
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex min-w-0 flex-col gap-1">
        <span class="flex flex-wrap items-center gap-1.5">
          @if (piece().guarantee) {
            <svg class="text-text-muted" [lucideIcon]="lockIcon" size="14" aria-hidden="true" data-lock></svg>
          }
          <span class="text-sm font-semibold" data-piece-name>{{ text().name }}</span>
          @if (piece().guarantee) {
            <span [class]="pill" style="color: var(--color-phase-closing); background: var(--color-phase-closing-bg)" data-mark="guarantee">{{ t()('Garantía de Specty', 'Specty guarantee') }}</span>
          }
          @if (piece().soon) {
            <span [class]="pill" style="color: var(--color-phase-draft); background: var(--color-phase-draft-bg)" data-mark="soon">{{ t()('Próximamente', 'Coming soon') }}</span>
          }
        </span>
        <span class="text-sm text-text-muted" data-piece-description>{{ text().description }}</span>
        @if (text().why; as why) {
          <span class="text-xs text-text-muted" data-why>{{ why }}</span>
        }
      </div>
      @if (piece().clone) {
        <sp-delegation-setting class="shrink-0" legendClass="sr-only" />
      } @else if (switchable() && editable()) {
        @if (equipped()) {
          <sp-button data-remove size="sm" variant="ghost" (pressed)="toggle.emit(false)">{{ t()('Quitar', 'Remove') }}</sp-button>
        } @else {
          <sp-button data-equip size="sm" (pressed)="toggle.emit(true)">{{ t()('Equipar', 'Equip') }}</sp-button>
        }
      }
    </div>
    @if (equipped() && rows().length > 0) {
      <div role="list" class="flex flex-col gap-0.5 pl-4">
        @for (row of rows(); track row.setting.key) {
          <sp-setting-row [view]="row" [fields]="fields().get(row.setting.key) ?? []" [pending]="pending().has(row.setting.key)" [resettable]="resettable().has(row.setting.key)" (edit)="edit.emit($event)" (reset)="reset(row.setting)" />
        }
      </div>
    }
  `,
})
export class FlowPiece {
  readonly piece = input.required<Piece>();
  /** In the phase's equipped pieces; else, among those to equip. */
  readonly equipped = input(false);
  /** Whether the person can change the settings here. */
  readonly editable = input(false);
  /** Its settings, as the view General shows them. */
  readonly rows = input<readonly SettingRow[]>([]);
  readonly fields = input<ReadonlyMap<string, readonly FieldView[]>>(new Map());
  readonly pending = input<ReadonlySet<string>>(new Set());
  /** The settings whose key is in the file, so «Restablecer» can take it out. */
  readonly resettable = input<ReadonlySet<string>>(new Set());
  /** «Equipar» (true) or «Quitar» (false). */
  readonly toggle = output<boolean>();
  /** An edit of one of its settings. */
  readonly edit = output<Draft>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly pill = PILL;
  protected readonly lockIcon = LucideLock;
  protected readonly text = computed(() => pieceText(this.piece().id, this.preferences.lang()));

  /** One of yes or no, or of a command: the person equips and removes it. */
  protected readonly switchable = computed(() => {
    const piece = this.piece();
    return piece.toggle !== undefined || piece.command !== undefined;
  });

  protected reset(setting: Setting): void {
    this.edit.emit(resetDraft(setting));
  }
}
