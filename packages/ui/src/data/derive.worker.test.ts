// SPDX-License-Identifier: Apache-2.0
// Loading the module registers its listener: in the tests, on the window of jsdom, where other
// messages also arrive (the greeting of an MCP App's view goes to `window.parent`, the window itself).
import { answer } from "./derive.worker";
import type { DeriveRequest } from "./records";
import { sampleRecords } from "./sample-records";

/** Sends `data` to the module as a message, and gives what it answered and the errors it raised. */
function send(data: unknown) {
  const posted = vi.fn();
  vi.stubGlobal("postMessage", posted);
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    event.preventDefault();
    errors.push(event.error);
  };
  window.addEventListener("error", onError);
  try {
    window.dispatchEvent(new MessageEvent("message", { data }));
  } finally {
    window.removeEventListener("error", onError);
  }
  return { posted, errors };
}

describe("the worker that derives the views", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC2: ignores a message that is not a request to derive, as the greeting of an MCP App", () => {
    const greeting = {
      jsonrpc: "2.0",
      id: 1,
      method: "ui/initialize",
      params: { protocolVersion: "2026-01-26" },
    };
    for (const data of [greeting, { id: 2 }, { id: "3", records: [] }, undefined, null, "hola"]) {
      const { posted, errors } = send(data);
      expect(errors, JSON.stringify(data)).toEqual([]);
      expect(posted, JSON.stringify(data)).not.toHaveBeenCalled();
    }
  });

  it("AC3: answers a request to derive with its id and the views of its records", () => {
    const request: DeriveRequest = { id: 7, records: sampleRecords(Date.now()) };
    const { posted, errors } = send(request);
    expect(errors).toEqual([]);
    expect(posted).toHaveBeenCalledWith(answer(request));
  });
});
