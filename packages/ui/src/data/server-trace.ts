// SPDX-License-Identifier: Apache-2.0
// The traceability's reads from the local server (docs/ui.md, «Historial y trazabilidad» and
// «Progreso»), as ServerData makes them: the files the change left and a file's blocks
// (`GET /api/changes/<id>/trace`), and a test's code (`GET /api/changes/<id>/test`), with what
// each refusal means. They are reads, so even an agent's server gives them.
import { ActionError, type Bilingual } from "./records";
import { answered, isObject, NO_SESSION, UNEXPECTED } from "./server-answers";
import { isStrings, isTrace, type TraceRecord } from "./trace";

const NO_TRACE_YET: Bilingual = {
  es: "Este cambio aún no tiene commits, o ese archivo no es suyo.",
  en: "This change has no commits yet, or that file is not its own.",
};
const NOT_A_TEST: Bilingual = {
  es: "No se puede mostrar el código de este test: no es un test del cambio o no se pudo leer.",
  en: "This test's code cannot be shown: it is not a test of the change, or it could not be read.",
};
const TRACE_TOO_LARGE: Bilingual = {
  es: "Este archivo es demasiado grande para trazarlo aquí: usa `specty why <archivo>:<línea>` en la terminal.",
  en: "This file is too large to trace here: use `specty why <file>:<line>` in the terminal.",
};

/** The files the change left. */
export async function fetchTraceFiles(change: string): Promise<readonly string[]> {
  const body = await traced(`/api/changes/${encodeURIComponent(change)}/trace`);
  if (isObject(body) && isStrings(body.files)) return body.files;
  throw new ActionError(UNEXPECTED);
}

/** `path` as the change left it, in blocks with what `specty why` tells of each. */
export async function fetchTrace(change: string, path: string): Promise<TraceRecord> {
  const query = `?path=${encodeURIComponent(path)}`;
  const body = await traced(`/api/changes/${encodeURIComponent(change)}/trace${query}`);
  if (isTrace(body)) return body;
  throw new ActionError(UNEXPECTED);
}

/** A test of the change as its branch has it. */
export async function fetchTestCode(change: string, path: string): Promise<string> {
  const query = `?path=${encodeURIComponent(path)}`;
  const response = await fetch(`/api/changes/${encodeURIComponent(change)}/test${query}`);
  if (response.ok) return response.text();
  if (response.status === 403) throw new ActionError(NO_SESSION);
  if (response.status === 404) throw new ActionError(NOT_A_TEST);
  throw new ActionError(answered(response.status));
}

/** A read of the traceability, or why there is none. */
async function traced(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (response.ok) return response.json().catch(() => undefined);
  if (response.status === 403) throw new ActionError(NO_SESSION);
  if (response.status === 404) throw new ActionError(NO_TRACE_YET);
  if (response.status === 413) throw new ActionError(TRACE_TOO_LARGE);
  throw new ActionError(answered(response.status));
}
