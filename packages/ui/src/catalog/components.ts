// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { PHASES } from "@baquia-dev/specty-core/light";
import { Badge, PhaseBadge } from "../components/badge";
import { Button, IconButton } from "../components/button";
import { Card } from "../components/card";
import { DiffViewer } from "../components/diff-viewer";
import { Field } from "../components/field";
import { LucideCheck, LucideSettings } from "../components/icons";
import { Kbd } from "../components/kbd";
import { Segmented } from "../components/segmented";
import { Select } from "../components/select";
import { Skeleton } from "../components/skeleton";
import { Tooltip } from "../components/tooltip";
import { parseDiff } from "../data/diff";
import { sampleDiff } from "../data/sample-diffs";
import { Preferences } from "../theme/preferences";

/** The commits around each task of the sample change «Panel de asistencia por curso». */
const SAMPLE_RANGES: Readonly<Record<string, string>> = {
  all: "5d2a7b0 → 8b0a4f6",
  T1: "5d2a7b0 → 3c9d1e2",
  T2: "3c9d1e2 → 8b0a4f6",
};

/** Every base component with its variants and states, in the current theme and language. */
@Component({
  selector: "sp-components",
  imports: [
    Badge,
    PhaseBadge,
    Button,
    IconButton,
    Card,
    DiffViewer,
    Field,
    Kbd,
    Select,
    Segmented,
    Skeleton,
    Tooltip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mt-0 mb-2 text-xl font-semibold">{{ t()('Componentes', 'Components') }}</h1>
    <p class="mt-0 mb-8 max-w-[64ch] text-text-muted">
      {{
        t()(
          'Componentes base sobre elementos nativos. Ninguna acción se deshabilita sin decir por qué.',
          'Base components on native elements. No action is disabled without saying why.'
        )
      }}
    </p>

    <section class="mb-10" aria-labelledby="buttons">
      <h2 id="buttons" class="mb-4 text-lg font-semibold">{{ t()('Botones', 'Buttons') }}</h2>
      <div class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <sp-button variant="primary" (pressed)="presses.set(presses() + 1)">
          {{ t()('Aprobar', 'Approve') }}
        </sp-button>
        <sp-button>{{ t()('Pedir cambios', 'Request changes') }}</sp-button>
        <sp-button variant="ghost">{{ t()('Ver spec completa', 'See full spec') }}</sp-button>
        <sp-button size="sm">{{ t()('Pequeño', 'Small') }}</sp-button>
        <sp-button
          id="disabled-example"
          variant="primary"
          [disabledReason]="t()('Faltan 2 supuestos de alto impacto por decidir.', '2 high-impact assumptions are still undecided.')"
        >
          {{ t()('Aprobar', 'Approve') }}
        </sp-button>
        <sp-icon-button [label]="t()('Ajustes', 'Settings')" [icon]="settings" />
        <sp-icon-button variant="secondary" size="sm" [label]="t()('Confirmar', 'Confirm')" [icon]="check" />
        <span class="text-sm text-text-muted" aria-live="polite">
          {{ t()('Pulsaciones', 'Presses') }}: {{ presses() }}
        </span>
      </div>
    </section>

    <section class="mb-10" aria-labelledby="badges">
      <h2 id="badges" class="mb-4 text-lg font-semibold">{{ t()('Insignias y atajos', 'Badges and shortcuts') }}</h2>
      <div class="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
        @for (phase of phases; track phase) {
          <sp-phase-badge [phase]="phase" />
        }
        <sp-badge>M</sp-badge>
        <sp-badge>r2</sp-badge>
        <sp-kbd keys="mod+k" />
        <sp-kbd keys="j" />
        <sp-kbd keys="shift+enter" />
      </div>
    </section>

    <section class="mb-10" aria-labelledby="cards">
      <h2 id="cards" class="mb-4 text-lg font-semibold">{{ t()('Tarjetas y tooltip', 'Cards and tooltip') }}</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        <sp-card [selected]="true">
          <sp-phase-badge phase="review" />
          <strong>{{ t()('Agrupar la evolución por trimestre', 'Group progress by term') }}</strong>
          <span class="text-sm text-text-muted">{{ t()('Seleccionada con j/k', 'Selected with j/k') }}</span>
        </sp-card>
        <sp-card>
          <sp-phase-badge phase="implementing" />
          <strong>{{ t()('Exportar boletines en PDF', 'Export report cards as PDF') }}</strong>
          <sp-tooltip [text]="t()('Abre el cambio en otra pestaña', 'Opens the change in another tab')">
            <a href="#cards">{{ t()('Ver cambio', 'See change') }}</a>
          </sp-tooltip>
        </sp-card>
      </div>
    </section>

    <section class="mb-10" aria-labelledby="fields">
      <h2 id="fields" class="mb-4 text-lg font-semibold">{{ t()('Campos', 'Fields') }}</h2>
      <div class="grid max-w-xl gap-4 rounded-xl border border-border bg-surface p-4">
        <sp-field
          [label]="t()('Título del cambio', 'Change title')"
          [hint]="t()('Una frase: qué cambia para quien lo usa.', 'One sentence: what changes for the user.')"
          [(value)]="title"
        />
        <sp-field
          [label]="t()('Motivo del rechazo', 'Reason for rejecting')"
          [error]="t()('Escribe el motivo: el agente lo leerá.', 'Write the reason: the agent will read it.')"
        />
        <sp-field [label]="t()('Comentario', 'Comment')" [multiline]="true" [placeholder]="t()('Escribe…', 'Write…')" />
      </div>
    </section>

    <section class="mb-10" aria-labelledby="select">
      <h2 id="select" class="mb-4 text-lg font-semibold">Select</h2>
      <div class="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4">
        <p class="m-0 max-w-[64ch] text-sm text-text-muted">
          {{
            t()(
              'Un desplegable propio con el estilo de la UI, no el del sistema. Se abre con clic, Enter, Espacio o Alt+↓; las flechas, Inicio/Fin o escribir mueven; Enter o clic eligen, y Escape cierra sin cambiar.',
              'A dropdown of its own in the style of the UI, not the system one. Click, Enter, Space or Alt+↓ open it; arrows, Home/End or typing move; Enter or a click choose, and Escape closes without changing.'
            )
          }}
        </p>
        <sp-select [label]="t()('Ordenar', 'Sort')" [options]="sorts()" [(value)]="sort" />
        <span class="text-sm text-text-muted" aria-live="polite" data-chosen>{{ t()('Elegido', 'Chosen') }}: {{ chosen() }}</span>
      </div>
    </section>

    <section class="mb-10" aria-labelledby="segmented">
      <h2 id="segmented" class="mb-4 text-lg font-semibold">{{ t()('Selector segmentado', 'Segmented control') }}</h2>
      <div class="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4">
        <p class="m-0 max-w-[64ch] text-sm text-text-muted">
          {{
            t()(
              'Para elegir una entre pocas opciones cortas, todas a la vista; con muchas o largas, mejor el select. Son radios: Tab entra en la opción elegida y las flechas mueven y eligen. Si no caben, pasan a la línea siguiente.',
              'To choose one of a few short options, all in sight; with many or long ones, the select fits better. They are radios: Tab goes into the chosen option and the arrows move and choose. When they do not fit, they wrap to the next line.'
            )
          }}
        </p>
        <sp-segmented [label]="t()('Vista del diff', 'Diff view')" [options]="modes()" [(value)]="mode" />
        <sp-segmented [label]="t()('Qué cambios', 'Which changes')" [options]="scopes()" [(value)]="scope" />
        <span class="text-sm text-text-muted" aria-live="polite" data-segmented-chosen>{{ t()('Elegido', 'Chosen') }}: {{ segmentedChosen() }}</span>
      </div>
    </section>

    <section class="mb-10" aria-labelledby="diff-viewer">
      <h2 id="diff-viewer" class="mb-4 text-lg font-semibold">{{ t()('Visor de diffs', 'Diff viewer') }}</h2>
      <p class="mt-0 mb-4 max-w-[64ch] text-sm text-text-muted">
        {{
          t()(
            'Un diff de git por archivos, unificado o lado a lado (en el teléfono, solo unificado), con las palabras que cambiaron marcadas. Cada archivo se pliega y los largos muestran sus primeras líneas. Quien lo usa pone su barra: aquí, qué cambios ver.',
            'A git diff by files, unified or side by side (only unified on a phone), with the words that changed marked. Each file folds, and long ones show their first lines. Whoever uses it brings its bar: here, which changes to see.'
          )
        }}
      </p>
      <sp-diff-viewer [files]="diffFiles()" [range]="diffRange()">
        <sp-segmented [label]="t()('Qué cambios ver', 'Which changes to see')" [hideLabel]="true" [options]="diffScopes()" [(value)]="diffScope" data-diff-scope />
      </sp-diff-viewer>
    </section>

    <section aria-labelledby="loading">
      <h2 id="loading" class="mb-4 text-lg font-semibold">{{ t()('Carga', 'Loading') }}</h2>
      <div class="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <sp-skeleton width="240px" height="20px" />
        <sp-skeleton [lines]="3" height="12px" [announce]="false" />
      </div>
    </section>
  `,
})
export class Components {
  protected readonly t = inject(Preferences).t;
  protected readonly phases = PHASES;
  protected readonly settings = LucideSettings;
  protected readonly check = LucideCheck;
  protected readonly presses = signal(0);
  protected readonly title = signal("");
  protected readonly sort = signal("waiting");
  protected readonly sorts = computed(() => {
    const t = this.t();
    return [
      { value: "waiting", label: t("Lo que más espera primero", "Longest waiting first") },
      { value: "recent", label: t("Lo más reciente primero", "Most recent first") },
      { value: "title", label: t("Título, de la A a la Z", "Title, A to Z") },
      { value: "size", label: t("Tamaño, de mayor a menor", "Size, largest first") },
    ];
  });
  protected readonly chosen = computed(
    () => this.sorts().find((option) => option.value === this.sort())?.label ?? "",
  );
  protected readonly mode = signal("unified");
  protected readonly modes = computed(() => {
    const t = this.t();
    return [
      { value: "unified", label: t("Unificado", "Unified") },
      { value: "split", label: t("Lado a lado", "Side by side") },
    ];
  });
  protected readonly scope = signal("all");
  protected readonly scopes = computed(() => [
    { value: "all", label: this.t()("Todo el cambio", "The whole change") },
    { value: "T1", label: "T1 · Agregados semanales" },
    { value: "T2", label: "T2 · Panel con estudiantes destacados" },
  ]);
  protected readonly diffScope = signal("all");
  protected readonly diffScopes = computed(() => [
    { value: "all", label: this.t()("Todo el cambio", "The whole change") },
    { value: "T1", label: "T1" },
    { value: "T2", label: "T2" },
  ]);
  protected readonly diffFiles = computed(() => {
    const scope = this.diffScope();
    return parseDiff(sampleDiff("20261018-asistencia-curso", scope === "all" ? undefined : scope));
  });
  protected readonly diffRange = computed(() => SAMPLE_RANGES[this.diffScope()]);
  /** «Unificado · Todo el cambio». */
  protected readonly segmentedChosen = computed(() =>
    [
      this.modes().find((option) => option.value === this.mode())?.label,
      this.scopes().find((option) => option.value === this.scope())?.label,
    ].join(" · "),
  );
}
