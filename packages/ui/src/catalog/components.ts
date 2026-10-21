// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { PHASES } from "@baquia-dev/specty-core";
import { LucideCheck, LucideSettings } from "@lucide/angular";
import { Badge, PhaseBadge } from "../components/badge";
import { Button, IconButton } from "../components/button";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Kbd } from "../components/kbd";
import { Skeleton } from "../components/skeleton";
import { Tooltip } from "../components/tooltip";
import { Preferences } from "../theme/preferences";

/** Every base component with its variants and states, in the current theme and language. */
@Component({
  selector: "sp-components",
  imports: [Badge, PhaseBadge, Button, IconButton, Card, Field, Kbd, Skeleton, Tooltip],
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
}
