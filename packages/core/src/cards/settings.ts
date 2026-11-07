// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { SettingSection } from "../settings/catalog";
import { SIZE_TEXTS } from "./settings-size";

// What the page «Configuración» of `specty ui` says of each setting of the catalog
// (`settings/catalog.ts`): its name and what it does, its section's name and its options' names.

/** A setting's name and what it does. */
interface SettingText {
  readonly name: string;
  readonly description: string;
}

/** A setting's name and description in each language: `[name, description]`. */
type Texts = Readonly<Record<Lang, readonly [string, string]>>;

const SECTIONS: Readonly<Record<SettingSection, Readonly<Record<Lang, string>>>> = {
  flow: { es: "Flujo", en: "Flow" },
  verify: { es: "Verificación", en: "Verification" },
  git: { es: "Git", en: "Git" },
  review: { es: "Revisión independiente", en: "Independent review" },
  scope: { es: "Alcance", en: "Scope" },
  size: { es: "Tamaño y cortes", en: "Size and splitting" },
  lines: { es: "Líneas de código", en: "Lines of code" },
  checks: { es: "Verificaciones de calidad", en: "Quality checks" },
  team: { es: "Equipo", en: "Team" },
  memory: { es: "Memoria", en: "Memory" },
  dev: { es: "Desarrollo", en: "Development" },
  ui: { es: "Interfaz", en: "Interface" },
  effort: { es: "Esfuerzo recomendado", en: "Recommended effort" },
  glossary: { es: "Glosario", en: "Glossary" },
};

/** The names of the options of each choice, by its key and the option. */
const OPTIONS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<Lang, string>>>>>> =
  {
    language: { es: { es: "Español", en: "Español" }, en: { es: "English", en: "English" } },
    mode: {
      individual: { es: "Individual", en: "Individual" },
      team: { es: "Equipo", en: "Team" },
    },
    "policy.tests": {
      contract: { es: "Contrato", en: "Contract" },
      required: { es: "Obligatorios", en: "Required" },
      recommended: { es: "Recomendados", en: "Recommended" },
      off: { es: "No", en: "Off" },
    },
    "retro.mode": {
      agent: { es: "Del agente", en: "By the agent" },
      minimal: { es: "Mínima", en: "Minimal" },
    },
    "git.flow": {
      specty: { es: "Specty", en: "Specty" },
      github: { es: "GitHub", en: "GitHub" },
      trunk: { es: "Trunk", en: "Trunk" },
      gitflow: { es: "Git flow", en: "Git flow" },
    },
    "scope.autoApprove": {
      none: { es: "Ninguna", en: "None" },
      "tests-and-generated": { es: "Tests y generados", en: "Tests and generated" },
    },
  };

const TEXTS: Readonly<Record<string, Texts>> = {
  language: {
    es: ["Idioma", "El idioma en que Specty os habla al agente y a ti."],
    en: ["Language", "The language Specty speaks to the agent and to you."],
  },
  mode: {
    es: [
      "Forma de trabajo",
      "Individual: Specty incorpora cada cambio que termina; en equipo, no.",
    ],
    en: [
      "Way of working",
      "Individual: Specty merges each finished change; in a team, it does not.",
    ],
  },
  "policy.tests": {
    es: ["Tests", "Contrato: los tests de una feature se aprueban antes que su código."],
    en: ["Tests", "Contract: a feature's tests are approved before its code."],
  },
  subagents: {
    es: ["Subagentes", "Los cortes de una épica y tus cambios van a subagentes, si se puede."],
    en: ["Subagents", "An epic's slices and your changes go to subagents, when the tool can."],
  },
  "retro.mode": {
    es: ["Retro al cerrar", "La escribe el agente, o queda en una línea."],
    en: ["Retro on closing", "The agent writes it, or it stays one line."],
  },
  "specty delegate": {
    es: ["Modo delegado", "El agente aprueba, acepta y cierra por ti; solo lo enciendes tú."],
    en: ["Delegated mode", "The agent approves, accepts and closes for you; only you turn it on."],
  },
  "verify.default": {
    es: ["Verificación de cada tarea", "La de las tareas sin verificación propia."],
    en: ["Each task's verification", "The one of the tasks without their own."],
  },
  "verify.full": {
    es: ["Verificación completa", "Al aceptar y al incorporar main."],
    en: ["Full verification", "On accepting and on merging main."],
  },
  "verify.quick": {
    es: ["Comprobación rápida", "Antes de la verificación de cada tarea, sobre todo el repo."],
    en: ["Quick check", "Before each task's verification, over the whole repository."],
  },
  "verify.timeoutSec": {
    es: ["Tiempo máximo por comando", "Al vencer, se corta el comando con todos sus procesos."],
    en: ["Time limit per command", "When it runs out, the command stops with its processes."],
  },
  "verify.slots": {
    es: ["Verificaciones a la vez", "La de una tarea ocupa una; la completa, todas."],
    en: ["Verifications at once", "A task's takes one; the full one, all of them."],
  },
  "verify.units": {
    es: ["Unidades", "La completa por partes; cada una se repite si cambian sus rutas."],
    en: ["Units", "The full one in parts; each runs again when its paths change."],
  },
  "git.branchPerChange": {
    es: ["Una rama por cambio", "Cada cambio trabaja en su propia rama."],
    en: ["A branch per change", "Each change works on its own branch."],
  },
  "git.worktrees": {
    es: ["Una carpeta por cambio", "Cada cambio vive en su worktree, en .worktrees/<id>."],
    en: ["A folder per change", "Each change lives in its worktree, in .worktrees/<id>."],
  },
  "git.flow": {
    es: ["Nombres de rama", "Cómo se llaman las ramas; sin valor, specty/<id>."],
    en: ["Branch names", "How the branches are named; unset, specty/<id>."],
  },
  "git.branchPattern": {
    es: ["Patrón de rama propio", "Un nombre con {type}, {slug} e {id}; gana a git.flow."],
    en: ["Own branch pattern", "A name with {type}, {slug} and {id}; it wins over git.flow."],
  },
  "git.target": {
    es: ["Rama destino", "De la que parten los cambios y a la que vuelven."],
    en: ["Target branch", "The branch changes start from and go back to."],
  },
  "git.setup": {
    es: ["Preparar cada carpeta", "Sin valor, la instalación del stack; false, nada."],
    en: ["Set up each folder", "Unset, the stack's install command; false, nothing."],
  },
  "git.afterLanding": {
    es: [
      "Al incorporar un cambio",
      "Se ejecuta en la carpeta de la rama destino tras cada cambio.",
    ],
    en: ["When a change lands", "Runs in the target branch's folder after each change."],
  },
  "review.command": {
    es: ["Comando de revisión", "Revisa la spec y el diff con otro modelo; sin él, no se revisa."],
    en: ["Review command", "Reviews the spec and the diff with another model; without it, none."],
  },
  "review.timeoutSec": {
    es: ["Tiempo máximo de la revisión", "Sin valor, el de la verificación."],
    en: ["Review time limit", "Unset, the verification's."],
  },
  governed: {
    es: ["Rutas gobernadas", "Donde rige el flujo: código que necesita una spec aprobada."],
    en: ["Governed paths", "Where the flow rules: code that needs an approved spec."],
  },
  ignored: {
    es: ["Rutas libres", "Documentación y archivos que no son código."],
    en: ["Free paths", "Documentation and files that are not code."],
  },
  sensitive: {
    es: ["Rutas sensibles", "Nunca se aprueban solas y pesan en el tamaño."],
    en: ["Sensitive paths", "Never approved on their own; they weigh in the size."],
  },
  "scope.implicitTests": {
    es: ["Tests implícitos", "Los tests de los archivos del alcance entran en él."],
    en: ["Implicit tests", "The tests of the scope's files are in it."],
  },
  "scope.generated": {
    es: ["Archivos generados", "Los escribe una herramienta: no pesan en el tamaño."],
    en: ["Generated files", "A tool writes them: they do not weigh in the size."],
  },
  "scope.autoApprove": {
    es: ["Ampliaciones que se aprueban solas", "Entran sin pedírtelo."],
    en: ["Scope added on its own", "They come in without asking you."],
  },
  ...SIZE_TEXTS,
  "lines.warn": {
    es: ["Aviso de líneas", "Avisa si una tarea deja un archivo por encima."],
    en: ["Lines warning", "Warns when a task leaves a file above it."],
  },
  "lines.fail": {
    es: ["Bloqueo de líneas", "Bloquea la tarea que lleva un archivo por encima; false, nunca."],
    en: ["Lines block", "Blocks the task that takes a file above it; false, never."],
  },
  "lines.tests": {
    es: ["Líneas de los tests", "El aviso y el bloqueo de los archivos de test."],
    en: ["Lines of tests", "The warning and the block for test files."],
  },
  "lines.exclude": {
    es: ["Rutas que no se miden", "Además de las de datos, como fixtures o locales."],
    en: ["Paths not measured", "Besides the data folders, such as fixtures or locales."],
  },
  "checks.levels": {
    es: ["Nivel de cada verificación", "Error bloquea, warn avisa y off la apaga."],
    en: ["Level of each check", "Error blocks, warn warns and off turns it off."],
  },
  "checks.maxFindings": {
    es: ["Fallos que se muestran", "Por verificación, antes de «… y N más»."],
    en: ["Findings shown", "Per check, before “… and N more”."],
  },
  "checks.exclude": {
    es: ["Rutas que no se verifican", "Además de las de dependencias y compilados."],
    en: ["Paths not checked", "Besides the dependency and build folders."],
  },
  "checks.todo": {
    es: ["Trabajo pendiente", "Las marcas de la verificación todo y su referencia a un issue."],
    en: ["Pending work", "The todo check's markers and their reference to an issue."],
  },
  "checks.functions": {
    es: ["Límites de cada función", "Líneas de código y complejidad ciclomática."],
    en: ["Limits of each function", "Lines of code and cyclomatic complexity."],
  },
  "checks.layers": {
    es: ["Capas", "Las capas del proyecto, sus rutas y lo que importa cada una."],
    en: ["Layers", "The project's layers, their paths and what each one imports."],
  },
  "checks.generators": {
    es: ["Generadores de código", "Lo que escriben tiene que coincidir con lo que generan."],
    en: ["Code generators", "What they write must match what they generate."],
  },
  "checks.preCommit": {
    es: ["Verificar al hacer commit", "El pre-commit verifica también los cambios manuales."],
    en: ["Check on commit", "The pre-commit hook also checks manual changes."],
  },
  "checks.commands": {
    es: ["Comandos del proyecto", "Formato, lint, tipos y tests, sobre los detectados."],
    en: ["Project commands", "Format, lint, types and tests, over the detected ones."],
  },
  "checks.coverage": {
    es: ["Cobertura de lo añadido", "Dónde está el informe; avisa y falla por debajo de un %."],
    en: ["Coverage of what is added", "Where the report is; warns and fails below a %."],
  },
  "checks.testTime": {
    es: ["Tiempo de cada test", "Los informes JUnit y los ms a partir de los que avisa."],
    en: ["Time of each test", "The JUnit reports and the ms above which it warns."],
  },
  "team.approvers": {
    es: ["Aprobadores", "Quién aprueba las specs en un equipo."],
    en: ["Approvers", "Who approves the specs in a team."],
  },
  "team.requirePrReview": {
    es: ["Revisión del PR", "El PR de cada cambio necesita una revisión."],
    en: ["PR review", "Each change's PR needs a review."],
  },
  "memory.orphanAfterMin": {
    es: ["Cambio huérfano", "Sin pasos durante este tiempo, el cambio queda huérfano."],
    en: ["Orphaned change", "With no steps for this long, the change is orphaned."],
  },
  "memory.branch": {
    es: ["Rama de la memoria", "Donde viven las entradas de la memoria de Specty."],
    en: ["Memory branch", "Where the entries of Specty's memory live."],
  },
  "dev.ports": {
    es: ["Puertos de desarrollo", "Los de la carpeta principal; las otras suman su posición."],
    en: ["Development ports", "The main folder's; the others add their place."],
  },
  "ui.port": {
    es: ["Puerto de la UI", "El de specty ui; auto, uno libre."],
    en: ["UI port", "specty ui's; auto, a free one."],
  },
  "ui.requireUserPresence": {
    es: ["Presencia de la persona", "Pedir WebAuthn para las acciones de la UI."],
    en: ["User presence", "Ask for WebAuthn for the UI's actions."],
  },
  glossary: {
    es: ["Glosario del dominio", "El archivo con los términos del proyecto."],
    en: ["Domain glossary", "The file with the project's terms."],
  },
};

/** The name and the description of the setting `key`; of one the catalog lacks, its key. */
export function settingText(key: string, lang: Lang): SettingText {
  const [name, description] = TEXTS[key]?.[lang] ?? [key, ""];
  return { name, description };
}

export function sectionName(section: SettingSection, lang: Lang): string {
  return SECTIONS[section][lang];
}

/** The name of the option `option` of the setting `key`; without one, the option as it is. */
export function optionName(key: string, option: string, lang: Lang): string {
  return OPTIONS[key]?.[option]?.[lang] ?? option;
}
