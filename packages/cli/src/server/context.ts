// SPDX-License-Identifier: Apache-2.0
import { timingSafeEqual } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Session } from "../session";
import type { ChangeEvents } from "./events";
import type { Runs } from "./runs";

export interface ServerOptions {
  readonly session: Session;
  /** The first port to try, and up to 19 after it; 0 lets the system choose. */
  readonly port: number;
  /** The folder of the built UI; without one, a page explains how to build it. */
  readonly ui: string | undefined;
  /**
   * The person may decide from the UI: only when they started the server themselves, since an
   * agent that starts it sees the link.
   */
  readonly actions?: boolean;
  /** Milliseconds between looks at the changes while someone listens to the events. */
  readonly interval?: number;
}

/** What every request of the server sees: its options, its secrets, its events and its queues. */
export interface Context extends ServerOptions {
  readonly port: number;
  readonly token: string;
  /** Cookies of `localhost` reach every port: the name carries this one. */
  readonly cookie: string;
  /** Every action carries it in `X-Specty-CSRF`; `GET /api/session` gives it to the page. */
  readonly csrf: string;
  readonly events: ChangeEvents;
  /** Runs the actions one at a time: the commands were not written to overlap. */
  readonly serial: <T>(task: () => Promise<T>) => Promise<T>;
  readonly runs: Runs;
}

export const TEXT = "text/plain; charset=utf-8";
export const JSON_TYPE = "application/json; charset=utf-8";
/** Sent with every answer: no sniffing, no referrer with the link, no frames, no caching. */
export const SAFE = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

export function isLocal(host: string | undefined, port: number): boolean {
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`;
}

export function hasSession(cookies: string | undefined, context: Context): boolean {
  const value = (cookies ?? "")
    .split(";")
    .map((cookie) => cookie.trim().split("="))
    .find(([name]) => name === context.cookie)?.[1];
  return value !== undefined && same(value, context.token);
}

export function same(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function send(
  response: ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
) {
  response.writeHead(status, { ...SAFE, "Content-Type": type });
  response.end(body);
}
