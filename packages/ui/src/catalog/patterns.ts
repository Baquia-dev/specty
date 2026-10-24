// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { Button, IconButton } from "../components/button";
import { LIST, PAGE, REVEAL, ROW, SectionDivider } from "../components/document";
import { EmptyState } from "../components/empty-state";
import { LucideMessageSquarePlus, LucideSearchX } from "../components/icons";
import { Preferences } from "../theme/preferences";

/** The patterns that make a screen read like a document, and the empty state. */
@Component({
  selector: "sp-patterns",
  imports: [Button, IconButton, SectionDivider, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mt-0 mb-2 text-xl font-semibold">{{ t()('Patrones', 'Patterns') }}</h1>
    <p class="mt-0 mb-8 max-w-[64ch] text-text-muted">
      {{
        t()(
          'Piezas para que una pantalla se lea como un documento bien maquetado: sin tarjetas, con secciones claras y sin líneas sobrantes.',
          'Pieces that make a screen read like a well-formatted document: no cards, clear sections and no needless lines.'
        )
      }}
    </p>

    <section class="mb-10" aria-labelledby="pattern-list">
      <h2 id="pattern-list" class="mb-1 text-lg font-semibold">{{ t()('Sección y lista de documento', 'Document section and list') }}</h2>
      <p class="mt-0 mb-4 max-w-[64ch] text-sm text-text-muted">
        {{
          t()(
            'El divisor abre la sección con su título y un contador; la lista va con sangría y sin líneas. Pasa el puntero o el foco por un ítem: se ilumina y muestra su acción.',
            'The divider opens the section with its title and a count; the list is indented, with no lines. Hover or focus an item: it lights up and shows its action.'
          )
        }}
      </p>
      <div class="rounded-xl border border-border bg-bg p-6" data-example="list">
        <sp-section-divider [heading]="t()('Criterios', 'Criteria')" [meta]="items().length" />
        <ol [class]="list + ' mt-3'">
          @for (item of items(); track item.id) {
            <li [class]="row" [attr.data-item]="item.id">
              <span class="pt-0.5 font-mono text-xs text-text-muted">{{ item.id }}</span>
              <p class="m-0">{{ item.text }}</p>
              <sp-icon-button [class]="reveal" size="sm" [label]="t()('Comentar ' + item.id, 'Comment on ' + item.id)" [icon]="commentIcon" />
            </li>
          }
        </ol>
      </div>
    </section>

    <section class="mb-10" aria-labelledby="pattern-empty">
      <h2 id="pattern-empty" class="mb-1 text-lg font-semibold">{{ t()('Estado vacío', 'Empty state') }}</h2>
      <p class="mt-0 mb-4 max-w-[64ch] text-sm text-text-muted">
        {{ t()('Cuando no hay nada que mostrar: qué pasó y cómo seguir.', 'When there is nothing to show: what happened and how to go on.') }}
      </p>
      <div class="rounded-xl border border-border bg-bg" data-example="empty">
        <sp-empty-state [heading]="t()('Ningún cambio coincide', 'No change matches')" [icon]="emptyIcon">
          <p class="m-0">{{ t()('Prueba con otro texto u otra fase.', 'Try another text or phase.') }}</p>
          <sp-button size="sm">{{ t()('Limpiar filtros', 'Clear filters') }}</sp-button>
        </sp-empty-state>
      </div>
    </section>

    <section aria-labelledby="pattern-page">
      <h2 id="pattern-page" class="mb-1 text-lg font-semibold">{{ t()('Ancho de página', 'Page width') }}</h2>
      <p class="mt-0 max-w-[64ch] text-sm text-text-muted">
        {{ t()('Todas las páginas comparten ancho y margen lateral:', 'Every page shares its width and side margin:') }}
        <code class="font-mono text-xs" data-example="page">{{ page }}</code>
      </p>
    </section>
  `,
})
export class Patterns {
  protected readonly t = inject(Preferences).t;
  protected readonly row = ROW;
  protected readonly list = LIST;
  protected readonly reveal = REVEAL;
  protected readonly page = PAGE;
  protected readonly commentIcon = LucideMessageSquarePlus;
  protected readonly emptyIcon = LucideSearchX;
  protected readonly items = computed(() => [
    {
      id: "AC1",
      text: this.t()(
        "CUANDO la familia envía un justificante ENTONCES la falta queda pendiente de revisión.",
        "WHEN the family sends a note THEN the absence awaits review.",
      ),
    },
    {
      id: "AC2",
      text: this.t()(
        "CUANDO el tutor lo acepta ENTONCES la falta queda justificada.",
        "WHEN the tutor accepts it THEN the absence is excused.",
      ),
    },
    {
      id: "AC3",
      text: this.t()(
        "CUANDO el tutor lo rechaza ENTONCES la familia ve el motivo.",
        "WHEN the tutor rejects it THEN the family sees the reason.",
      ),
    },
  ]);
}
