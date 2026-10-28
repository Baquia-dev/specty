// SPDX-License-Identifier: Apache-2.0
// How the history tells the events of the testing phase (ADR 0014, formats.md §4): the agent
// sends the tests, the person approves them (the gate 2), or a bug's red locks them by itself.
import {
  both,
  CHANNELS,
  count,
  type Data,
  isData,
  plain,
  type Told,
  text,
  texts,
  when,
} from "./history-text";

/** «2 tests» / «2 tests»; «los tests» when the event does not say how many. */
const testsOf = (data: Data) => {
  const n = count(data, "count");
  if (n === undefined) return both("los tests", "the tests");
  return both(`${n} test${n === 1 ? "" : "s"}`, `${n} test${n === 1 ? "" : "s"}`);
};

/** «En rojo: pnpm test, pnpm e2e»: the commands that failed, as the tests must before the code. */
const redOf = (data: Data) => {
  const red = Array.isArray(data.red) ? data.red.filter(isData) : [];
  const commands = red.flatMap((entry) => text(entry, "cmd") ?? []).join(", ");
  return when(commands || undefined, (cmds) => both(`En rojo: ${cmds}`, `Red: ${cmds}`));
};

export const TESTS_TELL: Readonly<Record<string, (data: Data) => Told>> = {
  "tests.proposed": (data) => {
    const tests = testsOf(data);
    return {
      type: "verifications",
      title: both(`Envió ${tests.es} para aprobar`, `Sent ${tests.en} for approval`),
      details: [plain(texts(data, "files").join(", ") || undefined), redOf(data)],
    };
  },
  "tests.approved": (data) => ({
    type: "spec",
    title: both("Aprobó los tests", "Approved the tests"),
    details: [CHANNELS[text(data, "channel") ?? ""]],
  }),
  "tests.locked": (data) => {
    const tests = testsOf(data);
    return {
      type: "verifications",
      title: both(`Bloqueó ${tests.es} en rojo`, `Locked ${tests.en} in red`),
    };
  },
};
