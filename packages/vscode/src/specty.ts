// SPDX-License-Identifier: Apache-2.0
// Talks to the `specty` CLI, without a shell: the status as data, and the server of its local UI.
import { type ExecFileException, execFile, spawn } from "node:child_process";
import type { Phase, WaitingFor } from "@baquia-dev/specty-core";

/** An open change, as `specty --json status` gives it. */
export interface OpenChange {
  readonly id: string;
  readonly phase: Phase;
  readonly title: string;
  readonly waitingFor: WaitingFor;
  /** Whether it is the change of the folder the status was read in. */
  readonly current: boolean;
  /** Where it lives, relative to that folder, when it is not that folder. */
  readonly folder?: string;
}

interface Status {
  readonly changes: readonly OpenChange[];
  readonly delegated: boolean;
}

/** The status, or why there is none: no `specty`, one without the data, or its refusal. */
export type StatusRead =
  | { readonly kind: "status"; readonly status: Status }
  | { readonly kind: "missing" }
  | { readonly kind: "outdated" }
  | { readonly kind: "failed"; readonly message: string };

/** The server of `specty ui`: the link that opens it, and how to stop it. */
export interface UiServer {
  readonly link: string;
  /** Resolves when its process ends. */
  readonly exited: Promise<void>;
  stop(): void;
}

type UiStart =
  | { readonly kind: "started"; readonly server: UiServer }
  | { readonly kind: "missing" }
  | { readonly kind: "failed"; readonly message: string };

const PHASES: Readonly<Record<Phase, true>> = {
  draft: true,
  review: true,
  testing: true,
  implementing: true,
  adjusting: true,
  acceptance: true,
  closing: true,
  done: true,
  cancelled: true,
};
const WAITING_FOR: Readonly<Record<WaitingFor, true>> = { agent: true, human: true, nobody: true };

/** The link `specty ui` prints: it carries the session's token. */
const LINK = /http:\/\/(?:localhost|127\.0\.0\.1):\d+\/\?token=[\w-]+/;
const UI_TIMEOUT_MS = 20_000;
const STATUS_TIMEOUT_MS = 30_000;

/** Runs `specty --json status` in `folder`. */
export function readStatus(command: string, folder: string): Promise<StatusRead> {
  return new Promise((resolve) => {
    execFile(
      command,
      ["--json", "status"],
      { cwd: folder, timeout: STATUS_TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => resolve(readOf(error, stdout, stderr)),
    );
  });
}

function readOf(error: ExecFileException | null, stdout: string, stderr: string): StatusRead {
  if (error !== null && isMissing(error)) return { kind: "missing" };
  const output = parsed(stdout);
  if (error === null && output !== undefined) return statusIn(output);
  // A refusal is a card, whose lines and next step say why.
  const reason = output === undefined ? undefined : reasonOf(output);
  return { kind: "failed", message: reason ?? (stderr.trim() || stdout.trim() || String(error)) };
}

/**
 * The status in what `specty --json status` printed. A card without `changes` comes from a
 * `specty` from before the status came as data; an entry it cannot read is left out.
 */
function statusIn(output: unknown): StatusRead {
  if (!isRecord(output)) return { kind: "failed", message: String(output) };
  if (!Array.isArray(output.changes)) return { kind: "outdated" };
  const changes = output.changes
    .map(changeOf)
    .filter((change): change is OpenChange => change !== undefined);
  return { kind: "status", status: { changes, delegated: output.delegated === true } };
}

function changeOf(value: unknown): OpenChange | undefined {
  if (!isRecord(value)) return undefined;
  const { id, phase, title, waitingFor, current, folder } = value;
  if (typeof id !== "string" || typeof title !== "string" || typeof current !== "boolean") {
    return undefined;
  }
  if (!isPhase(phase) || !isWaitingFor(waitingFor)) return undefined;
  return {
    id,
    phase,
    title,
    waitingFor,
    current,
    ...(typeof folder === "string" ? { folder } : {}),
  };
}

/** The lines and the next step of a card, in one line. */
function reasonOf(card: unknown): string | undefined {
  if (!isRecord(card) || typeof card.next !== "string") return undefined;
  const blocks = Array.isArray(card.blocks) ? card.blocks : [];
  const lines = blocks.flatMap((block) =>
    isRecord(block) && Array.isArray(block.lines)
      ? block.lines.filter((line): line is string => typeof line === "string")
      : [],
  );
  return [...lines, card.next]
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Starts `specty ui` in `folder` and waits for its link, `timeoutMs` at most. Without a terminal
 * the server only reads: the person decides from a `specty ui` started in theirs.
 */
export function startUi(
  command: string,
  folder: string,
  timeoutMs: number = UI_TIMEOUT_MS,
): Promise<UiStart> {
  const child = spawn(command, ["ui"], {
    cwd: folder,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const exited = new Promise<void>((done) => child.once("close", () => done()));
  const stop = () => {
    child.kill();
  };
  let output = "";
  return new Promise((resolve) => {
    const finish = (start: UiStart) => {
      clearTimeout(timer);
      resolve(start);
    };
    const timer = setTimeout(() => {
      stop();
      finish({ kind: "failed", message: output.trim() });
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const link = LINK.exec(output)?.[0];
      if (link !== undefined) finish({ kind: "started", server: { link, exited, stop } });
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", (error) =>
      finish(isMissing(error) ? { kind: "missing" } : { kind: "failed", message: error.message }),
    );
    child.once("exit", () => finish({ kind: "failed", message: output.trim() }));
  });
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isMissing(error: Error): boolean {
  return "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && Object.hasOwn(PHASES, value);
}

function isWaitingFor(value: unknown): value is WaitingFor {
  return typeof value === "string" && Object.hasOwn(WAITING_FOR, value);
}
