// SPDX-License-Identifier: Apache-2.0
import { confirm, isCancel, note, select, text } from "@clack/prompts";
import type { Terminal } from "./session";

/**
 * The person's terminal. `interactive` depends only on real TTYs: there is no variable or
 * flag that turns an agent's shell into a person (ARCHITECTURE §4, invariant).
 */
export function systemTerminal(): Terminal {
  return {
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    async confirm(message) {
      const answer = await confirm({ message });
      return !isCancel(answer) && answer;
    },
    async choose(message, options) {
      const answer = await select<string>({
        message,
        options: options.map((option) => ({ value: option.value, label: option.label })),
      });
      return isCancel(answer)
        ? undefined
        : options.find((option) => option.value === answer)?.value;
    },
    async ask(message) {
      const answer = await text({ message });
      return isCancel(answer) ? undefined : answer;
    },
    note(title, body) {
      note(body, title);
    },
  };
}
