// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { Preferences } from "../theme/preferences";
import { type Token, tokensOf } from "../theme/tokens";
import { useTokenValues } from "./colors";

/** Shared row: a token's name, description and current value next to its sample. */
const TOKEN_LABEL = `
  <span class="flex min-w-0 flex-col">
    <code class="font-mono text-xs">{{ token.name }}</code>
    <span class="text-sm text-text-muted">{{ lang() === 'es' ? token.es : token.en }}</span>
    <code class="font-mono text-xs text-text-muted">{{ value()(token.name) }}</code>
  </span>
`;

@Component({
  selector: "sp-typography",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mt-0 mb-2 text-xl font-semibold">{{ t()('Tipografía', 'Typography') }}</h1>
    <p class="mt-0 mb-8 max-w-[64ch] text-text-muted">
      {{
        t()(
          'Geist para la interfaz y Geist Mono para rutas, comandos, ids y código. Ambas van incluidas en la app: no se descargan de la red.',
          'Geist for the interface and Geist Mono for paths, commands, ids and code. Both ship with the app: nothing is downloaded.'
        )
      }}
    </p>
    <ul class="m-0 flex list-none flex-col gap-3 p-0">
      @for (token of families; track token.name) {
        <li class="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <span class="text-xl" [style.font-family]="'var(' + token.name + ')'">
            {{ t()('Agrupar la evolución académica por trimestre', 'Group academic progress by term') }}
            · AC1 T11 0O 1lI
          </span>
          ${TOKEN_LABEL}
        </li>
      }
      @for (token of sizes; track token.name) {
        <li class="flex flex-wrap items-baseline justify-between gap-4 rounded-xl border border-border bg-surface p-4">
          <span
            [style.font-size]="'var(' + token.name + ')'"
            [style.line-height]="'var(' + token.name + '--line-height)'"
          >
            {{ t()('Esperan tu decisión', 'Waiting for your decision') }}
          </span>
          ${TOKEN_LABEL}
        </li>
      }
    </ul>
  `,
})
export class Typography {
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly value = useTokenValues();
  protected readonly families = tokensOf("type").filter((token) =>
    token.name.startsWith("--font-"),
  );
  protected readonly sizes = tokensOf("type").filter((token) => token.name.startsWith("--text-"));
}

@Component({
  selector: "sp-foundations",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mt-0 mb-2 text-xl font-semibold">{{ t()('Fundamentos', 'Foundations') }}</h1>
    <p class="mt-0 mb-8 max-w-[64ch] text-text-muted">
      {{
        t()(
          'Espaciado de 4 px, radios moderados, sombras mínimas y movimiento corto que respeta el movimiento reducido.',
          'A 4 px spacing scale, moderate radii, minimal shadows and short motion that respects reduced motion.'
        )
      }}
    </p>

    <h2 class="mb-4 text-lg font-semibold">{{ t()('Espaciado', 'Spacing') }}</h2>
    <ul class="m-0 mb-10 flex list-none flex-col gap-2 p-0" [attr.aria-label]="t()('Escala de espaciado', 'Spacing scale')">
      @for (step of steps; track step) {
        <li class="flex items-center gap-4">
          <code class="w-16 font-mono text-xs text-text-muted">{{ step * 4 }} px</code>
          <span class="h-3 rounded-sm bg-accent" [style.width]="'calc(var(--spacing) * ' + step + ')'"></span>
        </li>
      }
    </ul>
    <ul class="m-0 mb-10 list-none p-0">
      @for (token of spacing; track token.name) {
        <li class="flex gap-4">${TOKEN_LABEL}</li>
      }
    </ul>

    <h2 class="mb-4 text-lg font-semibold">{{ t()('Radios y sombras', 'Radii and shadows') }}</h2>
    <ul class="m-0 mb-10 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0">
      @for (token of shapes; track token.name) {
        <li class="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          <span
            class="size-12 shrink-0 border border-border bg-bg"
            [style.border-radius]="token.group === 'radius' ? 'var(' + token.name + ')' : 'var(--radius-lg)'"
            [style.box-shadow]="token.group === 'shadow' ? 'var(' + token.name + ')' : 'none'"
          ></span>
          ${TOKEN_LABEL}
        </li>
      }
    </ul>

    <h2 class="mb-4 text-lg font-semibold">{{ t()('Movimiento', 'Motion') }}</h2>
    <div class="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <button
        type="button"
        class="h-9 cursor-pointer self-start rounded-lg border border-border bg-bg px-4 font-sans text-base text-text"
        [attr.aria-pressed]="moved()"
        (click)="moved.set(!moved())"
      >
        {{ t()('Probar la transición', 'Try the transition') }}
      </button>
      <span
        class="size-6 rounded-md bg-accent"
        style="transition: transform var(--duration-base) var(--ease-standard)"
        [style.transform]="moved() ? 'translateX(160px)' : 'none'"
      ></span>
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        @for (token of motion; track token.name) {
          <li class="flex gap-4">${TOKEN_LABEL}</li>
        }
      </ul>
    </div>
  `,
})
export class Foundations {
  private readonly preferences = inject(Preferences);
  protected readonly t = this.preferences.t;
  protected readonly lang = this.preferences.lang;
  protected readonly value = useTokenValues();
  protected readonly steps = [1, 2, 3, 4, 6, 8, 12, 16];
  protected readonly spacing = tokensOf("space");
  protected readonly shapes: readonly Token[] = [...tokensOf("radius"), ...tokensOf("shadow")];
  protected readonly motion = tokensOf("motion");
  protected readonly moved = signal(false);
}
