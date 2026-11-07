// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";

// What the page «Configuración» says of the settings of the size and of the effort: sections
// «Tamaño y cortes» and «Esfuerzo recomendado». `cards/settings.ts` gathers them with the rest.

/** A setting's name and description in each language: `[name, description]`. */
type Texts = Readonly<Record<Lang, readonly [string, string]>>;

/** The effort of each size: what it is for. */
const EFFORT_BY_SIZE: Readonly<Record<string, Texts>> = Object.fromEntries(
  ["S", "M", "L", "XL"].map((level) => [
    `effort.${level}`,
    {
      es: [
        `Esfuerzo de un cambio ${level}`,
        "Al escribir y revisar su spec (plan) y al implementarla (implement).",
      ],
      en: [
        `Effort of an ${level} change`,
        "To write and review its spec (plan) and to implement it (implement).",
      ],
    },
  ]),
);

export const SIZE_TEXTS: Readonly<Record<string, Texts>> = {
  size: {
    es: ["Niveles de tamaño", "Puntos máximos de cada nivel; más que L es XL."],
    en: ["Size levels", "Highest score of each level; above L it is XL."],
  },
  "lanes.quick.maxFiles": {
    es: ["Archivos de un cambio rápido", "Archivos de código, sin tests, de un cambio quick."],
    en: ["Files of a quick change", "Code files, tests aside, of a quick change."],
  },
  "lanes.quick.maxTasks": {
    es: ["Tareas de un cambio rápido", "Las que admite su primera spec; sin valor, una."],
    en: ["Tasks of a quick change", "Those its first spec allows; unset, one."],
  },
  split: {
    es: ["Cuándo partir un cambio", "Tareas, archivos y módulos de más, y archivos por tarea."],
    en: ["When to split a change", "Too many tasks, files or modules, and files per task."],
  },
  "sizing.weights": {
    es: [
      "Pesos del tamaño",
      "Puntos de cada archivo creado, modificado, borrado o renombrado, módulo de más, ruta sensible, cambio de dependencias, tarea de más, archivo muy importado y módulo sin tests.",
    ],
    en: [
      "Size weights",
      "Points of each created, modified, deleted or renamed file, extra module, sensitive path, dependency change, extra task, widely imported file and module without tests.",
    ],
  },
  "sizing.tasksWithoutWeight": {
    es: ["Tareas sin peso", "Las primeras tareas no suman puntos; cada una más suma su peso."],
    en: ["Tasks without weight", "The first tasks add no points; each one more adds its weight."],
  },
  "sizing.highFanIn": {
    es: [
      "Archivo muy importado",
      "Cuántos archivos tienen que importarlo para que pese; Specty aún no los cuenta.",
    ],
    en: [
      "Widely imported file",
      "How many files must import it for it to weigh; Specty does not count them yet.",
    ],
  },
  "sizing.nearRatio": {
    es: [
      "Aviso de cerca de partir",
      "Fracción de los límites de tareas y archivos desde la que propose avisa.",
    ],
    en: ["Close to splitting", "Share of the task and file limits from which propose warns."],
  },
  ...EFFORT_BY_SIZE,
  "effort.task": {
    es: [
      "Esfuerzo de una tarea",
      "Bajo hasta lowMaxFiles archivos; alto desde highMinFiles o con una ruta sensible; medio entre ambos.",
    ],
    en: [
      "Effort of a task",
      "Low up to lowMaxFiles files; high from highMinFiles or with a sensitive path; medium in between.",
    ],
  },
};
