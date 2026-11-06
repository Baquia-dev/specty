---
kind: standard
---

# Los textos de la UI marcan los caracteres de dirección del texto

## Objetivo

Desde el cambio anterior, la UI muestra con su código, en el tono de atención, cada carácter de dirección del texto (U+202A–U+202E, U+2066–U+2069) de las líneas de código, pero no los de los textos que vienen del agente o de disco y no son código: la spec, el motivo y las rutas de una solicitud de alcance, los títulos y los comentarios. Ahí el navegador los aplica y reordena lo que la persona lee («Trojan Source», CVE-2021-42574): la spec archivada de `20261107-la-ui-marca-los-caracteres-de-direccion-del` lleva un U+202E crudo en el Objetivo y en AC1, que en la pestaña Spec invierte el resto de esas líneas. Con este cambio, esos textos los muestran igual que el código, con la misma marca y el mismo título. Resuelve P241.

## Fuera de alcance

- La pestaña Aceptación (la evidencia de cada criterio, las rutas de sus tests y la matriz de trazabilidad), la Memoria, la trazabilidad del Historial, la vista del cambio en el chat (MCP App), los cortes de una épica en la Bandeja, las burbujas de los ids, la revisión independiente, las rutas de los tests enviados y bloqueados, la carpeta de un cambio y la salida de los comandos: siguen como hoy y quedan anotados como pendiente, porque con ellos el cambio pasaría de 15 archivos de código.
- Los atributos que llevan texto del agente, como un `title` o un `aria-label`.
- La petición del usuario (`sp-user-request`), que escribe la persona.
- Las marcas de dirección (U+200E, U+200F, U+061C) y los caracteres invisibles, que no reordenan lo que se lee: se ven como hoy.
- Escapar la spec archivada del cambio anterior: lo hace la persona con su script.

## Supuestos

- A1: Se marcan los mismos nueve caracteres que en el código y en la terminal, con la misma marca: su código, `\u` y sus cuatro cifras hexadecimales en minúsculas, en el tono de atención (`DIRECTION_MARK`) y con su título en español y en inglés, así que se ven igual en todas partes.
  - impacto: bajo
- A2: Los marca un solo corte, `directionPieces` (`highlight/highlight.ts`), que también usa `spansOf`, y lo pintan dos sitios: un componente nuevo, `sp-text` (`components/shown-text.ts`), que las plantillas usan en lugar de interpolar el texto, y el markdown, que marca su HTML antes de dárselo a Angular. `sp-item-text` usa `sp-text`, así que los comentarios y el Historial, que pasan por él, también los marcan.
  - impacto: alto
- A3: En el markdown, un carácter dentro de una etiqueta (como el destino de un enlace) se escribe como su código sin marca, porque no se ve; en el texto y en el código, marcado. El saneador de Angular quita los atributos `data-*`, así que allí la marca lleva su clase y su título, pero no `data-direction`.
  - impacto: bajo
- A4: Un comentario de la persona se marca porque pasa por `sp-item-text`, el mismo componente que los textos del agente; no hace falta distinguir quién lo escribió.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el Objetivo, el Fuera de alcance o el Diseño de una spec traen un carácter de dirección del texto (U+202A–U+202E, U+2066–U+2069), en su texto o en su código ENTONCES se ve su código en el tono de atención, en lugar de que el navegador lo aplique, y el resto conserva su formato.
- AC2: CUANDO lo trae un criterio, un supuesto, un riesgo, una ruta del cambio o su motivo, el título o una ruta de una tarea, el título de un corte o un texto que la revisión compara palabra a palabra ENTONCES la pestaña Spec lo muestra igual.
- AC3: CUANDO lo trae un comentario o un texto del Historial que nombra elementos por su id ENTONCES se ve igual, y cada id sigue señalando su elemento.
- AC4: CUANDO lo trae el motivo o una ruta de una solicitud de alcance, en Progreso o en la Bandeja, o el título o el resumen de una tarea en Progreso ENTONCES se ve igual.
- AC5: CUANDO lo trae el título de un cambio ENTONCES se ve igual en la Bandeja, en la cabecera del cambio y en su barra compacta.
- AC6: CUANDO la persona pasa el puntero por uno de esos caracteres marcados ENTONCES su título dice qué es y por qué se ve su código, en español y en inglés, igual que en el código.
- AC7: CUANDO un texto no trae ninguno, aunque tenga texto de derecha a izquierda o una marca de dirección (U+200F) ENTONCES se ve como hoy.

## Diseño

- **Corte** (`highlight/highlight.ts`): `directionPieces(text)` da el texto en piezas: una por cada carácter de dirección, con su código y `direction`, y el texto de alrededor tal cual; un texto sin ninguno es una sola pieza. `directionSpans`, el corte de `spansOf`, pasa a usarlo, sin cambiar lo que da.
- **`sp-text`** (`components/shown-text.ts`): recibe `text` y pinta sus piezas: la de un carácter, en un `span` con el tono y el título de `DIRECTION_MARK` en el idioma de `Preferences` y `data-direction`; el resto, como texto. No añade clases ni cambia cómo se parte o se recorta el texto de su padre. Lo usan, en lugar de `{{ … }}`: `sp-word-diff` y `sp-review-items` (`review/spec-sections.ts`: criterios, rutas y motivos, títulos y rutas de tareas, títulos de cortes y riesgos), `review/assumption-row.ts`, `sp-item-text` (`components/item-tooltip.ts`, en sus trozos sin id), `progress/scope-request.ts`, `progress/task-row.ts` (título y resumen), `inbox/inbox-row.ts` (título, rutas compartidas y solicitudes), `change/change-page.ts` y `change/change-bar.ts` (título).
- **Markdown** (`review/markdown.ts`): parte el HTML de `marked` en etiquetas y texto (`marked` escapa `<` y `>` en el texto y en los atributos) y cambia cada carácter por su código: dentro de una etiqueta, sin más; fuera, en un `span` con la clase y el título de `DIRECTION_MARK`, en el idioma de `Preferences`. Angular sanea el resultado como hoy.
- **Tests**: los escritos antes que el código no importan `sp-text`, que aún no existe, porque el constructor de tests de Angular comprueba los tipos de todos a la vez: pintan los componentes que ya existen con textos que llevan esos caracteres, construidos con `String.fromCodePoint`, y buscan las marcas por su texto, su título y su tono, y que no quede ningún carácter crudo.

## Archivos

- modificar packages/ui/src/highlight/highlight.ts — `directionPieces`, el corte de un texto en sus caracteres de dirección, que también usa `spansOf`
- modificar packages/ui/src/review/markdown.ts — el markdown marca esos caracteres en su HTML
- modificar packages/ui/src/review/markdown.test.ts — un markdown con esos caracteres en el texto, en el código y en un enlace, y uno sin ellos
- crear packages/ui/src/components/shown-text.ts — `sp-text`, un texto del agente o de disco con esos caracteres marcados
- modificar packages/ui/src/review/spec-sections.ts — los criterios, las rutas, las tareas, los cortes, los riesgos y la comparación palabra a palabra los marcan
- modificar packages/ui/src/review/assumption-row.ts — un supuesto los marca
- modificar packages/ui/src/components/item-tooltip.ts — `sp-item-text` los marca
- crear packages/ui/src/review/spec-direction.test.ts — las secciones de la spec, un supuesto, una comparación y un texto con ids, con esos caracteres
- modificar packages/ui/src/progress/scope-request.ts — el motivo y las rutas de una solicitud los marcan
- modificar packages/ui/src/progress/task-row.ts — el título y el resumen de una tarea los marcan
- crear packages/ui/src/progress/progress-direction.test.ts — una solicitud y una tarea con esos caracteres, en español y en inglés
- modificar packages/ui/src/inbox/inbox-row.ts — el título, las rutas y las solicitudes de un cambio en la Bandeja los marcan
- modificar packages/ui/src/change/change-page.ts — el título de la cabecera los marca
- modificar packages/ui/src/change/change-bar.ts — el título de la barra compacta los marca
- crear packages/ui/src/change/change-direction.test.ts — el título de un cambio en la Bandeja, en su cabecera y en su barra, y una solicitud en la Bandeja, con esos caracteres
- modificar docs/ui.md — cuenta qué textos los marcan, además del código

## Tareas

- [x] T1: El markdown marca los caracteres de dirección del texto
  - files: packages/ui/src/highlight/highlight.ts, packages/ui/src/review/markdown.ts, packages/ui/src/review/markdown.test.ts
  - ac: AC1, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/markdown.test.ts --include src/highlight/highlight.test.ts --include src/components/diff-file.test.ts && pnpm lint
  - type: feat
- [ ] T2: Las secciones de la spec, los supuestos y los textos con ids los marcan con `sp-text`
  - files: packages/ui/src/components/shown-text.ts, packages/ui/src/review/spec-sections.ts, packages/ui/src/review/assumption-row.ts, packages/ui/src/components/item-tooltip.ts, packages/ui/src/review/spec-direction.test.ts
  - ac: AC2, AC3, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/spec-direction.test.ts --include src/review/spec-sections.test.ts --include src/review/delta-review.test.ts --include src/review/comments.test.ts --include src/components/item-tooltip.test.ts && pnpm lint && pnpm knip
  - type: feat
- [ ] T3: Progreso los marca en las solicitudes de alcance y en las tareas
  - files: packages/ui/src/progress/scope-request.ts, packages/ui/src/progress/task-row.ts, packages/ui/src/progress/progress-direction.test.ts
  - ac: AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/progress-direction.test.ts --include src/progress/scope-request.test.ts --include src/progress/progress-tab.test.ts && pnpm lint
  - type: feat
- [ ] T4: La Bandeja y la cabecera del cambio los marcan en el título y en las solicitudes
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/change-bar.ts, packages/ui/src/change/change-direction.test.ts
  - ac: AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/change-direction.test.ts --include src/inbox/inbox-row.test.ts --include src/change/change-page.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [ ] T5: ui.md cuenta qué textos marcan esos caracteres
  - files: docs/ui.md
  - ac: —
  - verify: grep -q "sp-text" docs/ui.md
  - type: docs

## Riesgos

- R1: Envolver un texto en `sp-text` podría cambiar cómo se recorta o se parte, o lo que leen los tests que miran su texto — `sp-text` no añade clases ni espacios, es un elemento en línea, y las verificaciones incluyen los tests de los componentes que lo usan.
- R2: Partir el HTML del markdown en etiquetas y texto fallaría con un `>` dentro de un atributo — `marked` lo escapa, y el HTML que escribe el agente lo sigue saneando Angular después, así que lo peor sería una marca de más, nunca un script.
