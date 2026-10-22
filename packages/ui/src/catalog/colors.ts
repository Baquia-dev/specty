// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { PHASES } from "@baquia-dev/specty-core";
import { PhaseBadge } from "../components/badge";
import { LIST, SectionDivider } from "../components/document";
import { Preferences } from "../theme/preferences";
import { tokensOf } from "../theme/tokens";

/** Current value of each token in the active theme; recomputed when the theme changes. */
export function useTokenValues() {
  const document = inject(DOCUMENT);
  const preferences = inject(Preferences);
  return computed(() => {
    preferences.resolvedTheme();
    const style = document.defaultView?.getComputedStyle(document.documentElement);
    return (name: string): string => style?.getPropertyValue(name).trim() ?? "";
  });
}

/** A token as a document row: swatch, name, use and value; stacked on a phone. */
const ROW =
  "grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[2rem_15rem_minmax(0,1fr)_auto]";

@Component({
  selector: "sp-colors",
  imports: [PhaseBadge, SectionDivider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mt-0 mb-2 text-xl font-semibold">{{ t()('Colores', 'Colors') }}</h1>
    <p class="mt-0 mb-8 max-w-[64ch] text-text-muted">
      {{
        t()(
          'Base neutra y un acento de tinta, sin tono: el único color de la pantalla es el de las fases y los riesgos.',
          'A neutral base and an ink accent with no hue: the only color on screen belongs to phases and risks.'
        )
      }}
    </p>

    <section aria-labelledby="colors-base">
      <sp-section-divider [heading]="t()('Base y acento', 'Base and accent')" headingId="colors-base" [meta]="base.length" [level]="2" />
      <ul [class]="list + ' mt-2 mb-10'">
        @for (token of base; track token.name) {
          <!-- On a phone the swatch heads a stack of name, use and value. -->
          <li [class]="row">
            <span class="row-span-3 size-8 self-start rounded-md border border-border sm:row-span-1 sm:self-center" [style.background]="'var(' + token.name + ')'"></span>
            <code class="font-mono text-xs">{{ token.name }}</code>
            <span class="text-sm text-text-muted">{{ lang() === 'es' ? token.es : token.en }}</span>
            <code class="font-mono text-xs text-text-muted">{{ value()(token.name) }}</code>
          </li>
        }
      </ul>
    </section>

    <section aria-labelledby="colors-accent">
      <sp-section-divider [heading]="t()('Usos del acento', 'Accent uses')" headingId="colors-accent" [level]="2" />
      <div class="mt-4 mb-10 flex flex-wrap items-center gap-6 pl-6">
        <button
          type="button"
          class="h-9 cursor-pointer rounded-lg border-0 bg-accent px-4 font-sans text-base font-semibold text-on-accent"
        >
          {{ t()('Acción primaria', 'Primary action') }}
        </button>
        <a href="#accent">{{ t()('Enlace subrayado', 'Underlined link') }}</a>
        <span
          id="accent"
          class="rounded-lg border border-border px-3 py-1 text-sm outline-2 -outline-offset-2 outline-focus"
        >
          {{ t()('Foco visible', 'Visible focus') }}
        </span>
      </div>
    </section>

    <section aria-labelledby="colors-phases">
      <sp-section-divider [heading]="t()('Fases', 'Phases')" headingId="colors-phases" [meta]="phases.length" [level]="2" />
      <ul [class]="list + ' mt-2'">
        @for (phase of phases; track phase.id) {
          <li class="grid grid-cols-1 items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
            <sp-phase-badge class="justify-self-start" [phase]="phase.id" />
            @for (token of [phase.fg, phase.bg]; track token) {
              <code class="flex items-center gap-2 font-mono text-xs text-text-muted">
                <span class="size-3 shrink-0 rounded-full border border-border" [style.background]="'var(' + token + ')'"></span>
                {{ token }}: {{ value()(token) }}
              </code>
            }
          </li>
        }
      </ul>
    </section>
  `,
})
export class Colors {
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly value = useTokenValues();
  protected readonly list = LIST;
  protected readonly row = ROW;
  protected readonly base = tokensOf("color");
  protected readonly phases = PHASES.map((id) => ({
    id,
    fg: `--color-phase-${id}`,
    bg: `--color-phase-${id}-bg`,
  }));
}
