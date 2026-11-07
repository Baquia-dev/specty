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
  "internal.waits.queueStaleSec": {
    es: [
      "Caducidad de un puesto en la cola",
      "Cuánto cuenta el puesto de un proceso en la cola de las verificaciones sin renovarlo, de 10 a 600 y nunca menos de tres vueltas de una verificación que espera; pasado ese tiempo, el siguiente que mira lo quita.",
    ],
    en: [
      "Life of a place in the queue",
      "How long a process's place in the verifications' queue counts without renewing it, from 10 to 600 and never less than three looks of a waiting verification; after that, the next one that looks removes it.",
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
  "internal.retention.indexHours": {
    es: [
      "Vida de los índices temporales",
      "Cuántas horas deja specty prune un índice temporal de git antes de borrarlo, de 1 a 168; una lectura lo usa unos segundos.",
    ],
    en: [
      "Life of the temporary indexes",
      "How many hours specty prune leaves a temporary git index before removing it, from 1 to 168; a reading uses it for seconds.",
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
  "guarantee.waitMarks": {
    es: [
      "Vida de la marca de specty wait",
      "Fija en 30 s, o tres vueltas de su intervalo si son más: una que viviera más dejaría terminar el turno del agente sin que nadie espere a la persona.",
    ],
    en: [
      "Life of specty wait's mark",
      "Fixed at 30 s, or three of its intervals if longer: one that lived longer would let the agent's turn end with nobody waiting for the person.",
    ],
  },
};

/**
 * Section «Interno», execution, server and hooks: the priority of the verifications, the most
 * Specty reads of a command's output, the UI's ports, the time of Antigravity's hooks and the
 * limits of the UI's server.
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
  "internal.hooks.antigravityTimeoutSec": {
    es: [
      "Tiempo del hook de Antigravity",
      "Cuántos segundos deja Antigravity correr cada hook del guard antes de cortarlo y bloquear la herramienta, de 10 a 300; rige cuando specty init escribe .agents/hooks.json, y specty doctor avisa si el archivo tiene otro.",
    ],
    en: [
      "Antigravity's hook time",
      "How many seconds Antigravity lets each hook of the guard run before cutting it and blocking the tool, from 10 to 300; it applies when specty init writes .agents/hooks.json, and specty doctor warns if the file has another.",
    ],
  },
  "internal.server.changesEveryMs": {
    es: [
      "Cada cuánto mira la UI los cambios",
      "Los ms entre dos miradas del servidor de specty ui a si los cambios se movieron, mientras alguien lo escucha; de 100 a 60000.",
    ],
    en: [
      "How often the UI looks at the changes",
      "The ms between two looks of specty ui's server at whether the changes moved, while someone listens; from 100 to 60000.",
    ],
  },
  "internal.server.tasksEveryMs": {
    es: [
      "Cada cuánto mira la UI las verificaciones",
      "Los ms entre dos lecturas de las verificaciones que corren en otros procesos, como la de specty task done; de 100 a 60000.",
    ],
    en: [
      "How often the UI looks at the verifications",
      "The ms between two reads of the verifications running in other processes, such as specty task done's; from 100 to 60000.",
    ],
  },
  "internal.server.runLines": {
    es: [
      "Líneas de una verificación en curso",
      "Las últimas líneas que guarda una verificación mientras corre, en la UI y en su archivo en vivo; de 100 a 10000.",
    ],
    en: [
      "Lines of a verification going on",
      "The last lines a verification keeps while it runs, in the UI and in its live file; from 100 to 10000.",
    ],
  },
  "internal.server.runEveryMs": {
    es: [
      "Avisos de una verificación en curso",
      "Cada cuántos ms, como mucho, la UI oye una verificación que avanza y se reescribe su archivo en vivo; de 50 a 10000.",
    ],
    en: [
      "Notices of a verification going on",
      "At most how often, in ms, the UI hears a verification that moves and its live file is written again; from 50 to 10000.",
    ],
  },
  "internal.server.maxBodyKiB": {
    es: [
      "Cuerpo máximo de una acción",
      "Los KiB que lee el servidor del cuerpo de una acción de la persona; uno mayor se lee como ninguno. De 64 a 1024.",
    ],
    en: [
      "Largest body of an action",
      "The KiB the server reads of the body of an action of the person; a larger one reads as none. From 64 to 1024.",
    ],
  },
};

/** The names and descriptions of section «Interno», for `cards/settings.ts` to gather. */
export const INTERNAL_SETTING_TEXTS: Readonly<Record<string, Texts>> = {
  ...INTERNAL_TEXTS,
  ...INTERNAL_RUN_TEXTS,
};
