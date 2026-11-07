// SPDX-License-Identifier: Apache-2.0
import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  resource,
  signal,
} from "@angular/core";
import { LucideDynamicIcon } from "@lucide/angular";
import { Collapsible } from "../components/collapsible";
import { LIST, PAGE, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { LucideLock, LucideSearch } from "../components/icons";
import { Segmented } from "../components/segmented";
import { Skeleton } from "../components/skeleton";
import { ActionError, type Bilingual, SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import {
  looseIssues,
  passes,
  SETTING_FILTERS,
  type SettingFilter,
  type SettingRow,
  type SettingsSection,
  settingRows,
  settingSections,
  type ValueWords,
} from "./settings-view";

/** A mark of a row: its value changed, or what the catalog says of the setting. */
type Mark = "modified" | "permissions" | "command" | "clone" | "soon" | "new" | "guarantee";

/** Each mark's words and the phase whose tone it takes, in the order the rows show them. */
const MARKS: readonly { readonly mark: Mark; readonly label: Bilingual; readonly tone: string }[] =
  [
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

const FILTER_LABELS: Readonly<Record<SettingFilter, Bilingual>> = {
  all: { es: "Todos", en: "All" },
  modified: { es: "Modificados", en: "Modified" },
  permissions: { es: "Afectan permisos", en: "Affect permissions" },
  command: { es: "Ejecutan comandos", en: "Run commands" },
  new: { es: "Nuevos", en: "New" },
};

/**
 * A setting's row: its name and marks, what it does, its key and, when it changed, its default
 * on the left; its value on the right; the validator's issues below. No line between rows: the
 * one under the pointer lights up softly.
 */
const ROW =
  "-mx-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-text/4 motion-reduce:transition-none sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]";

const PILL = "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium";

/**
 * The page «Configuración» of `specty ui`: every setting of `.specty/config.yaml` and delegated
 * mode by section, with its value and, when it changed, its default, its marks, a search and a
 * filter; read only for now, and read again with every event the data source hears. «Interno», the
 * last, shows its warning and folds its settings, Specty's guarantees with a lock and no key;
 * it opens by itself while a search or a filter is on.
 */
@Component({
  selector: "sp-settings-page",
  imports: [
    LucideDynamicIcon,
    NgTemplateOutlet,
    SectionDivider,
    EmptyState,
    Skeleton,
    Segmented,
    Collapsible,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page + ' flex flex-col gap-8 pt-10 pb-16'">
      <header class="flex flex-col gap-1.5">
        <h1 class="m-0 text-[2rem] leading-tight font-semibold tracking-tight">{{ t()('Configuración', 'Settings') }}</h1>
        @if (summary(); as line) {
          <p class="m-0 text-sm text-text-muted" data-summary>{{ line }}</p>
        }
        <p class="m-0 text-xs text-text-muted" data-read-only>
          {{ t()('Solo lectura: por ahora, los ajustes se cambian en', 'Read-only: for now, settings change in') }}
          <code class="font-mono">.specty/config.yaml</code>.
        </p>
      </header>
      @if (read.error(); as error) {
        <div role="alert" class="rounded-xl border border-border bg-surface p-4 text-sm">
          {{ t()('No se pudo leer la configuración', 'Could not read the settings') }}: {{ message(error) }}
        </div>
      } @else if (!read.hasValue()) {
        <sp-skeleton height="4.5rem" />
      } @else if (rows().length === 0) {
        <sp-empty-state [heading]="t()('Esta fuente no da la configuración.', 'This source does not give the settings.')">
          {{ t()('La da el servidor de specty ui.', 'The specty ui server gives them.') }}
        </sp-empty-state>
      } @else {
        @if (invalid()) {
          <div role="alert" class="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm" data-invalid>
            <p class="m-0">
              <code class="font-mono">.specty/config.yaml</code>
              {{ t()('no es válido: Specty no lo usa hasta que se corrija. Cada error sale junto a su ajuste.', 'is not valid: Specty does not use it until it is fixed. Each error shows by its setting.') }}
            </p>
            @if (loose().length > 0) {
              <ul class="m-0 flex list-none flex-col gap-1 p-0">
                @for (issue of loose(); track $index) {
                  <li class="font-mono text-xs break-words" [style.color]="'var(--color-phase-cancelled)'" data-loose-issue>{{ issue }}</li>
                }
              </ul>
            }
          </div>
        }
        <div class="flex flex-wrap items-center gap-3" data-toolbar>
          <label class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-text-muted focus-within:border-focus sm:max-w-md">
            <svg [lucideIcon]="searchIcon" size="15" aria-hidden="true"></svg>
            <span class="sr-only">{{ t()('Buscar un ajuste', 'Search a setting') }}</span>
            <input type="search" class="min-w-0 flex-1 border-0 bg-transparent font-sans text-sm text-text outline-none placeholder:text-text-muted" [placeholder]="t()('Buscar un ajuste o su clave, como verify.timeoutSec', 'Search a setting or its key, such as verify.timeoutSec')" [value]="query()" (input)="type($event)" (keydown.escape)="query.set('')" />
          </label>
          <sp-segmented [label]="t()('Filtro', 'Filter')" [hideLabel]="true" [options]="filterOptions()" [(value)]="filter" />
        </div>
        @if (sections().length === 0) {
          <p class="m-0 text-sm text-text-muted" role="status" data-no-match>{{ t()('Nada coincide con el filtro.', 'Nothing matches the filter.') }}</p>
        }
        @for (section of sections(); track section.key) {
          <section [attr.aria-labelledby]="'settings-' + section.key" [attr.data-section]="section.key">
            <sp-section-divider [heading]="section.name" [headingId]="'settings-' + section.key" [meta]="section.rows.length" [level]="2" />
            @if (section.key === 'internal') {
              <p class="m-0 mt-2 text-sm text-text-muted" data-internal-warning>
                {{ t()('Estos ajustes pueden dejar Specty sin funcionar. Si algo falla tras cambiar uno, quita su clave y vuelve a su valor.', 'These settings can make Specty stop working. If something fails after changing one, remove its key and it goes back to its value.') }}
              </p>
              <sp-collapsible class="mt-2" [label]="t()('Ajustes internos', 'Internal settings')" [open]="internalOpen()" (openChange)="unfolded.set($event)">
                <ng-container *ngTemplateOutlet="rowsOf; context: { $implicit: section.rows }" />
              </sp-collapsible>
            } @else {
              <ng-container *ngTemplateOutlet="rowsOf; context: { $implicit: section.rows }" />
            }
          </section>
        }
      }
    </div>
    <ng-template #rowsOf let-rows>
      <div role="list" [class]="list + ' mt-2'">
        @for (row of asRows(rows); track row.setting.key) {
          <div role="listitem" [class]="row_" [attr.data-setting]="row.setting.key">
            <div class="flex min-w-0 flex-col gap-1">
              <span class="flex flex-wrap items-center gap-1.5">
                <span class="text-sm font-semibold" data-name>{{ row.name }}</span>
                @for (mark of marksOf(row); track mark.mark) {
                  <span [class]="pill" [style.color]="'var(--color-phase-' + mark.tone + ')'" [style.background]="'var(--color-phase-' + mark.tone + '-bg)'" [attr.data-mark]="mark.mark">{{ t()(mark.label.es, mark.label.en) }}</span>
                }
              </span>
              <span class="text-sm text-text-muted" data-description>{{ row.description }}</span>
              @if (row.setting.guarantee !== true) {
                <span class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-text-muted">
                  <code class="font-mono" data-key>{{ row.setting.key }}</code>
                  @if (row.default; as fallback) {
                    <span data-default>{{ t()('Por defecto', 'Default') }}: {{ inLine(fallback) }}</span>
                  }
                </span>
              }
              @for (issue of row.issues; track $index) {
                <span class="font-mono text-xs break-words" [style.color]="'var(--color-phase-cancelled)'" data-issue>{{ issue }}</span>
              }
            </div>
            <div class="flex min-w-0 flex-wrap content-start items-center gap-1.5 sm:justify-end" data-value>
              @if (row.setting.guarantee === true) {
                <svg class="text-text-muted" [lucideIcon]="lockIcon" size="14" role="img" [attr.aria-label]="t()('Fijo', 'Fixed')" data-lock></svg>
                <span class="text-sm" data-item>{{ row.setting.fixed }} {{ row.setting.unit }}</span>
              } @else {
                @for (item of row.value.items; track $index) {
                  <span [class]="itemClass(row)" data-item>{{ item }}</span>
                }
                @if (row.value.more > 0) {
                  <span class="text-xs text-text-muted" data-more>{{ more(row.value.more) }}</span>
                }
              }
            </div>
          </div>
        }
      </div>
    </ng-template>
  `,
})
export class SettingsPage {
  private readonly data = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly read = resource({ loader: () => this.data.config() });
  private readonly delegation = resource({ loader: () => this.data.delegation() });
  protected readonly page = PAGE;
  protected readonly list = LIST;
  protected readonly row_ = ROW;
  protected readonly pill = PILL;
  protected readonly searchIcon = LucideSearch;
  protected readonly lockIcon = LucideLock;
  protected readonly query = signal("");
  protected readonly filter = signal<string>("all");
  /** Whether the person unfolded «Interno». */
  protected readonly unfolded = signal(false);

  private readonly record = computed(() => (this.read.hasValue() ? this.read.value() : undefined));

  /** Each setting with its value, or none when the source does not give the configuration. */
  protected readonly rows = computed(() => {
    const record = this.record();
    if (record === undefined) return [];
    const delegated = this.delegation.hasValue() ? this.delegation.value()?.on : undefined;
    return settingRows(record, delegated, this.preferences.lang());
  });

  protected readonly invalid = computed(() => {
    const record = this.record();
    return record !== undefined && record.config === undefined;
  });

  protected readonly loose = computed(() => {
    const record = this.record();
    return record === undefined ? [] : looseIssues(record);
  });

  private readonly chosen = computed(
    (): SettingFilter => SETTING_FILTERS.find((value) => value === this.filter()) ?? "all",
  );

  protected readonly sections = computed((): readonly SettingsSection[] =>
    settingSections(this.rows(), this.chosen(), this.query(), this.preferences.lang()),
  );

  /** «Interno» unfolded by the person, or by itself while a search or a filter is on. */
  protected readonly internalOpen = computed(
    () => this.unfolded() || this.query() !== "" || this.chosen() !== "all",
  );

  /** Each filter with how many settings it has. */
  protected readonly filterOptions = computed(() =>
    SETTING_FILTERS.map((value) => {
      const label = FILTER_LABELS[value];
      const count = this.rows().filter((row) => passes(row, value)).length;
      return { value, label: `${this.t()(label.es, label.en)} · ${count}` };
    }),
  );

  protected readonly summary = computed(() => {
    const rows = this.rows();
    if (rows.length === 0) return undefined;
    const modified = rows.filter((row) => passes(row, "modified")).length;
    return this.t()(
      `.specty/config.yaml · ${rows.length} ajustes · ${modified} modificados`,
      `.specty/config.yaml · ${rows.length} settings · ${modified} modified`,
    );
  });

  constructor() {
    const stop = this.data.subscribe(() => {
      this.read.reload();
      this.delegation.reload();
    });
    inject(DestroyRef).onDestroy(stop);
  }

  /** The rows a section's template receives, typed again. */
  protected asRows(rows: readonly SettingRow[]): readonly SettingRow[] {
    return rows;
  }

  protected type(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.query.set(event.target.value);
  }

  /** The row's marks, in their order: whether it changed, then the catalog's. */
  protected marksOf(row: SettingRow) {
    return MARKS.filter(({ mark }) =>
      mark === "modified" ? row.default !== undefined : row.setting[mark] === true,
    );
  }

  /** A value's elements in mono for keys, paths and commands; options, numbers and yes or no in sans. */
  protected itemClass(row: SettingRow): string {
    const plain = ["choice", "toggle", "number"].includes(row.setting.kind);
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

  protected message(error: unknown): string {
    return error instanceof ActionError
      ? this.t()(error.text.es, error.text.en)
      : this.t()("error inesperado", "unexpected error");
  }
}
