// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";
import { type Before, phaseOf, type Script, type Walk, walk } from "./walk";

/** T2 of SPEC passes its verification only once `src/app.ts` says «bien». */
const VERIFY_T2 = `node -e "process.exit(require('fs').readFileSync('src/app.ts','utf8').includes('bien')?0:1)"`;
const STANDARD = SPEC.replace(
  "  - type: refactor\n",
  `  - type: refactor\n  - verify: ${VERIFY_T2}\n`,
);
/** Without acceptance criteria: `propose` rejects it. */
const INVALID = STANDARD.replace(/## Criterios de aceptación\n\n.*\n\n/, "");
const CLOSING = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";

const QUICK = `---\nkind: quick\n---\n\n# Corregir el botón\n\n## Objetivo\n\nEl botón dice «Sing in».\n\n## Archivos\n\n- modificar src/button.ts — texto\n\n## Tareas\n\n- [ ] T1: Corregir el texto\n  - files: src/button.ts\n  - type: fix\n`;

/** Placeholders such as `"<qué hiciste>"` filled in, as an agent would. */
const filled = (argv: readonly string[]): string[] =>
  argv.map((word) => (/^<.*>$/.test(word) ? "Hecho" : word));

/** The draft's path, from the card that asks to complete it. */
const draftPath = (output: string): string => /Spec en borrador: (\S+)/.exec(output)?.[1] ?? "";

/**
 * SPEC's change. With `trips`, the agent stumbles where agents do: it writes code before any
 * spec, proposes a spec without criteria, touches a file outside T1, commits T1 itself and
 * leaves T2 failing its verification once.
 */
function standard(root: string, trips: boolean): Script {
  let proposals = 0;
  let t1 = 0;
  let t2 = 0;
  return {
    ...(trips
      ? { first: { tool: "Write", input: { file_path: `${root}/src/app.ts`, content: "x" } } }
      : {}),
    async before(argv, output): Promise<Before> {
      const [verb, , task] = argv;
      if (verb === "new") {
        return { argv: ["new", "Saludo personalizado", "--request", "Que salude por nombre."] };
      }
      if (verb === "propose" && phaseOf(output) === "draft") {
        proposals += 1;
        await writeFiles(root, { [SPEC_PATH]: trips && proposals === 1 ? INVALID : STANDARD });
      }
      if (verb === "propose" && phaseOf(output) === "closing") {
        await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${CLOSING}` });
      }
      if (verb === "scope") {
        return { argv: ["scope", "add", "src/extra.ts", "--task", "T1", "--reason", "Lo usa"] };
      }
      if (verb === "task" && task === "T1") {
        t1 += 1;
        await writeFiles(root, {
          "src/app.ts": "export const greet = (name) => 'Hola, ' + name;\n",
          "src/app.test.ts": "expect(greet('Ana')).toBe('Hola, Ana');\n",
          ...(trips && t1 === 1 ? { "src/extra.ts": "export const extra = 1;\n" } : {}),
        });
        if (trips && t1 === 1) {
          const commit = { command: "git add -A && git commit -m 'Saludo'" };
          return { argv: filled(argv), tool: { tool: "Bash", input: commit } };
        }
      }
      if (verb === "task" && task === "T2") {
        t2 += 1;
        const word = trips && t2 === 1 ? "mal" : "bien";
        await writeFiles(root, { "src/app.ts": `export const greet = () => '${word}';\n` });
      }
      return { argv: filled(argv) };
    },
  };
}

function quick(root: string): Script {
  return {
    async before(argv, output) {
      const [verb] = argv;
      if (verb === "new") {
        return { argv: ["new", "--kind", "quick", "Corregir el botón", "--request", "Sign in"] };
      }
      if (verb === "propose") await writeFiles(root, { [draftPath(output)]: QUICK });
      if (verb === "task") await writeFiles(root, { "src/button.ts": "Sign in\n" });
      return { argv: filled(argv) };
    },
  };
}

/** The walk's steps, one per line, to read when an expectation fails. */
const transcript = (result: Walk): string =>
  result.steps.map((step) => `${step.who} ${step.what} → ${step.code}`).join("\n");

const APP = {
  "src/app.ts": "export const greet = () => 'hola';\n",
  "src/button.ts": "Sing in\n",
  ".specty/config.yaml": CONFIG(),
};

/**
 * The friction baseline (ARCHITECTURE §16). A change to the flow that adds or saves commands
 * shows up here: update the numbers on purpose, and the baseline with them.
 */
describe("following every SIGUIENTE", () => {
  it("takes a quick change to the end", async () => {
    const root = await tempRepo(APP);
    const result = await walk(root, quick(root));
    expect(result.done, transcript(result)).toBe(true);
    expect(result.friction).toEqual({
      agent: 5,
      person: 2,
      blockedTools: 0,
      blocks: 0,
      toApproval: { agent: 3, person: 1 },
    });
  });

  it("takes a standard change to the end", async () => {
    const root = await tempRepo(APP);
    const result = await walk(root, standard(root, false));
    expect(result.done, transcript(result)).toBe(true);
    expect(result.friction).toEqual({
      agent: 8,
      person: 3,
      blockedTools: 0,
      blocks: 0,
      toApproval: { agent: 3, person: 1 },
    });
  });

  it("resolves every block a stumbling agent meets", async () => {
    const root = await tempRepo(APP);
    const result = await walk(root, standard(root, true));
    expect(result.done, transcript(result)).toBe(true);
    expect(result.steps.filter((step) => step.code !== 0).map((step) => step.what)).toEqual([
      "Write",
      "propose",
      "Bash",
      "task done T1 --summary Hecho",
      "task done T2 --summary Hecho",
    ]);
    expect(result.verdicts, transcript(result)).toEqual(Array(5).fill("resolved"));
    expect(result.friction).toEqual({
      agent: 15,
      person: 4,
      blockedTools: 2,
      blocks: 5,
      toApproval: { agent: 5, person: 1 },
    });
  });

  it("takes a standard change to the end in delegated mode", async () => {
    const root = await tempRepo(APP);
    const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect(on.code).toBe(0);
    const result = await walk(root, standard(root, false), true);
    expect(result.done, transcript(result)).toBe(true);
    // Each decision the agent takes brings the next card: no `next` after approve and accept.
    expect(result.friction).toEqual({
      agent: 9,
      person: 0,
      blockedTools: 0,
      blocks: 0,
      toApproval: { agent: 4, person: 0 },
    });
  });
});

describe("the walk's verdicts", () => {
  it("call a block that never clears a dead end", async () => {
    const root = await tempRepo(APP);
    // An agent that ignores every SIGUIENTE and repeats a refused command never gets out.
    const stuck: Script = {
      before: async () => ({ argv: ["task", "done", "T9", "--summary", "x"] }),
    };
    const result = await walk(root, stuck);
    expect(result.done).toBe(false);
    expect(result.verdicts.at(-1)).toBe("dead-end");
  });
});
