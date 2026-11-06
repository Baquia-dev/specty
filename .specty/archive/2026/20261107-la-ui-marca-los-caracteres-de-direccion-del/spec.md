---
kind: standard
---

# La UI marca los caracteres de dirección del texto en el código

## Objetivo

Hoy la UI pinta el parche y la evidencia de un desbloqueo, y cualquier otra línea de código, sin marcar los caracteres de dirección del texto (U+202A–U+202E, U+2066–U+2069): el navegador los aplica y puede reordenar lo que la persona lee, el ataque «Trojan Source» (CVE-2021-42574). Con este cambio, cada uno se ve con su código (`\u202E`), como ya lo muestra la terminal, en el tono de atención y con un título que dice qué es, en el visor de diffs, en «Ver código», en la evidencia de un desbloqueo y en la trazabilidad del Historial. Resuelve P234.

## Fuera de alcance

- Las marcas de dirección (U+200E, U+200F, U+061C), los caracteres invisibles (como U+200B) y los de control, que no reordenan lo que se lee: se ven como hoy.
- Los textos de la UI que no son código, como el motivo de una solicitud, una ruta o el título de una spec: no pasan por el corte de las líneas de código.
- La terminal, que ya los muestra con su código (`scopeRequestNote`).
- Un ejemplo con estos caracteres en el prototipo.

## Supuestos

- A1: Se marcan los nueve caracteres que marca la terminal, los de incrustación y anulación de la dirección (U+202A–U+202E) y los de aislamiento (U+2066–U+2069), que son los del ataque «Trojan Source».
  - impacto: bajo
- A2: Se marcan en un solo sitio, `spansOf` (`highlight/highlight.ts`), que corta en piezas cada línea del visor de diffs, de «Ver código», de la evidencia de un desbloqueo y de la trazabilidad, así que todas los muestran igual, también el diff de las tareas de un cambio, porque un test o un diff con ellos engaña igual que un parche.
  - impacto: alto
- A3: Un carácter marcado se ve como su código, `\u` y sus cuatro cifras hexadecimales en minúsculas, como en la terminal, en el tono de atención de los avisos (`--color-phase-review` sobre `--color-phase-review-bg`), sin el color del resaltador ni la cursiva, y con un título que dice qué es. El resto de la línea conserva sus colores y sus palabras cambiadas, y el carácter sigue contando como parte de la palabra cambiada en la que está, aunque se vea con el tono de atención.
  - impacto: bajo
- A4: Copiar el código de la página copia el código del carácter y no el carácter, así que se copia lo que se lee.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO una línea del visor de diffs, como la del parche de un desbloqueo, trae un carácter de dirección del texto (U+202A–U+202E, U+2066–U+2069) ENTONCES se ve su código (`\u202E`) en el tono de atención, en lugar de que el navegador lo aplique, y el resto de la línea conserva sus colores y sus palabras cambiadas, en vista unificada y lado a lado.
- AC2: CUANDO lo trae una línea de la evidencia de un desbloqueo, de «Ver código» o de la trazabilidad del Historial ENTONCES se ve igual: su código en el tono de atención, con los colores del resto de la línea.
- AC3: CUANDO la persona pasa el puntero por un carácter marcado ENTONCES su título dice qué es y por qué se ve su código, en español y en inglés.
- AC4: CUANDO una línea no trae ninguno, aunque tenga texto de derecha a izquierda o una marca de dirección (U+200F) ENTONCES se ve como hoy.

## Diseño

- **Corte** (`highlight/highlight.ts`): `LineSpan` gana `direction`, verdadero solo en la pieza de un carácter de dirección. `spansOf`, después de cortar la línea por sus colores y sus palabras cambiadas, corta cada pieza en cada carácter de dirección: la pieza del carácter lleva su código (como `visible` de `cards/approve.ts` en el core), sin color ni cursiva, y conserva `changed`. Así los tokens del resaltador siguen deletreando la línea y no se pierden sus colores. `DIRECTION_MARK` da a quien pinta las piezas su tono (las clases de `--color-phase-review` sobre `--color-phase-review-bg`) y su título en español y en inglés: «Carácter de dirección del texto: se muestra su código porque podría reordenar lo que lees» y «Text direction character: its code is shown because it could reorder what you read».
- **Quien pinta las piezas**: `components/diff-file.ts` (las celdas de las dos vistas), `progress/code-lines.ts` («Ver código» y la evidencia) y `history/trace-view.ts` ponen en la pieza marcada el tono de `DIRECTION_MARK`, en lugar del de la palabra cambiada, su título y `data-direction`. `code-lines` lee el idioma de `Preferences`.
- **Tests**: los escritos antes que el código no usan tipos ni módulos que aún no existen, porque el constructor de tests de Angular comprueba los tipos de todos a la vez: las piezas se comparan con `toEqual`, y en el DOM se buscan `[data-direction]`, su texto, su título y su tono.

## Archivos

- modificar packages/ui/src/highlight/highlight.ts — `spansOf` da cada carácter de dirección como su código, marcado, y `DIRECTION_MARK` su tono y su título
- modificar packages/ui/src/highlight/highlight.test.ts — el corte de una línea con esos caracteres, con colores y palabras cambiadas, y el de una sin ellos
- modificar packages/ui/src/components/diff-file.ts — el visor de diffs pinta marcados esos caracteres
- modificar packages/ui/src/components/diff-file.test.ts — un diff con esos caracteres, unificado y lado a lado, con sus colores
- modificar packages/ui/src/progress/code-lines.ts — «Ver código» y la evidencia de un desbloqueo los pintan marcados
- crear packages/ui/src/progress/unlock-detail.test.ts — el parche y la evidencia de un desbloqueo con esos caracteres, en español y en inglés
- modificar packages/ui/src/history/trace-view.ts — la trazabilidad los pinta marcados
- modificar packages/ui/src/history/trace-view.test.ts — un archivo trazado con esos caracteres
- modificar docs/ui.md — cuenta cómo se ven en el visor de diffs y en las líneas de código

## Tareas

- [x] T1: `spansOf` da cada carácter de dirección del texto como su código, marcado
  - files: packages/ui/src/highlight/highlight.ts, packages/ui/src/highlight/highlight.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/highlight/highlight.test.ts && pnpm lint
  - type: feat
- [x] T2: El visor de diffs los pinta en el tono de atención, con su título
  - files: packages/ui/src/highlight/highlight.ts, packages/ui/src/components/diff-file.ts, packages/ui/src/components/diff-file.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/diff-file.test.ts --include src/components/diff-file-marks.test.ts --include src/components/diff-viewer.test.ts && pnpm lint && pnpm knip
  - type: feat
- [x] T3: «Ver código», la evidencia de un desbloqueo y la trazabilidad los pintan igual
  - files: packages/ui/src/progress/code-lines.ts, packages/ui/src/progress/unlock-detail.test.ts, packages/ui/src/history/trace-view.ts, packages/ui/src/history/trace-view.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/unlock-detail.test.ts --include src/history/trace-view.test.ts --include src/progress/locked-tests.test.ts --include src/progress/tests-sent.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [x] T4: ui.md cuenta cómo se ven esos caracteres
  - files: docs/ui.md
  - ac: —
  - verify: grep -q "dirección del texto" docs/ui.md
  - type: docs

## Riesgos

- R1: Marcar los caracteres antes de aplicar los colores dejaría tokens del resaltador que no deletrean la línea, y la línea saldría sin colores — se marcan después de cortar por colores y palabras cambiadas, y AC1 comprueba los colores alrededor del carácter, en el visor de diffs y en la evidencia.
- R2: El tono de atención de la pieza marcada tapa el de la palabra cambiada en la que está — la pieza conserva `changed` (`data-changed`), y la persona ve el carácter, que es lo que importa al decidir.

## Cierre

### Resumen

La UI muestra con su código cada carácter de dirección del texto (U+202A–U+202E, U+2066–U+2069) en el visor de diffs, en «Ver código», en la evidencia de un desbloqueo y en la trazabilidad del Historial, en lugar de dejar que el navegador lo aplique y reordene lo que se lee («Trojan Source», CVE-2021-42574). Lo marca un solo sitio, `spansOf` (`highlight/highlight.ts`): después de cortar la línea por sus colores y sus palabras cambiadas, corta cada pieza alrededor de cada carácter y lo da como su código, `\u` y sus cuatro cifras hexadecimales, como la terminal, sin color ni cursiva, con `direction` y conservando `changed`. `DIRECTION_MARK` da el tono de atención (`--color-phase-review` sobre `--color-phase-review-bg`) y el título en español y en inglés, y el visor de diffs (en sus dos vistas), `progress/code-lines.ts` y `history/trace-view.ts` los ponen en la pieza marcada, con `data-direction`. El resto de la línea conserva sus colores y sus palabras cambiadas. ui.md lo cuenta en «Visor de diffs».

### Desviaciones

- Antes de aprobar la spec, T2 se dividió en dos tareas (el visor de diffs, y «Ver código», la evidencia y la trazabilidad) porque tocaba 7 archivos, y la comprobación de tipos quedó solo en la última tarea de código, como pidió `propose`; la documentación pasó a T4.
- Antes de enviar los tests, el código se probó en una copia de la carpeta del cambio en el scratchpad, porque solo la persona puede desbloquear un test aprobado mal escrito. Ejecutar allí `pnpm exec` reenlazó los paquetes del espacio de trabajo de la carpeta del cambio hacia la copia, a través de los enlaces de `node_modules`; se deshizo con `pnpm install --prefer-offline` en la carpeta del cambio, sin ningún enlace a la copia después.
- Al escribir la spec, el código del carácter que servía de ejemplo, escrito con su barra invertida, se guardó como el propio carácter U+202E, que quedó crudo en el Objetivo y en AC1. No se corrigió porque la spec ya estaba aprobada: queda en Pendientes.

### Decisiones

- Un solo sitio, `spansOf`, en lugar de marcar solo el parche y la evidencia: cubre también «Ver código», la trazabilidad y el diff de cualquier cambio, porque un test o un diff con estos caracteres engaña igual que un parche.
- Se marcan los mismos nueve caracteres que la terminal (`visible` en `cards/approve.ts`), con la misma forma de su código. La regla se repite en la UI, con un comentario que lo dice, en lugar de exportarla del core, para no ampliar su API pública por dos comparaciones.
- La pieza marcada toma el tono de atención en lugar del fondo de la palabra cambiada, pero conserva `changed` (`data-changed`).
- El título dice qué es el carácter y por qué se ve su código; un lector de pantalla lee el código tal cual, sin texto aparte.

### Pendientes

- Los textos de la UI que no son código (la spec, el motivo de una solicitud, una ruta) no marcan los caracteres de dirección del texto: la spec de 20261107-la-ui-marca-los-caracteres-de-direccion-del lleva un U+202E crudo en el Objetivo y en AC1, que en la pestaña Spec invierte el resto de esas líneas.
- Mirar a ojo en `specty ui`, en claro y en oscuro, cómo se ve un carácter de dirección marcado en el visor de diffs, en la evidencia de un desbloqueo y en la trazabilidad: solo lo comprueban los tests.
