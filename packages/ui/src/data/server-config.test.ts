// SPDX-License-Identifier: Apache-2.0
// What ServerData asks of the local server for the page «Configuración»: the configuration with
// why it cannot be saved, the check and the save of the person's edits, and each refusal in words.
import { DEFAULT_CONFIG } from "@baquia-dev/specty-core";
import { ActionError, type Bilingual } from "./records";
import { ServerData } from "./server";

const SESSION: [number, unknown] = [200, { actions: true, csrf: "t0k3n" }];
const EDITS = [{ path: ["verify", "timeoutSec"], value: 2400 }, { path: ["policy", "tests"] }];
const CHANGES = [
  { key: "verify.timeoutSec", before: 2000, after: 2400 },
  { key: "policy.tests", before: "contract" },
];
const RECORD = {
  input: { version: 1 },
  config: DEFAULT_CONFIG,
  defaults: DEFAULT_CONFIG,
  issues: [],
};

/**
 * A local server inside `fetch`: it answers by path, a text as it is and anything else as JSON,
 * and keeps every request.
 */
function serverAnswering(answers: Readonly<Record<string, readonly [number, unknown]>>) {
  const requests: { readonly url: string; readonly init?: RequestInit }[] = [];
  const fetched = vi.fn((url: string, init?: RequestInit) => {
    requests.push({ url, ...(init === undefined ? {} : { init }) });
    const [status, body] = answers[url] ?? [404, { error: "not found" }];
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status }));
  });
  vi.stubGlobal("fetch", fetched);
  return requests;
}

/** An event stream that never speaks: the listeners only hear the reading again after a save. */
class Quiet {
  addEventListener(): void {}
  close(): void {}
}

/** Why an action failed, in both languages. */
async function reason(action: Promise<unknown>): Promise<Bilingual> {
  const error: unknown = await action.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof ActionError)) throw new Error("the action did not fail with its reason");
  return error.text;
}

/** Why `POST /api/config` refused, with `body` as its 409 answer. */
function refusedWith(body: unknown): Promise<Bilingual> {
  serverAnswering({ "/api/session": SESSION, "/api/config": [409, body] });
  return reason(new ServerData().saveConfig(EDITS));
}

/** Why `GET /api/config` says the configuration cannot be saved, with `blocked` as its reason. */
async function blockedBy(blocked: unknown): Promise<Bilingual | undefined> {
  serverAnswering({ "/api/config": [200, { ...RECORD, blocked }] });
  return (await new ServerData().config()).blocked;
}

describe("ServerData and the configuration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC10: checks the edits with the CSRF token and gives the issues and the changes", async () => {
    const issues = [{ path: "size", message: "Thresholds must grow: S < M < L." }];
    const requests = serverAnswering({
      "/api/session": SESSION,
      "/api/config/check": [200, { issues, changes: CHANGES }],
    });
    expect(await new ServerData().checkConfig(EDITS)).toEqual({ issues, changes: CHANGES });
    const check = requests.find(({ url }) => url === "/api/config/check");
    expect(check?.init?.method).toBe("POST");
    expect(check?.init?.body).toBe(JSON.stringify({ edits: EDITS }));
    expect(new Headers(check?.init?.headers).get("X-Specty-CSRF")).toBe("t0k3n");
  });

  it("AC10: saves the edits with the CSRF token and gives the commit and the changes", async () => {
    const requests = serverAnswering({
      "/api/session": SESSION,
      "/api/config": [200, { commit: "abc1234", changes: CHANGES }],
    });
    vi.stubGlobal("EventSource", Quiet);
    const data = new ServerData();
    const heard = vi.fn();
    data.subscribe(heard);
    expect(await data.saveConfig(EDITS)).toEqual({ commit: "abc1234", changes: CHANGES });
    const save = requests.find(({ url }) => url === "/api/config");
    expect(save?.init?.method).toBe("POST");
    expect(save?.init?.body).toBe(JSON.stringify({ edits: EDITS }));
    expect(new Headers(save?.init?.headers).get("X-Specty-CSRF")).toBe("t0k3n");
    expect(heard).toHaveBeenCalled();
  });

  it("AC10: an answer of another shape gives the error of unexpected data", async () => {
    serverAnswering({ "/api/session": SESSION, "/api/config/check": [200, { issues: "none" }] });
    expect((await reason(new ServerData().checkConfig(EDITS))).es).toBe(
      "El servidor devolvió datos inesperados.",
    );
    serverAnswering({ "/api/session": SESSION, "/api/config": [200, { changes: CHANGES }] });
    expect((await reason(new ServerData().saveConfig(EDITS))).es).toBe(
      "El servidor devolvió datos inesperados.",
    );
    serverAnswering({ "/api/config": [200, { ...RECORD, issues: [{ path: 1 }] }] });
    expect((await reason(new ServerData().config())).es).toBe(
      "El servidor devolvió datos inesperados.",
    );
    serverAnswering({ "/api/config": [200, { ...RECORD, blocked: "change" }] });
    expect((await reason(new ServerData().config())).es).toBe(
      "El servidor devolvió datos inesperados.",
    );
  });

  it("AC10: neither checks nor saves from a server the agent started", async () => {
    const requests = serverAnswering({ "/api/session": [200, { actions: false }] });
    expect((await reason(new ServerData().checkConfig(EDITS))).es).toContain(
      "Este servidor es de solo lectura",
    );
    expect((await reason(new ServerData().saveConfig(EDITS))).es).toContain(
      "Este servidor es de solo lectura",
    );
    expect(requests.map(({ url }) => url)).toEqual(["/api/session", "/api/session"]);
    serverAnswering({ "/api/session": SESSION, "/api/config": [403, { error: "read-only" }] });
    expect((await reason(new ServerData().saveConfig(EDITS))).es).toContain("lo arrancó el agente");
  });

  it("AC9: reads the configuration with why it cannot be saved, in both languages", async () => {
    serverAnswering({ "/api/config": [200, RECORD] });
    expect((await new ServerData().config()).blocked).toBeUndefined();
    const change = await blockedBy({ kind: "change", id: "20261107-otro" });
    expect(change?.es).toContain("cambio en curso");
    expect(change?.es).toContain("20261107-otro");
    expect(change?.en).toContain("change in progress");
    expect(change?.en).toContain("20261107-otro");
    const uncommitted = await blockedBy({ kind: "uncommitted" });
    expect(uncommitted?.es).toContain("cambios sin commit");
    expect(uncommitted?.en).toContain("uncommitted changes");
    const yaml = await blockedBy({ kind: "yaml" });
    expect(yaml?.es).toContain("no es YAML");
    expect(yaml?.en).toContain("not YAML");
  });

  it("AC9: says why the server refused to save, in both languages", async () => {
    const change = await refusedWith({ error: "change", id: "20261107-otro" });
    expect(change.es).toContain("20261107-otro");
    expect(change.en).toContain("change in progress");
    expect((await refusedWith({ error: "uncommitted" })).es).toContain("cambios sin commit");
    expect((await refusedWith({ error: "yaml" })).en).toContain("not YAML");
    const invalid = await refusedWith({
      error: "invalid",
      issues: [{ path: "size", message: "Thresholds must grow: S < M < L." }],
    });
    expect(invalid.es).toContain("no es válido");
    expect(invalid.en).toContain("not valid");
    const unchanged = await refusedWith({ error: "unchanged" });
    expect(unchanged.es).toContain("nada que guardar");
    expect(unchanged.en).toContain("nothing to save");
    const turn = await refusedWith({
      error: "turn",
      command: "accept",
      folder: "/repo/.worktrees/x",
    });
    expect(turn.es).toContain("turno de aterrizaje");
    expect(turn.en).toContain("landing turn");
    for (const said of [turn.es, turn.en]) {
      expect(said).toContain("accept");
      expect(said).toContain("/repo/.worktrees/x");
    }
    const git = await refusedWith({ error: "git", detail: "nothing added to commit" });
    expect(git.es).toContain("git no pudo hacer el commit");
    expect(git.en).toContain("git could not commit");
    expect(git.es).toContain("nothing added to commit");
    expect((await refusedWith({ error: "otro" })).es).toBe("El servidor respondió 409.");
  });
});
