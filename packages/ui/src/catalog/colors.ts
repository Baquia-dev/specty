// SPDX-License-Identifier: Apache-2.0
import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { PHASES, type Phase } from "@baquia-dev/specty-core";
import {
  LucideArchive,
  LucideBan,
  LucideCircleCheck,
  LucideCode,
  LucideDynamicIcon,
  LucideEye,
  LucideListChecks,
  LucidePencilLine,
  LucideWrench,
} from "@lucide/angular";
import { Preferences } from "../theme/preferences";
import { PHASE_LABELS, tokensOf } from "../theme/tokens";

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

/** Phases are never told apart by color alone: each one has its icon and its name. */
export const PHASE_ICONS = {
  draft: LucidePencilLine,
  review: LucideEye,
  implementing: LucideCode,
  adjusting: LucideWrench,
  acceptance: LucideListChecks,
  closing: LucideArchive,
  done: LucideCircleCheck,
  cancelled: LucideBan,
} as const satisfies Record<Phase, unknown>;

@Component({
  selector: "sp-colors",
  imports: [LucideDynamicIcon],
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

    <h2 class="mb-4 text-lg font-semibold">{{ t()('Base y acento', 'Base and accent') }}</h2>
    <ul class="m-0 mb-10 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0">
      @for (token of base; track token.name) {
        <li class="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          <span
            class="size-10 shrink-0 rounded-lg border border-border"
            [style.background]="'var(' + token.name + ')'"
          ></span>
          <span class="flex min-w-0 flex-col">
            <code class="font-mono text-xs">{{ token.name }}</code>
            <span class="text-sm text-text-muted">{{ lang() === 'es' ? token.es : token.en }}</span>
            <code class="font-mono text-xs text-text-muted">{{ value()(token.name) }}</code>
          </span>
        </li>
      }
    </ul>

    <h2 class="mb-4 text-lg font-semibold">{{ t()('Usos del acento', 'Accent uses') }}</h2>
    <div class="mb-10 flex flex-wrap items-center gap-6 rounded-xl border border-border bg-surface p-6">
      <button
        type="button"
        class="h-9 cursor-pointer rounded-lg border-0 bg-accent px-4 font-sans text-base font-semibold text-on-accent"
      >
        {{ t()('Acción primaria', 'Primary action') }}
      </button>
      <a href="#accent">{{ t()('Enlace subrayado', 'Underlined link') }}</a>
      <span
        id="accent"
        class="rounded-lg border border-border px-3 py-1 text-sm outline-2 outline-offset-2 outline-focus"
      >
        {{ t()('Foco visible', 'Visible focus') }}
      </span>
    </div>

    <h2 class="mb-4 text-lg font-semibold">{{ t()('Fases', 'Phases') }}</h2>
    <ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 p-0">
      @for (phase of phases(); track phase.id) {
        <li class="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3" [attr.data-phase]="phase.id">
          <span
            class="inline-flex h-6 items-center gap-1.5 self-start rounded-md px-2 text-xs font-medium"
            [style.color]="'var(' + phase.fg + ')'"
            [style.background]="'var(' + phase.bg + ')'"
          >
            <svg [lucideIcon]="phase.icon" size="13" aria-hidden="true"></svg>
            {{ phase.label }}
          </span>
          <code class="font-mono text-xs text-text-muted">{{ phase.fg }}: {{ value()(phase.fg) }}</code>
          <code class="font-mono text-xs text-text-muted">{{ phase.bg }}: {{ value()(phase.bg) }}</code>
        </li>
      }
    </ul>
  `,
})
export class Colors {
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly value = useTokenValues();
  protected readonly base = tokensOf("color");
  protected readonly phases = computed(() =>
    PHASES.map((id) => ({
      id,
      icon: PHASE_ICONS[id],
      label: PHASE_LABELS[id][this.lang()],
      fg: `--color-phase-${id}`,
      bg: `--color-phase-${id}-bg`,
    })),
  );
}
