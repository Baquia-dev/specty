// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { fingerprint } from "../../src/server/events";
import { switchLog } from "../../src/store/switch";
import { AGENT } from "../support";
import { call, serving, sessionAt } from "./support";

const SWITCH = "/api/switch";

describe("Specty's switch in the local server", () => {
  it("AC1: turns it off and on with the person's name, reads it with its log and moves the events", async () => {
    const { root, server, headers } = await serving();
    try {
      const session = await sessionAt(root, AGENT);
      const view = async () => JSON.parse((await call(server.port, SWITCH, headers)).body);
      expect(await view()).toEqual({ on: true, log: [] });
      const before = await fingerprint(session);

      const off = await call(server.port, SWITCH, headers, { on: false });
      expect(off.status).toBe(200);
      const turnedOff = JSON.parse(off.body);
      expect(turnedOff).toEqual({
        on: false,
        by: "Ana",
        at: expect.any(String),
        log: [{ on: false, by: "Ana", at: turnedOff.at }],
      });
      expect(Number.isNaN(Date.parse(turnedOff.at))).toBe(false);
      expect(await view()).toEqual(turnedOff);
      const moved = await fingerprint(session);
      expect(moved).not.toBe(before);

      // The state it already has: the same view, and no line.
      const again = await call(server.port, SWITCH, headers, { on: false });
      expect([again.status, JSON.parse(again.body)]).toEqual([200, turnedOff]);
      expect(await switchLog(session.git)).toHaveLength(1);
      expect(await fingerprint(session)).toBe(moved);

      expect((await call(server.port, SWITCH, headers, { on: true })).status).toBe(200);
      const on = await view();
      expect(on).toMatchObject({ on: true, by: "Ana", at: expect.any(String) });
      expect(on.log.map((entry: { readonly on: boolean }) => entry.on)).toEqual([true, false]);
      expect(await switchLog(session.git)).toEqual(on.log);
      expect(await fingerprint(session)).not.toBe(moved);
    } finally {
      await server.close();
    }
  });

  it("AC2: refuses a request without the token, a body without a boolean on and a read-only server", async () => {
    const { root, server, headers } = await serving();
    try {
      const session = await sessionAt(root, AGENT);
      const { cookie, origin } = headers;
      const withoutToken = await call(server.port, SWITCH, { cookie, origin }, { on: false });
      expect(withoutToken.status).toBe(403);
      expect((await call(server.port, SWITCH, headers, { on: "no" })).status).toBe(400);
      expect((await call(server.port, SWITCH, headers, {})).status).toBe(400);
      expect(await switchLog(session.git)).toEqual([]);
    } finally {
      await server.close();
    }
    const readOnly = await serving(false);
    try {
      const refused = await call(readOnly.server.port, SWITCH, readOnly.headers, { on: false });
      expect([refused.status, refused.body]).toEqual([403, '{"error":"read-only"}']);
      expect(await switchLog((await sessionAt(readOnly.root, AGENT)).git)).toEqual([]);
      // Reading it is not an action: the agent's server still shows it.
      const read = await call(readOnly.server.port, SWITCH, readOnly.headers);
      expect([read.status, JSON.parse(read.body)]).toEqual([200, { on: true, log: [] }]);
    } finally {
      await readOnly.server.close();
    }
  });
});
