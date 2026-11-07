// SPDX-License-Identifier: Apache-2.0
import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  effect,
  inject,
  resource,
  signal,
  viewChild,
} from "@angular/core";
import { SETTINGS, type Setting, settingChanges } from "@baquia-dev/specty-core/light";
import { LucideDynamicIcon } from "@lucide/angular";
import { Button } from "../components/button";
import { Collapsible } from "../components/collapsible";
import { Dialogs } from "../components/dialog";
import { LIST, PAGE, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { LucideSearch } from "../components/icons";
import { Segmented } from "../components/segmented";
import { Skeleton } from "../components/skeleton";
import { Toasts } from "../components/toast";
import { Decisions } from "../data/decisions";
import { ActionError, type Bilingual, SpectyData } from "../data/records";
import type { ConfigSaved } from "../data/source";
import { Preferences } from "../theme/preferences";
import { type SaveData, SaveDialog } from "./save-dialog";
import { type FieldView, SettingRowView } from "./setting-row";
import {
  applyEdits,
  type Draft,
  type Drafts,
  editsOf,
  fieldsOf,
  fieldText,
  resetDraft,
  withDraft,
} from "./settings-edit";
import {
  looseIssues,
  passes,
  SETTING_FILTERS,
  type SettingFilter,
  type SettingRow,
  type SettingsSection,
  settingRows,
  settingSections,
  valueAt,
} from "./settings-view";

const FILTER_LABELS: Readonly<Record<SettingFilter, Bilingual>> = {
  all: { es: "Todos", en: "All" },
  modified: { es: "Modificados", en: "Modified" },
  permissions: { es: "Afectan permisos", en: "Affect permissions" },
  command: { es: "Ejecutan comandos", en: "Run commands" },
  new: { es: "Nuevos", en: "New" },
};

/** The compact bar slides in once the header is out of view; hidden, it is inert. */
const BAR =
  "absolute inset-x-0 top-0 border-b border-border bg-bg/90 backdrop-blur transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none";
const BAR_SHOWN = `${BAR} translate-y-0 opacity-100`;
const BAR_HIDDEN = `${BAR} pointer-events-none -translate-y-full opacity-0`;

/**
 * The page «Configuración» of `specty ui`: every setting of `.specty/config.yaml` and delegated
 * mode by section, with its value and, when it changed, its default, its marks, a search and a
 * filter, read again with every event the data source hears. Where the person may decide, each
 * setting the UI saves has its controls and «Restablecer»; the edits are checked by the server as
 * they are written, and «Descartar» and «Revisar y guardar» wait in the header and in the compact
 * bar. Elsewhere it is read only and says why. «Interno», the last, shows its warning and folds its
 * settings; it opens by itself while a search or a filter is on.
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
    Button,
    SettingRowView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col">
      @if (editable()) {
        <!-- Zero height in the flow: the bar never pushes the content. -->
        <div class="sticky top-0 z-20 h-0">
          <div [class]="compact() ? barShown : barHidden" [attr.inert]="compact() ? null : ''" data-bar>
            <div [class]="page + ' flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 py-2'">
              <p class="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
                {{ t()('Configuración', 'Settings') }}
                @if (unsaved(); as line) {
                  <span class="text-xs font-normal text-text-muted"> · {{ line }}</span>
                }
              </p>
              <ng-container *ngTemplateOutlet="actionsOf; context: { $implicit: 'bar' }" />
            </div>
          </div>
        </div>
      }
      <div [class]="page + ' flex flex-col gap-8 pt-10 pb-16'">
        <header #hero class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex min-w-0 flex-col gap-1.5">
            <h1 class="m-0 text-[2rem] leading-tight font-semibold tracking-tight">{{ t()('Configuración', 'Settings') }}</h1>
            @if (summary(); as line) {
              <p class="m-0 text-sm text-text-muted" data-summary>{{ line }}</p>
            }
            @if (unsaved(); as line) {
              <p class="m-0 text-sm font-medium" data-unsaved>{{ line }}</p>
            }
            @if (readOnly(); as why) {
              <p class="m-0 text-xs text-text-muted" data-read-only>{{ t()('Solo lectura', 'Read-only') }}: {{ why }}</p>
            }
          </div>
          @if (editable()) {
            <ng-container *ngTemplateOutlet="actionsOf; context: { $implicit: 'header' }" />
          }
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
    </div>
    <ng-template #rowsOf let-rows>
      <div role="list" [class]="list + ' mt-2'">
        @for (row of asRows(rows); track row.setting.key) {
          <sp-setting-row [view]="row" [fields]="fieldsFor(row.setting.key)" [pending]="pending().has(row.setting.key)" [resettable]="resettable(row.setting)" (edit)="write($event)" (reset)="reset(row.setting)" />
        }
      </div>
    </ng-template>
    <ng-template #actionsOf let-where>
      <div class="flex shrink-0 flex-wrap items-center gap-2" [attr.data-actions]="where">
        <sp-button data-discard variant="ghost" [disabledReason]="drafts().size === 0 ? nothingToSave() : ''" (pressed)="discard()">{{ t()('Descartar', 'Discard') }}</sp-button>
        <sp-button data-review variant="primary" [disabledReason]="saveBlocked()" (pressed)="review()">
          {{ t()('Revisar y guardar', 'Review and save') }}
          <span class="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-on-accent/15 px-1.5 text-xs tabular-nums" data-count>{{ changes().length }}</span>
        </sp-button>
      </div>
    </ng-template>
  `,
})
export class SettingsPage {
  private readonly data = inject(SpectyData);
  private readonly preferences = inject(Preferences);
  private readonly decisions = inject(Decisions);
  private readonly dialogs = inject(Dialogs);
  private readonly toasts = inject(Toasts);
  protected readonly t = this.preferences.t;
  protected readonly read = resource({ loader: () => this.data.config() });
  private readonly delegation = resource({ loader: () => this.data.delegation() });
  protected readonly page = PAGE;
  protected readonly list = LIST;
  protected readonly searchIcon = LucideSearch;
  protected readonly barShown = BAR_SHOWN;
  protected readonly barHidden = BAR_HIDDEN;
  protected readonly query = signal("");
  protected readonly filter = signal<string>("all");
  /** Whether the person unfolded «Interno». */
  protected readonly unfolded = signal(false);
  /** The header is out of view: show the compact bar. */
  protected readonly compact = signal(false);
  /** The person's edits, not saved yet. */
  protected readonly drafts = signal<Drafts>(new Map());
  private readonly hero = viewChild<ElementRef<HTMLElement>>("hero");

  private readonly record = computed(() => (this.read.hasValue() ? this.read.value() : undefined));

  /** Why the person cannot change the settings here, in their language; empty when they can. */
  protected readonly readOnly = computed(() => {
    const record = this.record();
    if (record === undefined) return "";
    return this.decisions.blocked() || (record.blocked?.[this.preferences.lang()] ?? "");
  });

  protected readonly editable = computed(() => this.record() !== undefined && !this.readOnly());

  private readonly edits = computed(() => editsOf(this.drafts()));

  /** The changes of the edits by setting, as the server counts them. */
  protected readonly changes = computed(() => {
    const record = this.record();
    if (record === undefined || this.drafts().size === 0) return [];
    return settingChanges(record.input, applyEdits(record.input, this.edits()));
  });

  protected readonly pending = computed(() => new Set(this.changes().map(({ key }) => key)));

  /** The server's check of the edits: their issues and their changes, writing nothing. */
  protected readonly check = resource({
    params: () => {
      const edits = this.edits();
      return this.editable() && edits.length > 0 ? { edits } : undefined;
    },
    loader: ({ params }) => this.data.checkConfig(params.edits),
  });

  /** The issues to show: the check's while there are edits, the file's otherwise. */
  private readonly issues = computed(() => {
    const record = this.record();
    if (record === undefined) return [];
    if (this.drafts().size > 0 && this.check.hasValue()) return this.check.value().issues;
    return record.issues;
  });

  /** Each setting with its value, or none when the source does not give the configuration. */
  protected readonly rows = computed(() => {
    const record = this.record();
    if (record === undefined) return [];
    const delegated = this.delegation.hasValue() ? this.delegation.value()?.on : undefined;
    return settingRows({ ...record, issues: this.issues() }, delegated, this.preferences.lang());
  });

  /** Each setting's controls with their text; none where the person cannot change it. */
  private readonly fields = computed(() => {
    const record = this.record();
    const drafts = this.drafts();
    const editable = this.editable();
    return new Map(
      SETTINGS.map((setting): [string, readonly FieldView[]] => [
        setting.key,
        record === undefined || !editable
          ? []
          : fieldsOf(setting, record).map((field) => ({
              ...field,
              key: field.path.join("."),
              text: fieldText(field, record, drafts),
            })),
      ]),
    );
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

  /** «2 cambios sin guardar»; empty without changes. */
  protected readonly unsaved = computed(() => {
    const count = this.changes().length;
    if (count === 0) return "";
    return count === 1
      ? this.t()("1 cambio sin guardar", "1 unsaved change")
      : this.t()(`${count} cambios sin guardar`, `${count} unsaved changes`);
  });

  protected readonly nothingToSave = computed(() =>
    this.t()("No hay cambios sin guardar.", "There are no unsaved changes."),
  );

  /** Why «Revisar y guardar» cannot be pressed: nothing changes, the check is on its way or failed, or a value is not valid. */
  protected readonly saveBlocked = computed(() => {
    if (this.changes().length === 0) return this.nothingToSave();
    const error = this.check.error();
    if (error !== undefined) return this.message(error);
    if (!this.check.hasValue() || this.check.isLoading())
      return this.t()("Comprobando los valores…", "Checking the values…");
    return this.check.value().issues.length > 0
      ? this.t()(
          "Corrige los valores marcados antes de guardar.",
          "Fix the values marked before saving.",
        )
      : "";
  });

  constructor() {
    const stop = this.data.subscribe(() => {
      this.read.reload();
      this.delegation.reload();
    });
    let intersection: IntersectionObserver | undefined;
    // Without IntersectionObserver the bar stays hidden and the header still serves.
    effect(() => {
      const hero = this.hero()?.nativeElement;
      intersection?.disconnect();
      if (hero === undefined || typeof IntersectionObserver === "undefined") return;
      intersection = new IntersectionObserver(([entry]) => {
        if (entry !== undefined) this.compact.set(!entry.isIntersecting);
      });
      intersection.observe(hero);
    });
    inject(DestroyRef).onDestroy(() => {
      stop();
      intersection?.disconnect();
    });
  }

  /** The rows a section's template receives, typed again. */
  protected asRows(rows: readonly SettingRow[]): readonly SettingRow[] {
    return rows;
  }

  protected fieldsFor(key: string): readonly FieldView[] {
    return this.fields().get(key) ?? [];
  }

  /** «Restablecer» where the person can change the setting and its key is in the file, with the edits. */
  protected resettable(setting: Setting): boolean {
    const record = this.record();
    if (record === undefined || !this.editable() || this.fieldsFor(setting.key).length === 0)
      return false;
    return valueAt(applyEdits(record.input, this.edits()), setting.key) !== undefined;
  }

  protected write(draft: Draft): void {
    this.drafts.update((drafts) => withDraft(drafts, draft));
  }

  protected reset(setting: Setting): void {
    this.write(resetDraft(setting));
  }

  protected discard(): void {
    this.drafts.set(new Map());
  }

  /**
   * «Revisar y guardar»: the dialog with the changes of the server's check, which are the ones it
   * saves. Once saved, the edits go, the page reads the file again and a toast gives the commit.
   */
  protected review(): void {
    const record = this.record();
    if (record === undefined || !this.check.hasValue()) return;
    const data: SaveData = { changes: this.check.value().changes, edits: this.edits(), record };
    this.dialogs
      .open<ConfigSaved, SaveData, SaveDialog>(SaveDialog, data)
      .closed.subscribe((saved) => {
        if (saved === undefined) return;
        this.drafts.set(new Map());
        this.read.reload();
        const commit = saved.commit.slice(0, 7);
        this.toasts.show(
          this.t()(
            `Ajustes guardados en el commit ${commit}.`,
            `Settings saved in commit ${commit}.`,
          ),
          "success",
        );
      });
  }

  protected type(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.query.set(event.target.value);
  }

  protected message(error: unknown): string {
    return error instanceof ActionError
      ? this.t()(error.text.es, error.text.en)
      : this.t()("error inesperado", "unexpected error");
  }
}
