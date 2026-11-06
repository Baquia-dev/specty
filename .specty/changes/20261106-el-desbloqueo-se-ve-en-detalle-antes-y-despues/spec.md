---
kind: standard
epic: 20261106-tests-con-codigo-y-desbloqueo-explicado
slice: C3
---

# El desbloqueo se ve en detalle antes y después de decidirlo

## Objetivo

Desde el corte C2, una solicitud para desbloquear un test aprobado lleva el cambio exacto al test (`patch`) y las líneas que lo justifican (`evidence`), pero la UI solo muestra su motivo. Con este cambio, Progreso muestra en la solicitud pendiente, junto a Aprobar y Rechazar, el parche con el visor de diffs y cada fragmento de evidencia con sus números de línea. Y, una vez aprobada, cada test de «Tests bloqueados», en Progreso y en Aceptación, da de cada desbloqueo su motivo, el parche aprobado y la evidencia. Es el corte C3 de la épica `20261106-tests-con-codigo-y-desbloqueo-explicado` (AC7, AC8 y AC10 de la épica).

## Fuera de alcance

- Que `task done` compare el test con lo que deja el parche aprobado: es el corte C4.
- Mostrar el parche y la evidencia en la terminal al decidir con `approve --scope` (P210) y en el Historial: siguen como hoy.
- Un desbloqueo de muestra en el prototipo (`FixtureData`): sus datos de ejemplo no traen parche ni evidencia, así que allí se ve como hoy.
- Filtrar el parche por test: un desbloqueo que pide dos tests muestra su parche entero en la fila de cada uno, porque se aprobó entero.
- Unir el archivo de líneas de contexto de la trazabilidad del Historial (`diffOf`) con el nuevo de las líneas de código (P214).
- Editar el parche o la evidencia desde la UI: la persona aprueba o rechaza, como hoy.

## Supuestos

- A1: El parche de la solicitud pendiente sale de `pending.scopeRequests` de `state.json`, y el de un desbloqueo aprobado, del `patch` y del `evidence` de su `scope.decided`, como los guarda el corte C2. El motivo de un desbloqueo aprobado sale del `reason` del `scope.requested` con su mismo `id`, porque el `scope.decided` no lo lleva. Nada de esto pide `testCode`, así que se ve con cualquier fuente que dé el estado y la auditoría.
  - impacto: alto
- A2: El parche se lee como lo leyó `git apply --check --recount` al pedirlo: las cuentas de cada bloque `@@` salen de sus líneas (las que empiezan por espacio, `-`, `+` o `\`, y las vacías, hasta la siguiente que no lo es), y un diff sin `diff --git`, solo con `---` y `+++`, también se lee. Lo hace un módulo propio de `data/`, que normaliza el texto antes de `parseDiff`, sin cambiar cómo se lee la salida de `git diff`.
  - impacto: alto
- A3: En la solicitud pendiente, el parche y la evidencia se ven desplegados, bajo el motivo y antes de qué implica decidir: la persona los necesita para decidir. El parche va con el visor de diffs, abierto, en modo unificado y con su recorte de las primeras líneas de un archivo largo. Cada evidencia lleva su ruta y sus líneas («test/sesion_test.dart:3-5») y su código numerado desde su primera línea, con los colores del resaltador, como «Ver código».
- A4: En «Tests bloqueados», cada desbloqueo con algo que mostrar tiene un botón plegado, «Ver el desbloqueo S1», bajo «Ver código», que despliega el motivo del agente, el parche aprobado y la evidencia, y «Ocultar el desbloqueo S1» lo vuelve a plegar. Plegado por defecto, para que la sección no empuje las tareas hacia abajo.
- A5: Las líneas numeradas de «Ver código» pasan a un componente propio, que usan «Ver código» y la evidencia, con la primera línea como entrada. «Ver código» se ve igual que hoy.
- A6: Una solicitud o un desbloqueo de un CLI anterior al corte C2, sin parche ni evidencia, se ven como hoy: la solicitud con su motivo, y el test bloqueado con un «Ver el desbloqueo» que solo da el motivo. Uno sin motivo, parche ni evidencia no tiene botón.

## Criterios de aceptación

- AC1: CUANDO hay una solicitud de desbloqueo pendiente con parche y evidencia ENTONCES Progreso muestra en ella, junto a Aprobar y Rechazar, el motivo, el parche como diff con el visor de diffs y cada fragmento de evidencia con su ruta, sus líneas y su código numerado como en el archivo.
- AC2: CUANDO el parche no trae `diff --git` o las cuentas de sus bloques `@@` no cuadran con sus líneas ENTONCES el diff muestra el archivo y todas sus líneas, como las leyó `git apply --recount`.
- AC3: CUANDO se aprobó un desbloqueo ENTONCES cada test que desbloqueó, en «Tests bloqueados» de Progreso y de Aceptación, tiene «Ver el desbloqueo S1», que despliega el motivo, el parche aprobado y la evidencia, leídos de la auditoría, y «Ocultar el desbloqueo S1» lo vuelve a plegar.
- AC4: CUANDO la solicitud o el desbloqueo no tiene parche ni evidencia ENTONCES la solicitud se ve como hoy, y el test bloqueado da solo el motivo del desbloqueo, o ningún botón si tampoco lo tiene.
- AC5: CUANDO la página está en inglés ENTONCES los textos nuevos salen en inglés, y en español en español.

## Diseño

- **Datos** (`data/progress.ts`): `TaskScopeRequest` gana `patch` y `evidence` (`UnlockEvidence` del core), copiados de la solicitud de `state.json` cuando los tiene. `data/locks.ts`: cada `UnlockView` gana `reason`, `patch` y `evidence`; `unlocksByPath` recuerda el motivo de cada `scope.requested` por su `id` y lee el parche y la evidencia del `scope.decided`, descartando una evidencia que no tiene `path`, `from`, `to` y `text`.
- **Parche** (`data/patch.ts`, nuevo): `patchFiles(patch)` rehace las cuentas de cada bloque `@@` con la regla de `--recount` (A2) y añade `diff --git` ante un `---`/`+++` que no lo tiene (con `new file mode` o `deleted file mode` si un lado es `/dev/null`); después, `parseDiff`.
- **Líneas de código** (`progress/code-lines.ts`, nuevo): `sp-code-lines`, con `path`, `text` y `start` (1 por defecto), pinta el `<ol>` numerado y resaltado que hoy pinta `progress/test-code.ts` (`asFile`, `HIGHLIGHT` y `spansOf`). `sp-test-code` lo usa con `data-test-code`, así que su DOM sigue igual.
- **Detalle** (`progress/unlock-detail.ts`, nuevo): `sp-unlock-detail`, con `patch` y `evidence`: «El cambio al test» con un `sp-diff-file` por archivo de `patchFiles` (`[data-unlock-patch]`), y «El código que lo sustenta» con cada evidencia (`[data-evidence]`): su ruta y sus líneas (`[data-evidence-where]`) y un `sp-code-lines` desde `from`.
- **Secciones**: `progress/scope-request.ts` pone `sp-unlock-detail` bajo el motivo cuando la solicitud tiene parche o evidencia. `progress/locked-tests.ts` pone, por cada desbloqueo con motivo, parche o evidencia, el botón `[data-unlock-toggle]` con `aria-expanded` y, abierto, el motivo (`[data-unlock-reason]`) y `sp-unlock-detail`. Lo que está abierto lo guarda la sección por test y solicitud.
- **Tests**: los escritos antes que el código no usan tipos ni módulos que aún no existen, porque el constructor de tests de Angular comprueba los tipos de todos a la vez: las secciones se crean con `TestBed.createComponent` y reciben sus entradas con `setInput`, y los datos se comprueban con `toEqual`.

## Archivos

- modificar packages/ui/src/data/progress.ts — la solicitud pendiente lleva su parche y su evidencia
- modificar packages/ui/src/data/locks.ts — cada desbloqueo aprobado lleva su motivo, su parche y su evidencia
- modificar packages/ui/src/data/progress.test.ts — la solicitud con parche y evidencia, y sin ellos
- modificar packages/ui/src/data/locks.test.ts — el motivo, el parche y la evidencia de cada desbloqueo, y una evidencia mal formada
- crear packages/ui/src/data/patch.ts — el parche de un desbloqueo como lo lee `git apply --recount`, en archivos del visor de diffs
- crear packages/ui/src/progress/code-lines.ts — líneas de código numeradas desde una línea y resaltadas
- modificar packages/ui/src/progress/test-code.ts — «Ver código» pinta sus líneas con `sp-code-lines`
- crear packages/ui/src/progress/unlock-detail.ts — el parche y la evidencia de un desbloqueo
- modificar packages/ui/src/progress/scope-request.ts — la solicitud pendiente muestra el parche y la evidencia
- modificar packages/ui/src/progress/scope-request.test.ts — el parche, la evidencia, un parche escrito a mano, una solicitud sin ellos y en inglés
- modificar packages/ui/src/progress/locked-tests.ts — «Ver el desbloqueo» de cada test bloqueado
- modificar packages/ui/src/progress/locked-tests.test.ts — el detalle de cada desbloqueo, uno solo con motivo, uno sin nada y en inglés
- modificar docs/ui.md — el detalle del desbloqueo en «Te espera» y en «Tests bloqueados»

## Tareas

- [x] T1: La solicitud y cada desbloqueo aprobado llevan su parche, su evidencia y su motivo
  - files: packages/ui/src/data/progress.ts, packages/ui/src/data/locks.ts, packages/ui/src/data/progress.test.ts, packages/ui/src/data/locks.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/progress.test.ts --include src/data/locks.test.ts
  - type: feat
- [x] T2: Las líneas numeradas de «Ver código» pasan a un componente que empieza en cualquier línea
  - files: packages/ui/src/progress/code-lines.ts, packages/ui/src/progress/test-code.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/tests-sent.test.ts
  - type: refactor
- [x] T3: La solicitud pendiente muestra el parche y la evidencia
  - files: packages/ui/src/data/patch.ts, packages/ui/src/progress/unlock-detail.ts, packages/ui/src/progress/scope-request.ts, packages/ui/src/progress/scope-request.test.ts
  - ac: AC1, AC2, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/scope-request.test.ts --include src/progress/tests-sent.test.ts
  - type: feat
- [x] T4: Cada test bloqueado da el detalle de sus desbloqueos, en Progreso y en Aceptación
  - files: packages/ui/src/progress/locked-tests.ts, packages/ui/src/progress/locked-tests.test.ts
  - ac: AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/locked-tests.test.ts --include src/progress/progress-tab.test.ts --include src/acceptance/acceptance-tab.test.ts && pnpm typecheck
  - type: feat
- [x] T5: ui.md cuenta el detalle del desbloqueo
  - files: docs/ui.md
  - ac: —
  - verify: grep -q "Ver el desbloqueo" docs/ui.md
  - type: docs

## Riesgos

- R1: Un parche que `git apply --recount` aceptó y que la lectura de la UI entiende de otra forma — la normalización sigue la regla de `--recount` de git (hasta la siguiente línea que no es del bloque, como un `@@` o un `diff`), y AC2 la comprueba con un parche escrito a mano sin `diff --git` y con las cuentas mal.
- R2: Mover las líneas de «Ver código» a `sp-code-lines` puede cambiar su DOM — `sp-test-code` pone `data-test-code` en el componente nuevo, la verificación de T2 vuelve a pasar los tests de «Ver código» de los tests enviados (su contrato, porque es un `refactor`), y la de T4 los de los bloqueados.
