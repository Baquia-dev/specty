// SPDX-License-Identifier: Apache-2.0
import { personAtTerminal } from "@baquia-dev/specty-core";
import { confirm, isCancel, multiselect, note, select, text } from "@clack/prompts";
import type { Terminal } from "./session";

/**
 * The person's terminal. `interactive` needs real TTYs and an environment that does not
 * give an agent away: there is no variable or flag that turns an agent's shell into a
 * person (ARCHITECTURE §4, invariant), and an agent's pseudo-terminal is still the agent's.
 */
export function systemTerminal(env: Readonly<Record<string, string | undefined>>): Terminal {
  return {
    interactive: personAtTerminal(Boolean(process.stdin.isTTY && process.stdout.isTTY), env),
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
    async chooseMany(message, options, initial) {
      // At least one: a confirmed question always has an answer.
      const answer = await multiselect<string>({
        message,
        options: options.map((option) => ({ value: option.value, label: option.label })),
        initialValues: [...initial],
        required: true,
      });
      return isCancel(answer)
        ? undefined
        : options.filter((option) => answer.includes(option.value)).map((option) => option.value);
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
