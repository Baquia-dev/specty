// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import { optionName } from "@baquia-dev/specty-core/light";
import { LucideDynamicIcon } from "@lucide/angular";
import { Button } from "../components/button";
import { LucideLock } from "../components/icons";
import { Segmented, type SegmentedOption } from "../components/segmented";
import type { Bilingual } from "../data/records";
import { Preferences } from "../theme/preferences";
import { type Draft, draftOf, type SettingField } from "./settings-edit";
import type { SettingRow, ValueWords } from "./settings-view";

/** A field as its control shows it: its keys with dots and its text. */
export interface FieldView extends SettingField {
  readonly key: string;
  readonly text: string;
}

/** A mark of a row: not saved yet, its value changed, or what the catalog says of the setting. */
type Mark =
  | "pending"
  | "modified"
  | "permissions"
  | "command"
  | "clone"
  | "soon"
  | "new"
  | "guarantee";

/** Each mark's words and the phase whose tone it takes (none: plain), in the order rows show them. */
const MARKS: readonly { readonly mark: Mark; readonly label: Bilingual; readonly tone?: string }[] =
  [
    { mark: "pending", label: { es: "Sin guardar", en: "Unsaved" } },
    { mark: "modified", label: { es: "Modificado", en: "Modified" }, tone: "implementing" },
    {
      mark: "permissions",
      label: { es: "Afecta permisos", en: "Affects permissions" },
      tone: "review",
    },
    {
      mark: "command",
      label: { es: "Ejecuta un comando", en: "Runs a command" },
      tone: "acceptance",
    },
    { mark: "clone", label: { es: "Este clon", en: "This clone" }, tone: "done" },
    { mark: "soon", label: { es: "Próximamente", en: "Coming soon" }, tone: "draft" },
    { mark: "new", label: { es: "Nuevo", en: "New" }, tone: "testing" },
    { mark: "guarantee", label: { es: "Garantía", en: "Guarantee" }, tone: "closing" },
  ];

/**
 * A setting's row: its name and marks, what it does, its key and, when it changed, its default
 * on the left; its value or its controls on the right; the validator's issues below. No line between
 * rows: the one under the pointer lights up softly.
 */
const ROW =
  "-mx-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-text/4 motion-reduce:transition-none sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]";

const PILL = "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium";

/** A text control: 36 px like the other fields, mono for keys, paths and commands. */
const CONTROL =
  "min-w-0 rounded-lg border border-border bg-surface px-2.5 font-mono text-[13px] text-text placeholder:text-text-muted aria-invalid:border-phase-cancelled";

/**
 * One setting of the page «Configuración»: what it is, and its value, or a control per field when
 * the person can change it, with «Restablecer» when its key is in the file.
 */
@Component({
  selector: "sp-setting-row",
  imports: [LucideDynamicIcon, Segmented, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: "listitem", "[class]": "row", "[attr.data-setting]": "view().setting.key" },
  template: `
    <div class="flex min-w-0 flex-col gap-1">
      <span class="flex flex-wrap items-center gap-1.5">
        <span class="text-sm font-semibold" data-name>{{ view().name }}</span>
        @for (mark of marks(); track mark.mark) {
          <span [class]="pill + (mark.tone ? '' : ' bg-text/8 text-text')" [style.color]="mark.tone ? 'var(--color-phase-' + mark.tone + ')' : null" [style.background]="mark.tone ? 'var(--color-phase-' + mark.tone + '-bg)' : null" [attr.data-mark]="mark.mark">{{ t()(mark.label.es, mark.label.en) }}</span>
        }
      </span>
      <span class="text-sm text-text-muted" data-description>{{ view().description }}</span>
      @if (view().setting.guarantee !== true) {
        <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          <code class="font-mono" data-key>{{ view().setting.key }}</code>
          @if (view().default; as fallback) {
            <span data-default>{{ t()('Por defecto', 'Default') }}: {{ inLine(fallback) }}</span>
          }
          @if (resettable()) {
            <sp-button data-reset size="sm" variant="ghost" (pressed)="reset.emit()">{{ t()('Restablecer', 'Reset') }}</sp-button>
          }
        </span>
      }
      @for (issue of view().issues; track $index) {
        <span class="font-mono text-xs break-words" [style.color]="'var(--color-phase-cancelled)'" data-issue>{{ issue }}</span>
      }
    </div>
    <div class="flex min-w-0 flex-col items-stretch gap-2 sm:items-end" data-value>
      @if (view().setting.guarantee === true) {
        <span class="flex items-center gap-1.5">
          <svg class="text-text-muted" [lucideIcon]="lockIcon" size="14" role="img" [attr.aria-label]="t()('Fijo', 'Fixed')" data-lock></svg>
          <span class="text-sm" data-item>{{ view().setting.fixed }} {{ view().setting.unit }}</span>
        </span>
      } @else if (fields().length > 0) {
        @for (field of fields(); track field.key) {
          <div class="flex w-full min-w-0 items-center gap-2 sm:justify-end" [attr.data-field]="field.key">
            @if (field.label) {
              <code class="font-mono text-xs text-text-muted">{{ field.label }}</code>
            }
            @switch (field.kind) {
              @case ('choice') {
                <sp-segmented [label]="nameOf(field)" [hideLabel]="true" [options]="choices(field)" [value]="field.text" (valueChange)="write(field, $event)" />
              }
              @case ('toggle') {
                <sp-segmented [label]="nameOf(field)" [hideLabel]="true" [options]="yesNo()" [value]="field.text" (valueChange)="write(field, $event)" />
              }
              @case ('number') {
                <input type="text" inputmode="decimal" [class]="control + ' h-9 w-24 text-right tabular-nums'" [value]="field.text" [attr.aria-label]="nameOf(field)" [attr.aria-invalid]="invalid() || null" (input)="typed(field, $event)" />
                @if (field.unit) {
                  <span class="text-xs text-text-muted" data-unit>{{ field.unit }}</span>
                }
              }
              @case ('text') {
                <input type="text" [class]="control + ' h-9 w-full'" [value]="field.text" [placeholder]="t()('Sin valor', 'Not set')" [attr.aria-label]="nameOf(field)" [attr.aria-invalid]="invalid() || null" (input)="typed(field, $event)" />
              }
              @default {
                <textarea rows="3" [class]="control + ' w-full py-2'" [value]="field.text" [placeholder]="field.kind === 'entries' ? t()('nombre: valor, uno por línea', 'name: value, one a line') : t()('Uno por línea', 'One a line')" [attr.aria-label]="nameOf(field)" [attr.aria-invalid]="invalid() || null" (input)="typed(field, $event)"></textarea>
              }
            }
          </div>
        }
      } @else {
        <div class="flex min-w-0 flex-wrap content-start items-center gap-1.5 sm:justify-end">
          @for (item of view().value.items; track $index) {
            <span [class]="itemClass()" data-item>{{ item }}</span>
          }
          @if (view().value.more > 0) {
            <span class="text-xs text-text-muted" data-more>{{ more(view().value.more) }}</span>
          }
        </div>
      }
    </div>
  `,
})
export class SettingRowView {
  readonly view = input.required<SettingRow>();
  /** A control per field; none when the person cannot change the setting here. */
  readonly fields = input<readonly FieldView[]>([]);
  /** Its edits change it and are not saved yet. */
  readonly pending = input(false);
  /** Its key is in the file, so «Restablecer» can remove it. */
  readonly resettable = input(false);
  /** What the person wrote in a field. */
  readonly edit = output<Draft>();
  readonly reset = output();

  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly row = ROW;
  protected readonly pill = PILL;
  protected readonly control = CONTROL;
  protected readonly lockIcon = LucideLock;

  /** The row's marks, in their order: not saved, changed, then the catalog's. */
  protected readonly marks = computed(() => {
    const view = this.view();
    return MARKS.filter(({ mark }) => {
      if (mark === "pending") return this.pending();
      if (mark === "modified") return view.default !== undefined;
      return view.setting[mark] === true;
    });
  });

  protected readonly invalid = computed(() => this.view().issues.length > 0);

  protected readonly yesNo = computed((): readonly SegmentedOption[] => [
    { value: "true", label: this.t()("Sí", "Yes") },
    { value: "false", label: this.t()("No", "No") },
  ]);

  protected choices(field: FieldView): readonly SegmentedOption[] {
    const lang = this.preferences.lang();
    return (field.options ?? []).map((value) => ({
      value,
      label: optionName(this.view().setting.key, value, lang),
    }));
  }

  /** A control's name: the setting's, and the key inside a group. */
  protected nameOf(field: FieldView): string {
    return field.label === undefined ? this.view().name : `${this.view().name} · ${field.label}`;
  }

  protected typed(field: FieldView, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.write(field, target.value);
    }
  }

  protected write(field: FieldView, text: string): void {
    this.edit.emit(draftOf(field, text));
  }

  /** A value's elements in mono for keys, paths and commands; options, numbers and yes or no in sans. */
  protected itemClass(): string {
    const plain = ["choice", "toggle", "number"].includes(this.view().setting.kind);
    return plain
      ? "text-sm"
      : "rounded-md bg-text/6 px-1.5 py-0.5 font-mono text-xs break-all text-text";
  }

  /** A default on one line: its elements, and how many more. */
  protected inLine(words: ValueWords): string {
    const items = words.items.join(", ");
    return words.more === 0 ? items : `${items} ${this.more(words.more)}`;
  }

  protected more(count: number): string {
    return this.t()(`y ${count} más`, `and ${count} more`);
  }
}
