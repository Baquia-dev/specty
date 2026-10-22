// SPDX-License-Identifier: Apache-2.0
// Web worker: derives the views off the main thread, so core's parser never weighs on the UI.
import type { DeriveRequest, DeriveResponse } from "./records";
import { deriveViews } from "./views";

export function answer(request: DeriveRequest): DeriveResponse {
  return { id: request.id, views: deriveViews(request.records) };
}

addEventListener("message", (event: MessageEvent<DeriveRequest>) => {
  postMessage(answer(event.data));
});
