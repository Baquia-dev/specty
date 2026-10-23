---
kind: standard
follows:
  - 20261023-datos-de-los-diffs
---

# Visor de diffs

## Objetivo

El sistema de diseño gana un visor de diffs, con su sección en el catálogo. Muestra los archivos de un diff con sus bloques, números de línea, signos y palabras cambiadas, en modo unificado o lado a lado. El resaltado de sintaxis con Shiki llega en el cambio siguiente; este deja el visor listo para recibirlo.

## Fuera de alcance

- El resaltado de sintaxis y su dependencia, Shiki: van en el cambio siguiente.
- La vista «Cambios» en la pestaña Aceptación.
- Comentar líneas del diff, buscar dentro de él o descargarlo.

## Supuestos

- A1: El visor (`sp-diff-viewer`) recibe los archivos ya leídos con `parseDiff`, un rango opcional («5d2a7b0 → 3c9d1e2») y una barra que pone quien lo usa, como un selector de qué cambios ver. Muestra un resumen («5d2a7b0 → 3c9d1e2 · 2 archivos · +35 −2»), la lista de archivos (cada uno, un botón que lleva a él) y cada archivo (`sp-diff-file`).
  - impacto: alto
- A2: Cada archivo se puede plegar y muestra su ruta (y la anterior si se renombró), su estado y sus líneas añadidas y quitadas. Debajo van los bloques con su cabecera («@@ -10,8 +11,31 @@ class AttendanceRepository {»), las líneas con su número en cada lado y su signo, y las palabras cambiadas marcadas. Un archivo de más de 60 líneas muestra las 40 primeras y «Mostrar N líneas más»; uno binario dice que no se muestra.
  - impacto: alto
- A3: «Unificado | Lado a lado» se elige con el selector segmentado y se recuerda en el navegador. Por debajo de 640 px solo hay vista unificada y el selector no aparece.
- A4: Los fondos del diff son tokens del sistema en `styles.css`, en claro y oscuro: la línea añadida, la quitada y sus palabras cambiadas, más intensas. Están en el inventario con pares de contraste, así que el texto cumple 4,5:1 sobre todos ellos en los dos temas y los tests lo comprueban.
- A5: Para un lector de pantalla, los números y los signos quedan ocultos, y cada línea cambiada empieza por «Añadida:» o «Quitada:». El botón de cada archivo dice si está desplegado, y un diff sin archivos dice «No hay cambios».
- A6: El visor pinta cada línea en tramos (texto, color y si es una palabra cambiada), para que el resaltado del cambio siguiente solo tenga que darles color.
- A7: En «Componentes» del catálogo, la sección «Visor de diffs» muestra el diff de ejemplo de «Panel de asistencia» con un selector de qué cambios ver (Todo el cambio · T1 · T2).

## Criterios de aceptación

- AC1: CUANDO se muestra un diff ENTONCES cada archivo aparece con su ruta, su estado y sus líneas añadidas y quitadas, y con sus bloques numerados, los signos y las palabras que cambiaron marcadas.
- AC2: CUANDO la persona elige «Lado a lado» ENTONCES ve lo quitado a la izquierda y lo añadido a la derecha, emparejados; en el teléfono solo hay vista unificada.
- AC3: CUANDO un archivo es largo ENTONCES se ven sus primeras líneas y «Mostrar N líneas más», y cada archivo se puede plegar.
- AC4: CUANDO un lector de pantalla recorre el diff ENTONCES oye si cada línea cambiada se añadió o se quitó, sin números ni signos.
- AC5: CUANDO se ve un diff en claro u oscuro ENTONCES el texto se lee sobre las líneas añadidas y quitadas y sobre sus palabras cambiadas.
- AC6: CUANDO se abre «Componentes» en el catálogo ENTONCES aparece el visor con el diff de ejemplo y un selector de qué cambios ver.

## Diseño

- **Tokens** (`styles.css`, `theme/tokens.ts`): `--color-diff-added`, `--color-diff-added-word`, `--color-diff-removed` y `--color-diff-removed-word`, con sus pares de contraste.
- **Visor** (`components/diff-viewer.ts`): el resumen, la barra proyectada, el selector de modo, la lista de archivos y los archivos.
- **Archivo** (`components/diff-file.ts`): la cabecera plegable, los bloques en modo unificado o lado a lado (con `splitRows`), las líneas en tramos y «Mostrar N líneas más».
- **Catálogo** (`catalog/components.ts`): la sección con el diff de ejemplo.

## Archivos

- modificar packages/ui/src/styles.css — los fondos del diff
- modificar packages/ui/src/theme/tokens.ts — esos tokens en el inventario, con sus pares de contraste
- crear packages/ui/src/components/diff-file.ts — un archivo del diff
- crear packages/ui/src/components/diff-viewer.ts — el visor de diffs
- crear packages/ui/src/components/diff-viewer.test.ts — tests del visor
- modificar packages/ui/src/catalog/components.ts — el visor en el catálogo
- modificar packages/ui/src/catalog/components.test.ts — test de la sección
- modificar docs/ui.md — el visor de diffs

## Tareas

- [x] T1: Los fondos del diff
  - files: packages/ui/src/styles.css, packages/ui/src/theme/tokens.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/theme/tokens.test.ts
- [x] T2: El visor de diffs
  - files: packages/ui/src/components/diff-file.ts, packages/ui/src/components/diff-viewer.ts, packages/ui/src/components/diff-viewer.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/diff-viewer.test.ts
- [x] T3: El visor en el catálogo
  - files: packages/ui/src/catalog/components.ts, packages/ui/src/catalog/components.test.ts, docs/ui.md
  - ac: AC6
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px, en claro y oscuro: los dos modos, las palabras marcadas, plegar, «Mostrar N líneas más», la lista de archivos y el selector de qué cambios ver.
