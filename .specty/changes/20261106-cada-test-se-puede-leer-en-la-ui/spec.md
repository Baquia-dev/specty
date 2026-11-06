---
kind: standard
epic: 20261106-tests-con-codigo-y-desbloqueo-explicado
slice: C1
---

# Cada test se puede leer en la UI

## Objetivo

Hoy la UI solo da la ruta de cada test, en «Tests por aprobar» y en «Tests bloqueados». Con este cambio, cada test tiene «Ver código», que despliega en la misma fila su código, con el resaltado y los números de línea del visor de diffs. El código lo da el servidor local, y solo el de los tests del cambio.

## Fuera de alcance

- Ver el código de cualquier archivo del cambio que no sea uno de sus tests: el resto sigue en el diff de cada tarea.
- El parche y la evidencia de un desbloqueo, y su detalle en Progreso y en Aceptación: son los cortes C2, C3 y C4 de la épica.
- Editar un test desde la UI.
- El código en el prototipo (`FixtureData`): su fuente dice que no lo da, como cualquier fuente sin servidor. Queda como pendiente, para que el corte no pase de L.
- Un modo de archivo entero en `DiffFileView`: el código se pinta como la vista de trazabilidad del Historial.
- La extensión de VS Code y el MCP App: siguen sin el código, porque su fuente no lo da.

## Supuestos

- A1: El código es el del archivo en la punta de la rama del cambio (`git show refs/heads/<branch>:<ruta>`, con el `branch` de su `state.json`). Lo que el agente aún no confirmó no se ve. Si el cambio no tiene rama, o su rama ya no existe porque se cerró, se lee de la rama principal (`targetBranch`, con `git.target`), donde se incorporó.
  - impacto: alto
- A2: El servidor solo da el código de los tests del cambio: los `files` del último `tests.proposed` de su auditoría, las rutas de `lockedTests` y las `unlock` de cada `scope.decided`. Una solicitud de desbloqueo pendiente pide un test que ya está en `lockedTests`. Cualquier otra ruta responde 404 sin leer nada. También responde 404 un cambio que no existe, un archivo que no está en esa punta o uno que pasa de `MAX_OUTPUT`.
  - impacto: alto
- A3: La ruta es `GET /api/changes/<id>/test?path=<ruta>`, en un módulo propio (`server/test-code.ts`). Responde el archivo tal cual, como texto. Es una lectura: pide la sesión (403 sin ella) y también la da el servidor del agente, que es de solo lectura.
- A4: «Ver código» va bajo la ruta de cada test y está plegado por defecto. Al abrirse, pide el código a la fuente cada vez; mientras llega, muestra un esqueleto, y «Ocultar código» lo vuelve a plegar. Si la fuente no puede darlo, la fila dice que no puede mostrar ese código, y la sección sigue entera.
- A5: El código se ve entero, como las líneas de la vista de trazabilidad del Historial: cada línea con su número y con los colores del resaltador del visor de diffs (`HIGHLIGHT` y `spansOf`), sin verde ni rojo. El resaltado se corta como hoy en `MAX_HIGHLIGHTED_LINES`: un archivo más largo se ve sin colores.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO un cambio en `testing` tiene tests enviados ENTONCES cada test de «Tests por aprobar» tiene «Ver código», que despliega su código en la misma sección, con resaltado y números de línea, y «Ocultar código» lo vuelve a plegar.
- AC2: CUANDO un cambio tiene tests bloqueados ENTONCES cada uno, en Progreso y en Aceptación, tiene «Ver código» con su versión en la rama del cambio, o en la rama principal si el cambio ya se cerró.
- AC3: CUANDO se pide al servidor el código de una ruta que no es un test del cambio, o que no se puede leer ENTONCES responde 404, y la UI dice en la fila que no puede mostrar ese código.
- AC4: CUANDO la página está en inglés ENTONCES dice «Show code», «Hide code» y que no puede mostrar el código en inglés, y en español «Ver código», «Ocultar código» y su versión en español.

## Diseño

- **Servidor** (`packages/cli/src/server/test-code.ts`, nuevo): `testCode(session, id, path)` busca el cambio con `changeRecord`, que también encuentra los archivados. Arma las rutas de sus tests con su `state` y su `audit` (A2), y lee la ruta con `git show` de la rama o de la principal (A1). Devuelve el texto o `missing`. `server/api.ts` lo añade a `PARTS` como `test`, que responde con `TEXT` o con 404.
- **Fuente de datos** (`packages/ui/src/data/source.ts`): `SpectyData.testCode(change, path): Promise<string>`, que por defecto falla con «Esta fuente no da el código de los tests.». `ServerData` (`data/server.ts`) lo pide con `fetch`: con un 404 falla con el texto de AC3; con un 403 o con otro estado, como las demás lecturas.
- **Componente** (`packages/ui/src/progress/test-code.ts`, nuevo): `sp-test-code`, con `change` y `path`. Tiene el botón «Ver código», con `aria-expanded`, como «Ver salida» de una tarea. Al abrirse pide el código con `resource` y pinta sus líneas en un `<ol>` (`[data-test-code]`), como `history/trace-view.ts`: número y código con los colores de `HIGHLIGHT`. Mientras tanto, un `sp-skeleton`; si falla, un párrafo con el motivo (`[data-test-code-message]`).
- **Secciones**: `progress/tests-sent.ts` y `progress/locked-tests.ts` ganan la entrada `change` y ponen `sp-test-code` en cada fila, bajo la ruta (y bajo el estado, en los bloqueados). `progress/progress-tab.ts` y `acceptance/acceptance-tab.ts` les pasan `change().id`.
- **Tests**: los escritos antes que el código no usan tipos ni miembros que aún no existen, porque el constructor de tests de Angular comprueba los tipos de todos a la vez. Los de la UI crean las secciones con `TestBed.createComponent`, les dan las entradas con `setInput` y leen el DOM con `ServerData` y un `fetch` falso. El del servidor recorre con `contract` el cambio de `test-locks.test.ts` hasta cerrarlo, y borra su rama para leer de la principal.

## Archivos

- crear packages/cli/src/server/test-code.ts — qué rutas son tests del cambio y su código en la rama del cambio o en la principal
- modificar packages/cli/src/server/api.ts — la ruta `GET /api/changes/<id>/test`
- crear packages/cli/test/server/test-code.test.ts — el código de un test enviado, de uno bloqueado y de uno de un cambio cerrado; el 404 y el 403
- modificar packages/ui/src/data/source.ts — `testCode` en la fuente de datos
- modificar packages/ui/src/data/server.ts — `testCode` del servidor local
- crear packages/ui/src/progress/test-code.ts — «Ver código» de un test y su código
- modificar packages/ui/src/progress/tests-sent.ts — «Ver código» en cada test por aprobar
- modificar packages/ui/src/progress/tests-sent.test.ts — «Ver código» de los tests enviados, el 404 y en inglés
- modificar packages/ui/src/progress/progress-tab.ts — pasa el cambio a los tests enviados y a los bloqueados
- modificar packages/ui/src/progress/locked-tests.ts — «Ver código» en cada test bloqueado
- modificar packages/ui/src/progress/locked-tests.test.ts — «Ver código» de los tests bloqueados y en inglés
- modificar packages/ui/src/acceptance/acceptance-tab.ts — pasa el cambio a los tests bloqueados
- modificar docs/ARCHITECTURE.md — la ruta nueva del servidor en §15
- modificar docs/ui.md — «Ver código» en Progreso y en Aceptación

## Tareas

- [x] T1: El servidor da el código de los tests del cambio, y la fuente de datos lo pide
  - files: packages/cli/src/server/test-code.ts, packages/cli/src/server/api.ts, packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/cli/test/server/test-code.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/test-code.test.ts test/server/trace.test.ts && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server.test.ts --include src/data/server-trace.test.ts
- [x] T2: Cada test por aprobar tiene «Ver código»
  - files: packages/ui/src/progress/test-code.ts, packages/ui/src/progress/tests-sent.ts, packages/ui/src/progress/progress-tab.ts, packages/ui/src/progress/tests-sent.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/tests-sent.test.ts --include src/progress/progress-tab.test.ts
- [x] T3: Cada test bloqueado tiene «Ver código», en Progreso y en Aceptación
  - files: packages/ui/src/progress/locked-tests.ts, packages/ui/src/progress/progress-tab.ts, packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/progress/locked-tests.test.ts
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/locked-tests.test.ts --include src/progress/progress-tab.test.ts --include src/acceptance/acceptance-tab.test.ts && pnpm typecheck
- [ ] T4: La arquitectura y ui.md cuentan «Ver código» y su ruta
  - files: docs/ARCHITECTURE.md, docs/ui.md
  - ac: —
  - verify: grep -q "/api/changes/<id>/test" docs/ARCHITECTURE.md && grep -q "Ver código" docs/ui.md
  - type: docs

## Riesgos

- R1: `data/server.ts` ya pasa de 300 líneas de código y crece unas diez, así que `task done` avisará de ello. Mitigación: solo crece el método de la lectura y su texto del 404. Si el aviso pide dividirlo, se propone aparte, por responsabilidad.
- R2: Los tests de las secciones dejan de usar un componente anfitrión con plantilla, porque esa plantilla no compilaría con la entrada `change` antes del código. Mitigación: con `setInput` comprueban lo mismo que hoy, y además el código.
- R3: `test-code.ts` arma, para el resaltador, un archivo de líneas de contexto como el `diffOf` de `history/trace-view.ts`. Mitigación: es una función corta; unirlas en `data/diff.ts` queda como pendiente, para no pasar de L.
