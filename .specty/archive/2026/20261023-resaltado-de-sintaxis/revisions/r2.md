---
kind: standard
follows:
  - 20261023-visor-de-diffs-con-resaltado-de-sintaxis
---

# Resaltado de sintaxis

## Objetivo

El visor de diffs colorea el código con Shiki, con los colores del sistema de diseño, en claro y en oscuro, sin perder las palabras cambiadas marcadas. Shiki y cada lenguaje se descargan solo cuando se ve un diff, así que la carga inicial de la UI no crece.

## Fuera de alcance

- La vista «Cambios» en la pestaña Aceptación: va en el cambio siguiente.
- Resaltar otros textos (la spec, la salida de las verificaciones).
- Elegir el tema de colores del código o añadir lenguajes desde la UI.

## Supuestos

- A1: Shiki 4.5 se carga bajo demanda (`import()`): el núcleo con el motor de expresiones regulares de JavaScript, sin WASM, y cada lenguaje la primera vez que aparece un archivo suyo. Nada de Shiki entra en el bundle inicial, y se comprueba con `ng build`.
  - impacto: alto
- A2: Se resalta una lista cerrada de lenguajes, elegidos por la extensión o el nombre del archivo: TypeScript, TSX, JavaScript, JSX, JSON, CSS, SCSS, HTML, Markdown, YAML, TOML, shell, Dockerfile, Python, Go, Rust, Java, Kotlin, Swift, Dart, C, C++, C#, PHP, Ruby, SQL, GraphQL, XML, Vue y Svelte. Los demás archivos se ven sin colores.
  - impacto: alto
- A3: Los colores son tokens del sistema en `styles.css` (`--color-code-keyword`, `-string`, `-comment`, `-function` y `-constant`), en claro y oscuro, y Shiki los usa a través de su tema de variables CSS. Los comentarios van en cursiva. Cada uno cumple 4,5:1 sobre la superficie y sobre las líneas y palabras añadidas y quitadas, en los dos temas, y los tests lo comprueban; si hace falta, los fondos de las palabras cambiadas en oscuro se suavizan.
  - impacto: alto
- A4: Cada lado de cada bloque se resalta como un trozo de código: el antiguo (contexto y líneas quitadas) y el nuevo (contexto y líneas añadidas). Así la gramática sigue el código de verdad; un bloque que empieza a mitad de un comentario puede colorearse mal, como en cualquier visor de diffs.
- A5: El diff se ve al momento sin colores y se colorea cuando el resaltado está listo. Si un lenguaje no se puede cargar o el resaltado falla, se queda sin colores y no se muestra ningún error. Un archivo de más de 2.000 líneas cambiadas no se resalta.
- A6: El resaltado se inyecta (`HIGHLIGHT`), para que los tests y otros anfitriones lo puedan cambiar. Pinta los tramos que ya dibuja el visor: cada tramo lleva el color de Shiki y, si es una palabra cambiada, su fondo.
- A7: La sección «Visor de diffs» del catálogo muestra el diff de ejemplo (Dart) ya resaltado; no necesita cambios.

## Criterios de aceptación

- AC1: CUANDO se muestra un diff de un lenguaje de la lista ENTONCES el código aparece con colores de sintaxis y las palabras cambiadas siguen marcadas.
- AC2: CUANDO el archivo es de otro lenguaje, o el resaltado falla ENTONCES el diff se ve igual, sin colores y sin errores.
- AC3: CUANDO se abre la UI ENTONCES Shiki no está en la carga inicial: se descarga con el primer diff, y cada lenguaje cuando aparece un archivo suyo.
- AC4: CUANDO se ve un diff resaltado en claro u oscuro ENTONCES cada color de código se lee sobre la superficie y sobre las líneas y palabras añadidas y quitadas.

## Diseño

- **Colores** (`styles.css`, `theme/tokens.ts`): los cinco tokens de código, con pares de contraste sobre `--color-surface` y los cuatro fondos del diff.
- **Lenguajes** (`highlight/languages.ts`): la lista de A2, cada uno con sus extensiones o nombres y un `import()` de `shiki/langs/<id>.mjs`.
- **Resaltado** (`highlight/highlight.ts`): `LineSpan` y `spansOf(line, tokens?)` (antes en `diff-file.ts`), que reparte la línea en tramos con su color y su marca; `highlightFile(file)`, que devuelve los tokens de cada línea del archivo; y `HIGHLIGHT`, cuyo valor por defecto carga Shiki con `import()`.
- **Visor** (`components/diff-file.ts`): un `resource()` con el resaltado de su archivo, y los tramos con su color.

## Archivos

- modificar packages/ui/package.json — la dependencia `shiki`
- modificar packages/ui/src/styles.css — los colores del código
- modificar packages/ui/src/theme/tokens.ts — esos colores en el inventario, con sus pares de contraste
- crear packages/ui/src/highlight/languages.ts — los lenguajes que se resaltan
- crear packages/ui/src/highlight/highlight.ts — el resaltado con Shiki y los tramos con color
- crear packages/ui/src/highlight/highlight.test.ts — tests del resaltado
- modificar packages/ui/src/components/diff-file.ts — los tramos con su color
- modificar packages/ui/src/components/diff-file.test.ts — `spansOf` se prueba ahora con el resaltado
- modificar packages/ui/src/components/diff-viewer.test.ts — el visor con colores, y sin ellos
- modificar docs/ui.md — el resaltado en el visor de diffs

## Tareas

- [x] T1: Los colores del código
  - files: packages/ui/src/styles.css, packages/ui/src/theme/tokens.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/theme/tokens.test.ts
- [x] T2: Shiki y el resaltado
  - files: packages/ui/package.json, packages/ui/src/highlight/languages.ts, packages/ui/src/highlight/highlight.ts, packages/ui/src/highlight/highlight.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/highlight/highlight.test.ts
- [x] T3: El visor con colores
  - files: packages/ui/src/components/diff-file.ts, packages/ui/src/components/diff-file.test.ts, packages/ui/src/components/diff-viewer.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - notes: Comprobar con `ng build` que ningún archivo inicial contiene Shiki, y en el navegador, a 390 y 1280 px y en claro y oscuro, el diff de ejemplo coloreado en los dos modos.

## Riesgos

- R1: Shiki pesa: su núcleo y el motor de JavaScript rondan cientos de KB, y cada gramática decenas — solo se descargan al ver un diff, y solo las gramáticas de los archivos que aparecen.
- R2: El motor de JavaScript no cubre alguna gramática — Shiki lo avisa al cargarla; ese lenguaje queda sin colores (A5).

## Cierre

### Resumen

El visor de diffs colorea el código con Shiki y los colores del sistema: palabras clave, cadenas, comentarios en cursiva, funciones y constantes, en claro y oscuro, con 4,5:1 o más sobre la superficie y los cuatro fondos del diff. El diff se ve al momento sin colores y se colorea cuando el resaltado está listo; las palabras cambiadas siguen marcadas. Shiki se descarga con `import()` al ver el primer diff, sin WASM, y cada uno de los 30 lenguajes de la lista cuando aparece un archivo suyo. Los demás lenguajes, los binarios, los archivos de más de 2.000 líneas y cualquier fallo dejan el diff sin colores, sin errores. El resaltado se inyecta con `HIGHLIGHT`.

### Desviaciones

- **Tests de los colores en `diff-file.test.ts`:** `diff-viewer.test.ts` quedaba en el límite de 300 líneas, así que solo inyecta un resaltado sin colores, y los tests del archivo con colores (Shiki de verdad) van junto a `diff-file.ts`.
- **Fondos de las palabras cambiadas en oscuro:** pasan del 30 % al 22 % de tinte, como preveía A3, y palabra clave, comentario y función se aclaran un poco para cumplir el contraste.

### Decisiones

- **Constantes en verde azulado:** el verde de lo añadido ya marca líneas, así que los números y los tipos van en otro tono.
- **Comentarios siempre en cursiva:** el tema de variables CSS de Shiki no la pone, así que la pone el resaltado.
- **Un lado por vez:** las líneas quitadas toman los colores del código antiguo y las demás los del nuevo, cada lado de cada bloque resaltado de una vez.
- **Una sola dependencia:** `shiki` (exacta, 4.5.0); sus gramáticas se importan como `shiki/langs/<id>.mjs`, una por archivo diferido.
- **Tokens que no cuadran se ignoran:** si los tokens no deletrean la línea, se ve sin colores en vez de con el texto mal partido.

### Pendientes

- **Presupuesto de la carga inicial:** `ng build` avisa de 656,75 kB frente a 500 kB; ya pasaba antes de este cambio (que suma unos 2,6 kB, sin Shiki). Conviene ver qué entra en la carga inicial o ajustar el presupuesto.
- **La vista «Cambios» en Aceptación**, en el cambio siguiente.
- **El servidor local:** ejecutar git para cada tarea y para el cambio completo.
