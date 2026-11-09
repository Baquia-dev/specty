// SPDX-License-Identifier: Apache-2.0
// Web worker: derives the views off the main thread, so core's parser never weighs on the UI.
import type { DeriveRequest, DeriveResponse } from "./records";
import { deriveViews } from "./views";

export function answer(request: DeriveRequest): DeriveResponse {
  return { id: request.id, views: deriveViews(request.records) };
}

/** A request to derive: a numeric id and the list of records. */
function isRequest(data: unknown): data is DeriveRequest {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    typeof data.id === "number" &&
    "records" in data &&
    Array.isArray(data.records)
  );
}

// Only the page that started the worker writes to it. In the tests, though, importing `answer`
// leaves this listener on jsdom's window, where other messages arrive too (an MCP App's greeting
// goes to `window.parent`, the window itself): it ignores whatever is not a request.
addEventListener("message", (event: MessageEvent<unknown>) => {
  if (isRequest(event.data)) postMessage(answer(event.data));
});
