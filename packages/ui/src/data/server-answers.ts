// SPDX-License-Identifier: Apache-2.0
// What the local server answers, as ServerData reads it: the checks of its data and what each
// refusal means, in both languages. Pure.
import type { RunRecord } from "./progress";
import type { Bilingual, ChangeRecord, Delegation } from "./records";

export const NO_SESSION: Bilingual = {
  es: "Esta pestaña no tiene sesión: abre el enlace que imprime `specty ui`.",
  en: "This tab has no session: open the link that `specty ui` prints.",
};
export const UNEXPECTED: Bilingual = {
  es: "El servidor devolvió datos inesperados.",
  en: "The server returned unexpected data.",
};
export const READ_ONLY: Bilingual = {
  es: "Este servidor es de solo lectura porque lo arrancó el agente: para decidir desde aquí, arráncalo tú con `specty ui` en tu terminal.",
  en: "This server is read only because the agent started it: to decide from here, start it yourself with `specty ui` in your terminal.",
};
export const NO_DIFF: Bilingual = {
  es: "El servidor no tiene diff de esto: aún no hay commits de esta tarea o de este cambio.",
  en: "The server has no diff for this: this task or change has no commits yet.",
};
const NOT_UNDERSTOOD: Bilingual = {
  es: "El servidor no entendió la petición.",
  en: "The server did not understand the request.",
};

/** A status with nothing more to say about it. */
export function answered(status: number): Bilingual {
  return { es: `El servidor respondió ${status}.`, en: `The server answered ${status}.` };
}

/** Why the server refused: the flow's own words (409), or what the status means. */
export async function refusal(response: Response): Promise<Bilingual> {
  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 409) {
    const said = outputText(body);
    if (said !== undefined) return { es: said, en: said };
  }
  if (response.status === 403) {
    return isObject(body) && body.error === "read-only" ? READ_ONLY : NO_SESSION;
  }
  if (response.status === 400) return NOT_UNDERSTOOD;
  return answered(response.status);
}

/** A diff over the server's limit: the range to see it with git, when the server gave it. */
export function tooLarge(range: unknown): Bilingual {
  const command = typeof range === "string" ? `git diff ${range}` : "git diff";
  return {
    es: `El diff pasa de 512 KB y no cabe aquí: míralo con \`${command}\` en la carpeta del cambio.`,
    en: `The diff is over 512 KB and does not fit here: see it with \`${command}\` in the change's folder.`,
  };
}

/** A command's output as one text: its lines, then its next step, in the repository's language. */
function outputText(body: unknown): string | undefined {
  if (!isObject(body) || !Array.isArray(body.blocks)) return undefined;
  const lines = body.blocks.flatMap((block: unknown) =>
    isObject(block) && Array.isArray(block.lines) ? block.lines.filter(isText) : [],
  );
  const next = typeof body.next === "string" ? body.next : "";
  const step = next === "" ? [] : [`${next.charAt(0).toUpperCase()}${next.slice(1)}`];
  const text = [...lines, ...step].join(" ");
  return text === "" ? undefined : text;
}

/** `GET /api/delegation`'s answer: on or off, who and when, and the warning in both languages. */
export function isDelegation(value: unknown): value is Delegation {
  if (!isObject(value) || typeof value.on !== "boolean" || !isObject(value.warning)) return false;
  const { es, en } = value.warning;
  const optional = (field: unknown) => field === undefined || typeof field === "string";
  return (
    Array.isArray(es) &&
    es.every(isText) &&
    Array.isArray(en) &&
    en.every(isText) &&
    optional(value.by) &&
    optional(value.at)
  );
}

/** A verification the server runs: its command, when it started and its lines so far. */
export function isRun(value: unknown): value is RunRecord {
  return (
    isObject(value) &&
    typeof value.command === "string" &&
    typeof value.startedAt === "string" &&
    Array.isArray(value.output) &&
    value.output.every(isText) &&
    (value.task === undefined || typeof value.task === "string")
  );
}

/** A `run` event: the change, and its run, or nothing when it ended; unreadable, undefined. */
export function runEvent(
  data: unknown,
): { readonly change: string; readonly run: RunRecord | undefined } | undefined {
  if (typeof data !== "string") return undefined;
  const told: unknown = (() => {
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  })();
  if (!isObject(told) || typeof told.change !== "string") return undefined;
  if (told.run === null) return { change: told.change, run: undefined };
  return isRun(told.run) ? { change: told.change, run: told.run } : undefined;
}

export function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

/** A light check of the answer: the worker parses each spec, and each state is Specty's own file. */
export function isRecords(value: unknown): value is readonly ChangeRecord[] {
  return Array.isArray(value) && value.every(isRecordLike);
}

function isRecordLike(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "spec" in value &&
    typeof value.spec === "string" &&
    "state" in value &&
    typeof value.state === "object" &&
    value.state !== null &&
    "phaseSince" in value &&
    typeof value.phaseSince === "string"
  );
}
