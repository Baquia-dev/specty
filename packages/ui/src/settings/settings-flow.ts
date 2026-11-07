// SPDX-License-Identifier: Apache-2.0
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import {
  type ConfigEdit,
  type FlowPhase,
  flowPhases,
  flowSentences,
  isEquipped,
  type Lang,
  PIECES,
  type Piece,
  pieceEdits,
  pieceText,
  type SettingValue,
} from "@baquia-dev/specty-core/light";
import { LucideDynamicIcon } from "@lucide/angular";
import { PhaseBadge } from "../components/badge";
import { LIST, SectionDivider } from "../components/document";
import { LucideLock } from "../components/icons";
import type { ConfigRecord } from "../data/source";
import { Preferences } from "../theme/preferences";
import { PHASE_LABELS } from "../theme/tokens";
import { FlowPiece } from "./flow-piece";
import type { FieldView } from "./setting-row";
import { applyEdits, type Draft } from "./settings-edit";
import { SettingsMode } from "./settings-mode";
import { type SettingRow, valueAt } from "./settings-view";

/** A piece in its phase of the line: its name and, of a guarantee, why it is not removed. */
interface Slot {
  readonly id: string;
  readonly name: string;
  readonly why?: string;
  readonly guarantee: boolean;
  readonly soon: boolean;
}

/** A sentence's parts: commands go between backticks, and show in mono. */
const partsOf = (sentence: string) =>
  sentence.split("`").map((text, index) => ({ text, code: index % 2 === 1 }));

const SLOT =
  "flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] leading-snug";
/** An equipped piece on the surface; a fixed one, a guarantee or one with no key yet, dashed. */
const SLOT_ON = `${SLOT} border-border bg-surface text-text`;
const SLOT_FIXED = `${SLOT} border-dashed border-border text-text-muted`;

const HEAD =
  "inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent p-0.5 font-sans text-xs text-text-muted outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-text/40";

/**
 * The view Flujo of the page «Configuración»: the phases of a change in line, each with the pieces
 * the configuration equips with the page's edits, Specty's guarantees with a lock. In Básico, the
 * line has no controls and sentences say what the flow does; in Avanzado, each phase is a button
 * that chooses it, and under the line go the chosen phase's equipped pieces, with their settings,
 * and those to equip. Equipping and removing a piece are edits of the page, as its settings' are.
 */
@Component({
  selector: "sp-settings-flow",
  imports: [LucideDynamicIcon, PhaseBadge, SectionDivider, FlowPiece],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex flex-col gap-8" },
  template: `
    <ol data-line class="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-6 p-0 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
      @for (column of line(); track column.phase) {
        <li class="flex min-w-0 flex-col gap-2" [attr.data-phase-column]="column.phase">
          @if (basic()) {
            <div class="inline-flex items-center gap-2 text-xs text-text-muted" data-phase-head>
              <sp-phase-badge data-phase-name [phase]="column.phase" />
              <span class="tabular-nums" data-phase-count>{{ column.slots.length }}</span>
            </div>
          } @else {
            <button type="button" [class]="head" [attr.aria-pressed]="column.phase === current()" (click)="selected.set(column.phase)" data-phase-head>
              <sp-phase-badge data-phase-name [phase]="column.phase" />
              <span class="tabular-nums" data-phase-count>{{ column.slots.length }}</span>
            </button>
          }
          <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
            @for (slot of column.slots; track slot.id) {
              <li [class]="slot.guarantee || slot.soon ? slotFixed : slotOn" [attr.title]="slot.why ?? null" [attr.data-slot]="slot.id">
                @if (slot.guarantee) {
                  <svg class="shrink-0" [lucideIcon]="lockIcon" size="12" role="img" [attr.aria-label]="t()('Garantía de Specty', 'Specty guarantee')" data-lock></svg>
                }
                <span class="min-w-0 break-words">{{ slot.name }}</span>
                @if (slot.soon) {
                  <span class="inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-medium" style="color: var(--color-phase-draft); background: var(--color-phase-draft-bg)" data-mark="soon">{{ t()('Próximamente', 'Coming soon') }}</span>
                }
              </li>
            }
          </ul>
        </li>
      }
    </ol>
    @if (basic()) {
      <ul class="m-0 flex list-none flex-col gap-1.5 p-0 pl-6 text-sm" data-sentences>
        @for (sentence of sentences(); track $index) {
          <li class="before:mr-2 before:text-text-muted before:content-['→']">@for (part of sentence; track $index) {@if (part.code) {<code class="font-mono text-[0.9em]">{{ part.text }}</code>} @else {<span>{{ part.text }}</span>}}</li>
        }
      </ul>
    } @else {
      <div class="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section class="min-w-0" data-equipped>
          <sp-section-divider [heading]="t()('Equipado en ' + phaseName(), 'Equipped in ' + phaseName())" [meta]="equipped().length" />
          <div role="list" [class]="list + ' mt-2'">
            @for (piece of equipped(); track piece.id) {
              <sp-flow-piece [piece]="piece" [equipped]="true" [editable]="editable()" [rows]="rowsOf(piece)" [fields]="fields()" [pending]="pending()" [resettable]="resettable()" (toggle)="toggle(piece, $event)" (edit)="edit.emit($event)" />
            }
          </div>
        </section>
        <section class="min-w-0" data-library>
          <sp-section-divider [heading]="t()('Para equipar', 'To equip')" [meta]="library().length" />
          @if (library().length === 0) {
            <p class="m-0 mt-2 pl-6 text-sm text-text-muted">{{ t()('Esta fase no tiene más piezas.', 'This phase has no more pieces.') }}</p>
          }
          <div role="list" [class]="list + ' mt-2'">
            @for (piece of library(); track piece.id) {
              <sp-flow-piece [piece]="piece" [editable]="editable()" (toggle)="toggle(piece, $event)" />
            }
          </div>
        </section>
      </div>
    }
  `,
})
export class SettingsFlow {
  /** The configuration the server gives. */
  readonly record = input.required<ConfigRecord>();
  /** The page's edits, not saved yet. */
  readonly edits = input<readonly ConfigEdit[]>([]);
  /** Delegated mode in the clone; undefined when the source cannot tell. */
  readonly delegated = input<boolean | undefined>(undefined);
  /** Whether the person can change the settings here. */
  readonly editable = input(false);
  /** Each setting as the view General shows it. */
  readonly rows = input<readonly SettingRow[]>([]);
  /** Each setting's controls, by its key; none where the person cannot change it. */
  readonly fields = input<ReadonlyMap<string, readonly FieldView[]>>(new Map());
  /** The settings whose edits are not saved yet. */
  readonly pending = input<ReadonlySet<string>>(new Set());
  /** An edit of a piece or of one of its settings, for the page's edits. */
  readonly edit = output<Draft>();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly basic = inject(SettingsMode).basic;
  protected readonly lockIcon = LucideLock;
  protected readonly slotOn = SLOT_ON;
  protected readonly slotFixed = SLOT_FIXED;
  protected readonly head = HEAD;
  protected readonly list = LIST;
  /** The phase chosen in Avanzado. */
  protected readonly selected = signal<FlowPhase>("implementing");
  /** The pieces of a command the person equipped, whose command is not written yet. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  /** Each setting's value with the page's edits, or else its default; delegated mode, the clone's. */
  protected readonly value = computed((): SettingValue => {
    const record = this.record();
    const edited = applyEdits(record.input, this.edits());
    const delegated = this.delegated();
    return (key) =>
      key === "specty delegate"
        ? delegated
        : (valueAt(edited, key) ?? valueAt(record.defaults, key));
  });

  /** The phases the configuration shows, each with the pieces it equips. */
  protected readonly line = computed(() => {
    const value = this.value();
    const lang = this.preferences.lang();
    return flowPhases(value).map((phase) => ({
      phase,
      slots: PIECES.filter((piece) => piece.phase === phase && isEquipped(piece, value)).map(
        (piece): Slot => slotOf(piece, lang),
      ),
    }));
  });

  /** The chosen phase, or Implementación when the chosen one is no longer in the line. */
  protected readonly current = computed((): FlowPhase => {
    const chosen = this.selected();
    return this.line().some(({ phase }) => phase === chosen) ? chosen : "implementing";
  });

  protected readonly sentences = computed(() =>
    flowSentences(this.value(), this.preferences.lang()).map(partsOf),
  );

  protected readonly phaseName = computed(
    () => PHASE_LABELS[this.current()][this.preferences.lang()],
  );

  /** The chosen phase's equipped pieces, and those of a command waiting for theirs. */
  protected readonly equipped = computed(() => {
    const value = this.value();
    const opened = this.opened();
    return PIECES.filter(
      (piece) =>
        piece.phase === this.current() && (isEquipped(piece, value) || opened.has(piece.id)),
    );
  });

  /** The chosen phase's pieces the person can equip. */
  protected readonly library = computed(() => {
    const shown = new Set(this.equipped().map(({ id }) => id));
    return PIECES.filter((piece) => piece.phase === this.current() && !shown.has(piece.id));
  });

  /** The settings of the pieces whose key is in the file with the edits: «Restablecer» takes it out. */
  protected readonly resettable = computed((): ReadonlySet<string> => {
    if (!this.editable()) return new Set();
    const edited = applyEdits(this.record().input, this.edits());
    const fields = this.fields();
    return new Set(
      PIECES.flatMap((piece) => piece.keys).filter(
        (key) => (fields.get(key)?.length ?? 0) > 0 && valueAt(edited, key) !== undefined,
      ),
    );
  });

  /** A piece's settings, in its order; none for delegated mode, which has its own control. */
  protected rowsOf(piece: Piece): readonly SettingRow[] {
    if (piece.clone === true) return [];
    const rows = this.rows();
    return piece.keys.flatMap((key) => rows.filter((row) => row.setting.key === key));
  }

  /**
   * Equips or removes a piece with its edits. One of a command, equipped, waits among the equipped
   * ones for the person to write its command.
   */
  protected toggle(piece: Piece, equip: boolean): void {
    const defaults = this.record().defaults;
    this.opened.update((opened) => {
      const next = new Set(opened);
      if (equip && piece.command !== undefined) next.add(piece.id);
      else next.delete(piece.id);
      return next;
    });
    for (const edit of pieceEdits(piece, equip, (key) => valueAt(defaults, key))) {
      this.edit.emit({ edit });
    }
  }
}

function slotOf(piece: Piece, lang: Lang): Slot {
  const { name, why } = pieceText(piece.id, lang);
  return {
    id: piece.id,
    name,
    ...(why === undefined ? {} : { why }),
    guarantee: piece.guarantee === true,
    soon: piece.soon === true,
  };
}
