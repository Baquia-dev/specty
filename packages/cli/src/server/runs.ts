// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { blockedCard, headerOf, type Output, section, translator } from "@baquia-dev/specty-core";
import { locateChanges } from "../flow/changes";
import { recordFullVerification } from "../flow/verified";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";

/** A full verification going on: its command, when it started and its output so far. */
export interface Run {
  readonly command: string;
  readonly startedAt: string;
  /** Its last lines, oldest first. */
  readonly output: readonly string[];
}

export interface Runs {
  /** The full verification of change `id` going on now, if any. */
  current(id: string): Run | undefined;
  /** Starts the full verification of change `id` in its folder; the answer says whether it did. */
  start(id: string): Promise<Output>;
  /** Ends the runs still going, without recording them: the server is closing. */
  close(): void;
}

/** What a run keeps of its output: its end is what matters. */
const KEPT = 1000;
/** At most this often, in milliseconds, the listener hears a run that moves. */
const EVERY = 250;

/**
 * The full verifications the person starts from the UI, one per change: `verify.full` runs with
 * the shell in the change's folder, `heard` gets the run as it goes and `undefined` once it ends,
 * and the result goes to the change's audit as `change.verified`.
 */
export function changeRuns(
  session: Session,
  heard: (id: string, run: Run | undefined) => void,
): Runs {
  const going = new Map<string, { run: Run; stop: () => void }>();
  let closing = false;

  function run(id: string, there: Session, change: StoredChange, command: string): void {
    const started = Date.now();
    const child = spawn(command, {
      cwd: there.root,
      env: there.environment.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let current: Run = { command, startedAt: there.environment.now().toISOString(), output: [] };
    const stop = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    };
    going.set(id, { run: current, stop });
    let tell: NodeJS.Timeout | undefined;
    const add = (lines: readonly string[]) => {
      if (lines.length === 0) return;
      current = { ...current, output: [...current.output, ...lines].slice(-KEPT) };
      going.set(id, { run: current, stop });
      tell ??= setTimeout(() => {
        tell = undefined;
        heard(id, current);
      }, EVERY);
    };
    const rests = { stdout: "", stderr: "" };
    for (const stream of ["stdout", "stderr"] as const) {
      child[stream].on("data", (chunk: Buffer) => {
        const lines = `${rests[stream]}${chunk.toString("utf8")}`.split("\n");
        rests[stream] = lines.pop() ?? "";
        add(lines.map((line) => line.trimEnd()));
      });
    }
    const limit = setTimeout(stop, there.config.verify.timeoutSec * 1000);
    let finished = false;
    const finish = async (code: number | undefined) => {
      if (finished) return;
      finished = true;
      add([rests.stdout, rests.stderr].filter((line) => line.trim() !== ""));
      clearTimeout(limit);
      clearTimeout(tell);
      going.delete(id);
      if (closing) return;
      const output = current.output.filter((line) => line.length > 0);
      await recordFullVerification(there, change, {
        command,
        code,
        ms: Date.now() - started,
        output,
      }).catch(() => undefined);
      heard(id, undefined);
    };
    child.on("error", () => void finish(127));
    child.on("close", (code) => void finish(code ?? undefined));
    heard(id, current);
  }

  return {
    current: (id) => going.get(id)?.run,
    async start(id) {
      const t = translator(session.lang);
      const found = (await locateChanges(session)).find(({ change }) => change.state.id === id);
      const reload = t("vuelve a cargar la UI.", "reload the UI.");
      if (found === undefined)
        return blockedCard(
          headerOf(),
          t(`No hay ningún cambio ${id}.`, `There is no change ${id}.`),
          reload,
        );
      const { change, session: there } = found;
      const header = headerOf(id, change.state.phase);
      const command = there.config.verify.full;
      if (change.state.phase !== "acceptance")
        return blockedCard(
          header,
          t(
            "La verificación completa se ejecuta con el cambio en aceptación.",
            "The full verification runs with the change in acceptance.",
          ),
          reload,
        );
      if (command === undefined)
        return blockedCard(
          header,
          t(
            "Este proyecto no tiene verificación completa (`verify.full`).",
            "This project has no full verification (`verify.full`).",
          ),
          t("añádela en .specty/config.yaml.", "add it in .specty/config.yaml."),
        );
      if (going.has(id))
        return blockedCard(
          header,
          t(
            "Ya corre la verificación completa de este cambio.",
            "The full verification of this change is already running.",
          ),
          t("espera a que termine.", "wait for it to finish."),
        );
      run(id, there, change, command);
      return {
        status: "ok",
        header,
        blocks: section(undefined, [
          t(
            `Verificación completa en marcha: \`${command}\`.`,
            `Full verification running: \`${command}\`.`,
          ),
        ]),
        next: t("sigue su salida en la UI.", "follow its output in the UI."),
      };
    },
    close() {
      closing = true;
      for (const { stop } of going.values()) stop();
    },
  };
}
