// SPDX-License-Identifier: Apache-2.0
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { type AgentTool, ENABLED_AGENTS } from "@baquia-dev/specty-core/light";
import { Button } from "../components/button";
import { Toasts } from "../components/toast";
import { agentName } from "../data/agent-name";
import type { ChangeView, Unattended } from "../data/records";
import { Preferences } from "../theme/preferences";

/** One agent and the order that opens it in the change's folder. */
interface Hint {
  readonly agent: string;
  readonly command: string;
}

/**
 * The order that opens each agent in a folder: the ones `specty new` proposes (Codex with `-C`,
 * OpenCode and Cursor with the folder, Antigravity CLI after `cd`), and Claude Code after `cd`.
 * Only those of the agents this version enables (`ENABLED_AGENTS`) are offered, in its order.
 */
const OPEN_IN: Partial<Readonly<Record<AgentTool, (folder: string) => Hint>>> = {
  "claude-code": (folder) => ({ agent: "Claude Code", command: `cd "${folder}" && claude` }),
  codex: (folder) => ({ agent: "Codex", command: `codex -C "${folder}"` }),
  opencode: (folder) => ({ agent: "OpenCode", command: `opencode "${folder}"` }),
  cursor: (folder) => ({ agent: "Cursor", command: `cursor "${folder}"` }),
  antigravity: (folder) => ({ agent: "Antigravity CLI", command: `cd "${folder}" && agy` }),
};

/**
 * A change that waits for the agent with no conversation in its folder (an orphan, or one whose
 * conversation left), or where nobody picks up the person's last decision: why, what to do then,
 * how to resume it with each agent, each order with «Copiar», and how from a session already
 * open. Above the change's tabs.
 */
@Component({
  selector: "sp-resume-hints",
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-2 pt-4" [attr.aria-label]="t()('Cómo retomarlo', 'How to resume it')">
      <h2 class="m-0 text-sm font-semibold">{{ t()('Cómo retomarlo', 'How to resume it') }}</h2>
      <p class="m-0 text-sm" data-why>{{ why() }}</p>
      @if (change().unattended) {
        <p class="m-0 text-sm" data-todo>
          {{ t()('Si la conversación del agente sigue abierta, escríbele «sigue» para que ejecute', "If the agent's conversation is still open, write “go on” in it so it runs") }}
          <code class="font-mono text-xs">specty next</code>
          {{ t()('y siga desde tu decisión; si se cerró, abre otra en su carpeta con una de estas órdenes.', 'and goes on from your decision; if it closed, open another one in its folder with one of these orders.') }}
        </p>
      }
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        @for (hint of hints(); track hint.agent) {
          <li class="flex flex-wrap items-center gap-2" data-agent>
            <span class="min-w-32 text-[13px] text-text-muted" data-name>{{ hint.agent }}</span>
            <code class="font-mono text-xs break-all">{{ hint.command }}</code>
            <sp-button (pressed)="copy(hint.command)">{{ t()('Copiar', 'Copy') }}</sp-button>
          </li>
        }
      </ul>
      <p class="m-0 text-[13px] text-text-muted" data-open-session>
        {{ t()('Desde una sesión ya abierta: en Claude Code,', 'From a session already open: in Claude Code,') }}
        <code class="font-mono text-xs">EnterWorktree</code> {{ t()('con', 'with') }}
        <code class="font-mono text-xs">name: "{{ change().id }}"</code>{{ t()('; en las demás,', '; in the others,') }}
        <code class="font-mono text-xs">specty enter {{ change().id }}</code>.
      </p>
      <p class="m-0 text-[13px] text-text-muted" data-then>
        {{ t()('Ya en la carpeta, el agente sigue con', 'Once in the folder, the agent goes on with') }}
        <code class="font-mono text-xs">specty next</code>.
      </p>
    </section>
  `,
})
export class ResumeHints {
  readonly change = input.required<ChangeView>();
  private readonly toasts = inject(Toasts);
  protected readonly t = inject(Preferences).t;

  /**
   * Why nobody works on it: nobody picks up the person's decision, its conversation left its
   * folder, or no conversation holds it.
   */
  protected readonly why = computed(() => {
    const { away, unattended } = this.change();
    if (unattended !== undefined) return this.unattendedWhy(unattended);
    if (away === undefined) {
      return this.t()(
        "Ninguna conversación trabaja en su carpeta.",
        "No conversation works in its folder.",
      );
    }
    const when = minutesAgo(away.ago);
    const agent = agentName(away.tool);
    return this.t()(
      `Su conversación (${agent}) salió de su carpeta ${when.es}.`,
      `Its conversation (${agent}) left its folder ${when.en}.`,
    );
  });

  /** What happened to the person's decision: the agent's `wait` ended, or no agent waited. */
  private unattendedWhy({ wait, holder }: Unattended): string {
    if (wait !== undefined) {
      const tool = wait.tool === undefined ? "" : ` (${agentName(wait.tool)})`;
      const when = minutesAgo(wait.ago);
      return wait.ended === "timeout"
        ? this.t()(
            `El specty wait del agente${tool} agotó su tiempo ${when.es}.`,
            `The agent's specty wait${tool} ran out of time ${when.en}.`,
          )
        : this.t()(
            `El specty wait del agente${tool} se cortó ${when.es}.`,
            `The agent's specty wait${tool} was cut off ${when.en}.`,
          );
    }
    if (holder === undefined) {
      return this.t()(
        "Ningún agente esperaba tu decisión, y ninguna conversación trabaja en su carpeta.",
        "No agent was waiting for your decision, and no conversation works in its folder.",
      );
    }
    const when = minutesAgo(holder.ago);
    const agent = agentName(holder.tool);
    return this.t()(
      `Ningún agente esperaba tu decisión; la última conversación en su carpeta (${agent}) dio un paso ${when.es}.`,
      `No agent was waiting for your decision; the last conversation in its folder (${agent}) took a step ${when.en}.`,
    );
  }

  protected readonly hints = computed(() => {
    const folder = this.change().folder;
    if (folder === undefined) return [];
    return ENABLED_AGENTS.flatMap((tool) => OPEN_IN[tool]?.(folder) ?? []);
  });

  /** Puts `command` on the clipboard, and says whether it could. */
  protected copy(command: string): void {
    const copied = navigator.clipboard?.writeText(command) ?? Promise.reject(new Error("none"));
    copied.then(
      () => this.toasts.show(this.t()("Orden copiada.", "Order copied."), "success"),
      () =>
        this.toasts.show(
          this.t()(
            "No se pudo copiar la orden: cópiala a mano.",
            "The order could not be copied: copy it by hand.",
          ),
          "error",
        ),
    );
  }
}

/** How long ago, from minutes, in both languages. */
function minutesAgo(minutes: number): { readonly es: string; readonly en: string } {
  if (minutes < 1) return { es: "ahora mismo", en: "just now" };
  if (minutes < 60) return { es: `hace ${minutes} min`, en: `${minutes} min ago` };
  const hours = Math.floor(minutes / 60);
  return { es: `hace ${hours} h`, en: `${hours} h ago` };
}
