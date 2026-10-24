// SPDX-License-Identifier: Apache-2.0
// Delegated mode in the prototype: off until the person turns it on, with the warning the CLI
// shows before `specty delegate on` (core's `delegationWarning`), word for word.
import type { Delegation } from "./records";
import { REVIEWER } from "./sample-records";

const WARNING: Delegation["warning"] = {
  es: [
    "Con el modo delegado, tu agente toma sin preguntarte las decisiones que hoy son solo tuyas:",
    "- aprueba specs y confirma sus supuestos de impacto alto;",
    "- aprueba o rechaza ampliaciones de alcance, también en rutas sensibles;",
    "- acepta los resultados que pasan la verificación completa;",
    "- cierra cambios y los incorpora a la rama principal, y cancela cambios.",
    "Specty deja de garantizar que una persona revise cada spec y cada resultado. La auditoría registra cada una de esas acciones como del agente, por delegación.",
    "Vale para este clon y todas sus worktrees hasta que ejecutes `specty delegate off`.",
  ],
  en: [
    "In delegated mode, your agent makes the decisions that today are only yours, without asking you:",
    "- it approves specs and confirms their high-impact assumptions;",
    "- it approves or rejects scope extensions, sensitive paths included;",
    "- it accepts the results that pass the full verification;",
    "- it closes changes and merges them into the main branch, and cancels changes.",
    "Specty no longer guarantees that a person reviews every spec and every result. The audit log records each of those actions as the agent's, by delegation.",
    "It applies to this clone and all its worktrees until you run `specty delegate off`.",
  ],
};

/** The sample's delegated mode: on since `at`, turned on by the sample's reviewer, or off. */
export function sampleDelegation(on: boolean, at: number = Date.now()): Delegation {
  return on
    ? { on, by: REVIEWER, at: new Date(at).toISOString(), warning: WARNING }
    : { on, warning: WARNING };
}
