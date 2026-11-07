// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";

// What the page «Configuración» of `specty ui` says of the settings of section «Interno»
// (`settings/catalog.ts`): the parameters Specty kept fixed in its code and the guarantees, which
// `cards/settings.ts` gathers with the others.

/** A setting's name and description in each language: `[name, description]`. */
type Texts = Readonly<Record<Lang, readonly [string, string]>>;

/** Section «Interno»: its settings and the guarantees, each saying why it does not change. */
const INTERNAL_TEXTS: Readonly<Record<string, Texts>> = {
  "internal.waits.waitTimeoutSec": {
    es: ["Espera de specty wait", "Cuánto espera la decisión de la persona sin --timeout."],
    en: ["specty wait's wait", "How long it waits for the person's decision without --timeout."],
  },
  "internal.waits.heartbeatSec": {
    es: [
      "Latido de specty wait",
      "Cada cuánto escribe una línea donde la herramienta corta un comando callado.",
    ],
    en: [
      "specty wait's heartbeat",
      "How often it writes a line where the tool cuts a silent command.",
    ],
  },
  "internal.waits.verifyIntervalMs": {
    es: [
      "Intervalo de una verificación que espera",
      "Cada cuánto mira de nuevo una verificación que espera el turno de la completa o una plaza del clon, de 100 a 10000 ms.",
    ],
    en: [
      "Interval of a waiting verification",
      "How often a verification waiting for the full verification's turn or a place of the clone looks again, from 100 to 10000 ms.",
    ],
  },
  "internal.waits.waitIntervalMs": {
    es: [
      "Intervalo de specty wait",
      "Cada cuánto mira specty wait si la persona decidió, cuando no se le pasa --interval; de 100 a 10000 ms.",
    ],
    en: [
      "specty wait's interval",
      "How often specty wait looks whether the person decided, when --interval is not given; from 100 to 10000 ms.",
    ],
  },
  "internal.retries.landing": {
    es: [
      "Reintentos al aterrizar",
      "Cuántas veces más incorpora close main y aterriza si main avanzó.",
    ],
    en: ["Landing retries", "How many more times close incorporates main and lands if it moved."],
  },
  "internal.retries.memory": {
    es: [
      "Reintentos al escribir la memoria",
      "Cuántas veces más escribe una entrada de la memoria si otra sesión escribió antes, de 1 a 50.",
    ],
    en: [
      "Memory write retries",
      "How many more times it writes an entry of the memory if another session wrote first, from 1 to 50.",
    ],
  },
  "internal.retries.gitConfig": {
    es: [
      "Reintentos en la configuración de git",
      "Cuántas veces más liga specty new la rama a su cambio si otro proceso bloquea la configuración de git; cada espera dobla la anterior, desde 50 ms.",
    ],
    en: [
      "Git configuration retries",
      "How many more times specty new ties the branch to its change if another process locks git's configuration; each wait doubles the last, from 50 ms.",
    ],
  },
  "internal.retention.verifiedDays": {
    es: [
      "Días del registro de unidades",
      "Cuántos días guarda el registro las unidades que pasaron antes de que specty prune las borre; una borrada solo vuelve a correr.",
    ],
    en: [
      "Days of the record of units",
      "How many days the record keeps the units that passed before specty prune removes them; a removed one only runs again.",
    ],
  },
  "guarantee.receipts": {
    es: [
      "Vida de los recibos",
      "Fija en 24 h: un recibo que viviera más dejaría colar un commit con un recibo viejo.",
    ],
    en: [
      "Life of the receipts",
      "Fixed at 24 h: a receipt that lived longer would let a commit in with an old receipt.",
    ],
  },
  "guarantee.guardPending": {
    es: [
      "Vida de los pendientes del guard",
      "Fija en 24 h: uno que viviera más dejaría pasar un fin de turno con una marca vieja.",
    ],
    en: [
      "Life of the guard's pending marks",
      "Fixed at 24 h: one that lived longer would let an end of turn through with an old mark.",
    ],
  },
  "guarantee.shellSnapshots": {
    es: [
      "Vida de las instantáneas de shell",
      "Fija en 24 h: una que viviera menos se borraría antes del segundo hook de un comando largo, y el guard no sabría qué cambió.",
    ],
    en: [
      "Life of the shell snapshots",
      "Fixed at 24 h: one that lived less would go before a long command's second hook, and the guard would not know what changed.",
    ],
  },
  "guarantee.sessions": {
    es: [
      "Vinculación de las sesiones",
      "Fija en 24 h: una que viviera menos dejaría que la limpieza borrara la carpeta en la que trabaja una sesión.",
    ],
    en: [
      "Sessions' binding",
      "Fixed at 24 h: one that lived less would let the cleanup delete the folder a session works in.",
    ],
  },
};

/**
 * Section «Interno», execution and server: the priority of the verifications, the most Specty
 * reads of a command's output and the UI's ports.
 */
const INTERNAL_RUN_TEXTS: Readonly<Record<string, Texts>> = {
  "internal.exec.priority": {
    es: [
      "Prioridad de las verificaciones",
      "El nice con que corren la verificación de cada tarea y la completa, de 0 a 19; si Specty ya corre más bajo, se quedan en la suya.",
    ],
    en: [
      "Verifications' priority",
      "The nice each task's verification and the full one run at, from 0 to 19; if Specty already runs lower, they keep its own.",
    ],
  },
  "internal.exec.maxOutputKiB": {
    es: [
      "Salida máxima de un comando",
      "Los KiB que Specty lee de la salida de un comando de checks.commands o de la revisión independiente, y lo más que la UI sirve de un diff, una traza o el código de un test; de 64 a 16384.",
    ],
    en: [
      "A command's largest output",
      "The KiB Specty reads of the output of a checks.commands command or of the independent review, and the most the UI serves of a diff, a trace or a test's code; from 64 to 16384.",
    ],
  },
  "internal.server.portsTried": {
    es: [
      "Puertos que prueba la UI",
      "Cuántos puertos prueba specty ui desde el primero si está ocupado, de 1 a 100.",
    ],
    en: [
      "Ports the UI tries",
      "How many ports specty ui tries from the first if it is taken, from 1 to 100.",
    ],
  },
};

/**
 * Section «Interno», what commands and checks show: the findings of a command's output, the
 * lines of a failure in `specty verify --fresh` and the changes `specty why` lists.
 */
const INTERNAL_SHOWN_TEXTS: Readonly<Record<string, Texts>> = {
  "internal.findings.perCommand": {
    es: [
      "Hallazgos por comando",
      "Cuántos hallazgos toma specty check de la salida de un comando de checks.commands que falla, de 10 a 1000; checks.maxFindings dice cuántos muestra sin --verbose.",
    ],
    en: [
      "Findings per command",
      "How many findings specty check takes from the output of a failing checks.commands command, from 10 to 1000; checks.maxFindings says how many it shows without --verbose.",
    ],
  },
  "internal.findings.lastLines": {
    es: [
      "Últimas líneas de una salida sin ubicaciones",
      "Cuántas de sus últimas líneas da specty check como hallazgos cuando la salida de un comando que falla no señala ninguna ruta:línea, de 1 a 50.",
    ],
    en: [
      "Last lines of an output with no location",
      "How many of its last lines specty check gives as findings when a failing command's output points at no path:line, from 1 to 50.",
    ],
  },
  "internal.findings.messageChars": {
    es: [
      "Caracteres de un hallazgo",
      "Dónde corta specty check el mensaje de cada hallazgo de la salida de un comando, de 50 a 2000 caracteres.",
    ],
    en: [
      "Characters of a finding",
      "Where specty check cuts the message of each finding of a command's output, from 50 to 2000 characters.",
    ],
  },
  "internal.commands.verifyLines": {
    es: [
      "Líneas de un fallo en specty verify",
      "Cuántas de las últimas líneas de la salida de una unidad que falla muestra specty verify --fresh, de 5 a 200.",
    ],
    en: [
      "Lines of a failure in specty verify",
      "How many of the last lines of a failing unit's output specty verify --fresh shows, from 5 to 200.",
    ],
  },
  "internal.commands.whyEntries": {
    es: [
      "Cambios que lista specty why",
      "Cuántos cambios o commits, los más recientes, lista specty why de un archivo, de 1 a 100.",
    ],
    en: [
      "Changes specty why lists",
      "How many changes or commits, the newest, specty why lists for a file, from 1 to 100.",
    ],
  },
};

/** The names and descriptions of section «Interno», for `cards/settings.ts` to gather. */
export const INTERNAL_SETTING_TEXTS: Readonly<Record<string, Texts>> = {
  ...INTERNAL_TEXTS,
  ...INTERNAL_RUN_TEXTS,
  ...INTERNAL_SHOWN_TEXTS,
};
