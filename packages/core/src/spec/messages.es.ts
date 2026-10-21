// SPDX-License-Identifier: Apache-2.0
import { type MessageCatalog, param as v } from "./catalog";

const PATH_PROBLEMS: Readonly<Record<string, string>> = {
  empty: "la ruta está vacía",
  absolute: "usa una ruta relativa a la raíz del repositorio",
  parent: "no uses `..`",
  directory: "para un directorio usa un glob como `carpeta/**`",
};

const COVERED_BY: Readonly<Record<string, string>> = { task: "una tarea", slice: "un corte" };

export const MESSAGES_ES: MessageCatalog = {
  "frontmatter-missing": () =>
    "Falta el frontmatter con `kind` al inicio del archivo (por ejemplo, `kind: standard`).",
  "frontmatter-unclosed": () =>
    "El frontmatter no está cerrado: añade una línea `---` después de sus campos.",
  "frontmatter-invalid": (p) => `Frontmatter no válido: ${v(p, "detail")}.`,
  "title-missing": () => "Falta el título: añade una línea `# Título` antes de las secciones.",
  "title-duplicate": () =>
    "Solo puede haber un título `#`; usa `##` para las secciones y `###` dentro de ellas.",
  "text-outside-section": () => "Hay texto fuera de una sección; muévelo a una sección `##`.",
  "section-unknown": (p) =>
    `Sección desconocida «${v(p, "heading")}». Secciones válidas: ${v(p, "valid")}.`,
  "section-duplicate": (p) =>
    `La sección «${v(p, "section")}» aparece más de una vez; únelas en una sola.`,
  "section-required": (p) =>
    `Falta la sección «${v(p, "section")}», obligatoria en el carril ${v(p, "kind")}.`,
  "section-not-allowed": (p) =>
    `La sección «${v(p, "section")}» no se usa en el carril ${v(p, "kind")}; elimínala.`,
  "section-empty": (p) =>
    `La sección «${v(p, "section")}» está vacía; escribe su contenido o \`- Ninguno\` si no aplica.`,
  "line-invalid": (p) =>
    `Línea no válida en «${v(p, "section")}»: cada elemento empieza con \`- \` y sus campos van sangrados debajo.`,
  "fence-not-allowed": (p) =>
    `«${v(p, "section")}» no admite bloques de código; llévalos a la sección Diseño.`,
  "item-invalid": (p) =>
    `Elemento mal formado en «${v(p, "section")}»; se esperaba \`${v(p, "example")}\`.`,
  "item-prefix": (p) =>
    `El id ${v(p, "id")} no corresponde a «${v(p, "section")}»; usa el prefijo ${v(p, "prefix")}.`,
  "item-duplicate": (p) => `El id ${v(p, "id")} está repetido.`,
  "item-none-mixed": (p) =>
    `«Ninguno» no puede combinarse con otros elementos en «${v(p, "section")}».`,
  "field-unknown": (p) =>
    `Campo desconocido «${v(p, "field")}» en ${v(p, "id")}. Campos válidos: ${v(p, "valid")}.`,
  "field-duplicate": (p) => `El campo «${v(p, "field")}» está repetido en ${v(p, "id")}.`,
  "field-invalid": (p) =>
    `Valor no válido en ${v(p, "id")} → ${v(p, "field")}: «${v(p, "value")}». Valores válidos: ${v(p, "valid")}.`,
  "path-invalid": (p) =>
    `Ruta no válida «${v(p, "path")}»: ${PATH_PROBLEMS[v(p, "problem")] ?? v(p, "problem")}.`,
  "file-action-unknown": (p) =>
    `Acción desconocida «${v(p, "action")}»; usa crear, modificar, borrar o renombrar.`,
  "file-duplicate": (p) => `La ruta ${v(p, "path")} aparece más de una vez en Archivos.`,
  "file-rename-target": () => "Falta el destino del renombrado; usa `renombrar origen -> destino`.",
  "task-files-missing": (p) =>
    `${v(p, "id")} no tiene \`files\`; indica los archivos que puede tocar.`,
  "task-file-undeclared": (p) =>
    `${v(p, "id")} usa ${v(p, "path")}, que no está en la sección Archivos; añádelo allí o quítalo de la tarea.`,
  "task-ac-missing": (p) =>
    `${v(p, "id")} no indica qué criterios cubre (\`ac\`); si es refactor, test, docs o chore, usa \`ac: —\`.`,
  "task-ac-none-not-allowed": (p) =>
    `${v(p, "id")} solo puede usar \`ac: —\` con \`type\` refactor, test, docs o chore.`,
  "reference-unknown": (p) => `${v(p, "id")} referencia ${v(p, "ref")}, que no existe.`,
  "criterion-uncovered": (p) =>
    `Nada cubre ${v(p, "id")}; añádelo al \`ac\` de ${COVERED_BY[v(p, "by")] ?? v(p, "by")}.`,
  "task-verify-missing": (p) =>
    `${v(p, "id")} no tiene \`verify\` y la configuración no define una verificación por defecto.`,
  "slice-cycle": (p) => `Los cortes tienen dependencias circulares: ${v(p, "cycle")}.`,
  "quick-limits": (p) =>
    `El cambio no cabe en el carril quick (${v(p, "detail")}); usa \`kind: standard\`.`,
  "split-required": (p) =>
    `El cambio es demasiado grande (${v(p, "detail")}); divídelo en una épica con cortes verticales, o en un spike si el problema es la incertidumbre.`,
  "done-task-changed": (p) =>
    `${v(p, "id")} ya está completada y no se puede modificar ni eliminar; añade una tarea nueva.`,
  "closing-outside": (p) =>
    `Durante el cierre solo se puede modificar la sección Cierre; cambió ${v(p, "target")}.`,
  "closing-premature": () =>
    "La sección Cierre se escribe al cerrar el cambio; elimínala por ahora.",
  "closing-incomplete": () =>
    "El cierre de un spike debe incluir `### Hallazgos` y `### Decisión`.",
  "id-reused": (p) => `El id ${v(p, "id")} ya se usó antes en este cambio; usa ${v(p, "next")}.`,
  "criterion-vague": (p) =>
    `${v(p, "id")} usa términos vagos (${v(p, "terms")}); describe un resultado observable.`,
  "criterion-unstructured": (p) => `${v(p, "id")} no sigue la forma CUANDO … ENTONCES ….`,
  "task-too-large": (p) =>
    `${v(p, "id")} toca ${v(p, "count")} archivos (recomendado: ${v(p, "max")} como máximo); considera dividirla.`,
  "task-no-tests": (p) => `${v(p, "id")} no incluye tests (política: ${v(p, "policy")}).`,
  "file-reason-missing": (p) => `${v(p, "path")} no tiene motivo; añádelo tras un guion largo (—).`,
  "size-near-split": (p) => `El cambio está cerca del umbral de división (${v(p, "detail")}).`,
  "possible-new-scope": (p) =>
    `${v(p, "id")} toca ${v(p, "path")}, que no estaba en los archivos aprobados: puede ser alcance nuevo.`,
};
