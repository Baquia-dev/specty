// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { SettingValue } from "../settings/pieces";
import { translator } from "./text";

// What the view Flujo of the page «Configuración» says of each piece (`settings/pieces.ts`): its
// name, what it does and, of a guarantee, why it is not removed; and what the configured flow does,
// in sentences, under the line in the basic mode.

/** A piece's name, what it does and, of a guarantee, why it is not removed. */
interface PieceText {
  readonly name: string;
  readonly description: string;
  readonly why?: string;
}

/** A piece's name, description and, of a guarantee, why, in each language. */
type Texts = Readonly<Record<Lang, readonly [string, string, string?]>>;

const TEXTS: Readonly<Record<string, Texts>> = {
  glossary: {
    es: [
      "Glosario del dominio",
      "Los términos del proyecto, que la tarjeta del borrador recuerda al agente.",
    ],
    en: ["Domain glossary", "The project's terms, which the draft card reminds the agent of."],
  },
  "spec-warnings": {
    es: [
      "Avisos de la spec",
      "Los términos vagos y las capas horizontales que Specty señala en la spec, además de los suyos.",
    ],
    en: [
      "Spec warnings",
      "The vague terms and horizontal layers Specty points out in the spec, besides its own.",
    ],
  },
  worktrees: {
    es: [
      "Una carpeta por cambio",
      "Cada cambio nace en su propia worktree, preparada con su comando.",
    ],
    en: ["A folder per change", "Each change starts in its own worktree, set up with its command."],
  },
  "spec-approval": {
    es: [
      "Tu aprobación de la spec",
      "El código espera a que se apruebe la spec: la apruebas tú o, en modo delegado, tu agente por ti.",
      "No se quita: sin una spec aprobada, Specty no deja escribir código.",
    ],
    en: [
      "Your approval of the spec",
      "The code waits for the spec to be approved: by you or, in delegated mode, by your agent for you.",
      "It cannot be removed: without an approved spec, Specty lets no code be written.",
    ],
  },
  "independent-review": {
    es: [
      "Revisión independiente",
      "Otro modelo revisa la spec y el diff con el comando que configures.",
    ],
    en: [
      "Independent review",
      "Another model reviews the spec and the diff with the command you set up.",
    ],
  },
  delegated: {
    es: [
      "Modo delegado",
      "Tu agente aprueba, acepta y cierra por ti en este clon; solo lo enciendes tú.",
    ],
    en: [
      "Delegated mode",
      "Your agent approves, accepts and closes for you in this clone; only you turn it on.",
    ],
  },
  "tests-approval": {
    es: [
      "Tu aprobación del contrato de tests",
      "Con los tests como contrato, el código de una feature espera a que se aprueben sus tests.",
      "No se quita: los tests que apruebas son el contrato que el código debe cumplir.",
    ],
    en: [
      "Your approval of the tests contract",
      "With tests as the contract, a feature's code waits for its tests to be approved.",
      "It cannot be removed: the tests you approve are the contract the code must meet.",
    ],
  },
  tests: {
    es: [
      "Política de tests",
      "Cuándo pide Specty tests: como contrato antes del código, en cada tarea, como aviso o nunca.",
    ],
    en: [
      "Tests policy",
      "When Specty asks for tests: as a contract before the code, in each task, as a warning or never.",
    ],
  },
  "task-verify": {
    es: ["Verificación de la tarea", "La ejecuta task done; una tarea no se completa con fallos."],
    en: ["Task verification", "task done runs it; a task is not done with failures."],
  },
  "quick-check": {
    es: ["Comprobación rápida", "Un comando barato antes de la verificación de cada tarea."],
    en: ["Quick check", "A cheap command before each task's verification."],
  },
  checks: {
    es: [
      "specty check de lo cambiado",
      "Las verificaciones de calidad sobre lo que cambia cada tarea.",
    ],
    en: ["specty check of what changes", "The quality checks over what each task changes."],
  },
  lines: {
    es: [
      "Límite de líneas por archivo",
      "Avisa si una tarea deja un archivo por encima del aviso y la bloquea por encima del máximo.",
    ],
    en: [
      "Lines per file limit",
      "Warns when a task leaves a file above the warning and blocks it above the maximum.",
    ],
  },
  subagents: {
    es: [
      "Subagentes",
      "Los cortes de una épica y tus cambios van a subagentes, si la herramienta puede.",
    ],
    en: ["Subagents", "An epic's slices and your changes go to subagents, when the tool can."],
  },
  "auto-approve": {
    es: [
      "Ampliación automática",
      "Los tests y los archivos generados entran en el alcance sin pedírtelo.",
    ],
    en: ["Automatic scope", "Tests and generated files come into the scope without asking you."],
  },
  "pre-commit": {
    es: [
      "specty check en el pre-commit",
      "El pre-commit verifica también los commits que haces a mano.",
    ],
    en: [
      "specty check on pre-commit",
      "The pre-commit hook also checks the commits you make by hand.",
    ],
  },
  guard: {
    es: [
      "Guard del agente",
      "Bloquea al agente fuera del alcance de la tarea y en .specty/.",
      "No se quita: sin él, el agente podría saltarse la spec.",
    ],
    en: [
      "Agent guard",
      "It blocks the agent outside the task's scope and in .specty/.",
      "It cannot be removed: without it, the agent could skip the spec.",
    ],
  },
  "full-verify": {
    es: ["Verificación completa", "Al aceptar y al incorporar main, por unidades si las hay."],
    en: ["Full verification", "On accepting and on merging main, by units if there are any."],
  },
  coverage: {
    es: [
      "Cobertura del diff",
      "Avisa si lo que añade el cambio queda cubierto por debajo de un porcentaje.",
    ],
    en: ["Diff coverage", "Warns when what the change adds is covered below a percentage."],
  },
  acceptance: {
    es: [
      "Tu aceptación",
      "Un cambio termina cuando lo aceptas tú o, en modo delegado, tu agente por ti.",
      "No se quita: un cambio no termina sin tu aceptación.",
    ],
    en: [
      "Your acceptance",
      "A change ends when you accept it or, in delegated mode, your agent for you.",
      "It cannot be removed: a change does not end without your acceptance.",
    ],
  },
  closing: {
    es: [
      "Fase de cierre",
      "El agente escribe la retro antes de que el cambio aterrice; pronto se podrá quitar.",
    ],
    en: [
      "Closing phase",
      "The agent writes the retro before the change lands; soon it can be removed.",
    ],
  },
  retro: {
    es: ["Retro del agente", "El agente escribe la retro al cerrar; sin ella, queda en una línea."],
    en: [
      "Retro by the agent",
      "The agent writes the retro on closing; without it, it stays one line.",
    ],
  },
  "after-landing": {
    es: [
      "Al incorporar un cambio",
      "Un comando en la carpeta de la rama destino tras cada cambio, como un build.",
    ],
    en: [
      "When a change lands",
      "A command in the target branch's folder after each change, such as a build.",
    ],
  },
};

/** The name, the description and, of a guarantee, why, of the piece `id`; of one it lacks, its id. */
export function pieceText(id: string, lang: Lang): PieceText {
  const [name, description, why] = TEXTS[id]?.[lang] ?? [id, ""];
  return why === undefined ? { name, description } : { name, description, why };
}

/** A sentence in Spanish and in English. */
type Sentence = readonly [string, string];

/** What each tests policy asks. */
const TESTS: Readonly<Record<string, Sentence>> = {
  contract: [
    "Las features piden sus tests aprobados antes del código.",
    "Features need their tests approved before their code.",
  ],
  required: ["Cada tarea de código lleva sus tests.", "Each code task comes with its tests."],
  recommended: [
    "Specty avisa de una tarea de código sin tests, pero no los exige.",
    "Specty warns of a code task without tests, but does not require them.",
  ],
  off: ["Specty no pide tests.", "Specty does not ask for tests."],
};

const NO_TASK: Sentence = [
  "Cada tarea lleva su verificación en la spec.",
  "Each task brings its verification in the spec.",
];
const NO_FULL: Sentence = [
  "Al aceptar no hay verificación completa.",
  "There is no full verification on accepting.",
];
const NO_REVIEW: Sentence = [
  "Sin revisión independiente: la spec y el diff los revisas tú.",
  "No independent review: you review the spec and the diff.",
];
const DELEGATED: Readonly<Record<"on" | "off", Sentence>> = {
  on: [
    "Modo delegado activo: tu agente aprueba, acepta y cierra por ti.",
    "Delegated mode on: your agent approves, accepts and closes for you.",
  ],
  off: [
    "Tú apruebas, aceptas y cierras cada cambio.",
    "You approve, accept and close each change.",
  ],
};

const filled = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/**
 * What the configured flow does, in sentences: its tests, each task's verification, the full one,
 * the independent review, the files of a quick change and delegated mode, unsaid when the source
 * cannot tell. Commands go between backticks.
 */
export function flowSentences(value: SettingValue, lang: Lang): readonly string[] {
  const task = value("verify.default");
  const review = value("review.command");
  const files = String(value("lanes.quick.maxFiles"));
  const delegated = value("specty delegate");
  const sentences: readonly (Sentence | undefined)[] = [
    TESTS[String(value("policy.tests"))] ?? TESTS.recommended,
    filled(task)
      ? [
          `Cada tarea pasa \`${task}\` antes de completarse.`,
          `Each task passes \`${task}\` before it is done.`,
        ]
      : NO_TASK,
    fullSentence(value),
    filled(review)
      ? [
          `La revisión independiente ejecuta \`${review}\`; cuesta tokens en cada revisión.`,
          `The independent review runs \`${review}\`; each review costs tokens.`,
        ]
      : NO_REVIEW,
    [
      `Un cambio rápido toca como mucho ${files} archivos de código.`,
      `A quick change touches at most ${files} code files.`,
    ],
    typeof delegated === "boolean" ? DELEGATED[delegated ? "on" : "off"] : undefined,
  ];
  const t = translator(lang);
  return sentences.flatMap((sentence) => (sentence === undefined ? [] : [t(...sentence)]));
}

/** The full verification on accepting: by its units, its command, or none. */
function fullSentence(value: SettingValue): Sentence {
  const units = value("verify.units");
  const full = value("verify.full");
  if (Array.isArray(units) && units.length > 0) {
    const [es, en] = units.length === 1 ? ["unidad", "unit"] : ["unidades", "units"];
    return [
      `Al aceptar, Specty ejecuta la verificación completa en ${units.length} ${es}.`,
      `On accepting, Specty runs the full verification in ${units.length} ${en}.`,
    ];
  }
  return filled(full)
    ? [`Al aceptar, Specty ejecuta \`${full}\`.`, `On accepting, Specty runs \`${full}\`.`]
    : NO_FULL;
}
