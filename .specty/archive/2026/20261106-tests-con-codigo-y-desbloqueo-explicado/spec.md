---
kind: epic
---

# Los tests se leen en la UI y su desbloqueo se explica con código

## Objetivo

Hoy la UI solo da la ruta de cada test, en «Tests por aprobar» y en «Tests bloqueados», y una solicitud para desbloquear un test aprobado solo trae un motivo en texto libre. Con esta épica, cada test tiene «Ver código», que muestra su código en la propia sección. Para pedir un desbloqueo, el agente tiene que adjuntar el cambio exacto que hará al test y las líneas de código que lo justifican, y la persona los ve antes de decidir. Lo que la persona aprueba es lo que se hace: `specty task done` no completa la tarea si el test queda distinto de como lo deja el parche aprobado.

## Fuera de alcance

- Ver el código de cualquier archivo del cambio: solo el de sus tests (los enviados, los bloqueados y los que pide un desbloqueo). El resto sigue en el diff de cada tarea.
- Editar un test o el parche desde la UI: la persona aprueba o rechaza, como hoy.
- La extensión de VS Code y el MCP App: siguen mostrando las secciones sin el código, porque su fuente no lo da.
- Las ampliaciones de alcance que no desbloquean un test: siguen con su motivo y nada más.
- El rojo por test con JUnit XML, que sigue pendiente de la épica de los tests como contrato.

## Supuestos

- A1: El código que se ve es el del archivo en la punta de la rama del cambio (`git show <rama>:<ruta>`): de un test enviado, la versión que se envió; de uno bloqueado, la bloqueada, o la última confirmada mientras está desbloqueado para una tarea. Lo que el agente aún no confirmó no se ve. Si la rama ya no existe, porque el cambio se cerró, se lee de la rama principal (`git.target`), donde se incorporó.
  - impacto: alto
- A2: Se ve el archivo entero, con el resaltado y los números de línea del visor de diffs (sus líneas como contexto, sin verde ni rojo), plegado por defecto y abierto con «Ver código» en la fila de cada test. Uno muy largo se corta como hoy el resaltado del visor (`MAX_HIGHLIGHTED_LINES`).
- A3: El servidor solo da el código de los tests del cambio: los del último `tests.proposed`, los de `lockedTests` y los de un desbloqueo pendiente o aprobado. Cualquier otra ruta, o una que no se puede leer, responde 404, y la UI dice que no puede mostrarlo sin romper la sección.
  - impacto: alto
- A4: Un desbloqueo exige `--patch <archivo>` (o `--patch -`, que lo lee de la entrada estándar): un diff unificado, como lo escribe `git diff`, que solo toca los tests que se piden desbloquear. Specty comprueba que se aplica a su versión bloqueada (`git apply --check`) y lo guarda en la solicitud. Un parche también puede borrar el test. El límite es de 500 líneas.
  - impacto: alto
- A5: Un desbloqueo exige también al menos una `--evidence <ruta>:<desde>-<hasta>`, y admite hasta 5: líneas de un archivo que git sigue en la carpeta del cambio (código, otro test o la spec), cada una de 40 líneas como máximo. Specty guarda esas líneas tal como estaban al pedirlo, así que la explicación no cambia aunque el archivo cambie después. Un archivo que git ignora (como un `.env`) se rechaza, para no copiar secretos al estado.
  - impacto: alto
- A6: `--patch` y `--evidence` son solo para desbloquear: en una ampliación de alcance normal, `scope add` los rechaza. El motivo (`--reason`) sigue siendo obligatorio en las dos.
- A7: El texto del guard al bloquear un test aprobado da el comando completo, con `--patch` y `--evidence`, y explica qué es cada uno; la tarjeta que rechaza un desbloqueo incompleto dice qué falta.
- A8: Al aprobarse un desbloqueo, el parche y la evidencia pasan de la solicitud al `scope.decided` de la auditoría, que ya lleva `unlock` y `task`. Al completar la tarea, `task done` aplica los parches aprobados para esa tarea, en el orden en que se aprobaron, a la versión bloqueada de cada test, y exige que el archivo quede igual (o borrado, si el parche lo borra). Si no coincide, rechaza la tarea con la diferencia y le dice al agente que lo deje como el parche o que pida otro desbloqueo.
  - impacto: alto
- A9: Una solicitud de desbloqueo que creó una versión anterior del CLI, sin parche, se ve como hoy (solo su motivo), y `task done` no compara ese test.
- A10: El modo delegado no cambia: el desbloqueo lo decide siempre la persona.
- A11: En Aceptación, cada test de «Tests bloqueados» que se desbloqueó muestra, por cada desbloqueo, su motivo, el parche aprobado y la evidencia, leídos de la auditoría.

## Criterios de aceptación

- AC1: CUANDO un cambio en `testing` tiene tests enviados ENTONCES cada test de «Tests por aprobar» tiene «Ver código», que despliega su código en la misma sección, con resaltado y números de línea, y vuelve a plegarlo.
- AC2: CUANDO un cambio tiene tests bloqueados ENTONCES cada uno, en Progreso y en Aceptación, tiene «Ver código» con su versión en la rama del cambio, o en la rama principal si el cambio ya se cerró.
- AC3: CUANDO se pide al servidor el código de una ruta que no es un test del cambio, o que no se puede leer ENTONCES responde 404, y la UI dice en la fila que no puede mostrar ese código.
- AC4: CUANDO el agente pide desbloquear un test aprobado sin `--patch` o sin ninguna `--evidence` ENTONCES `scope add` no crea la solicitud y le dice qué falta y cómo escribirlo; CUANDO el guard le impide cambiar un test bloqueado ENTONCES le da ya el comando completo.
- AC5: CUANDO el parche no se aplica a la versión bloqueada, toca otro archivo que los tests pedidos o pasa del límite ENTONCES `scope add` lo rechaza diciendo por qué.
- AC6: CUANDO una evidencia nombra un archivo que git no sigue, líneas que no existen o más de las permitidas ENTONCES `scope add` la rechaza; CUANDO es válida ENTONCES la solicitud guarda esas líneas tal como estaban.
- AC7: CUANDO hay una solicitud de desbloqueo pendiente ENTONCES Progreso muestra, junto a Aprobar y Rechazar, el motivo, el cambio propuesto al test como diff y cada fragmento de código que lo sustenta, con su ruta y sus líneas.
- AC8: CUANDO se aprobó un desbloqueo ENTONCES «Tests bloqueados», en Progreso y en Aceptación, muestra de ese test el motivo, el parche aprobado y la evidencia.
- AC9: CUANDO el agente completa una tarea con un test desbloqueado que no quedó exactamente como lo deja el parche aprobado ENTONCES `task done` no la completa y le muestra la diferencia; CUANDO coincide ENTONCES la completa y vuelve a bloquear el test, como hoy.
- AC10: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- CLI, servidor: una parte nueva de `server/api.ts`, `GET /api/changes/<id>/test?path=<ruta>`, en un módulo propio (`server/test-code.ts`) que decide si la ruta es un test del cambio y la lee de su rama o de la principal.
- UI, código de un test: `SpectyData` (`data/source.ts`) gana `testCode(change, path)`, que implementan `data/server.ts` y `data/fixtures.ts` (con el código de su muestra). Un componente nuevo, `progress/test-code.ts`, pide el código al abrirse y lo pinta con `DiffFileView`, como un archivo de líneas de contexto. Lo usan `progress/tests-sent.ts` y `progress/locked-tests.ts`.
- Core: `schema/state.ts` (la solicitud gana `patch` y `evidence`, opcionales); `guard/testing.ts` (el comando completo); `cards/task.ts` (los rechazos nuevos de `scope add` y de `task done`).
- CLI, desbloqueo: `commands/agent-commands.ts` (las opciones); un módulo nuevo, `flow/unlock-proposal.ts`, que comprueba el parche y lee la evidencia; `commands/scope.ts` lo usa; `commands/scope-decision.ts` pasa el parche y la evidencia al `scope.decided`; `flow/task-done.ts`, antes de volver a bloquear, compara el test con el que deja el parche.
- UI, desbloqueo: `data/progress.ts` (la solicitud con su parche y su evidencia); `data/locks.ts` (cada desbloqueo con su motivo, su parche y su evidencia); un componente nuevo, `progress/unlock-detail.ts`, que pinta el parche con el visor de diffs y cada evidencia con sus números de línea, y lo usan `progress/scope-request.ts` y `progress/locked-tests.ts`.
- Docs: `docs/formats.md` (la solicitud en `state.json` y `scope.decided`), `docs/ARCHITECTURE.md` §15 (la ruta nueva), `docs/ui.md` (Progreso y Aceptación), el ADR 0014 (el desbloqueo con parche y evidencia, y la comprobación de `task done`) y `docs/dominio.md` (el término «Desbloqueo»).

## Cortes

- C1: Cada test se puede leer en la UI
  - ac: AC1, AC2, AC3, AC10
- C2: Un desbloqueo se pide con el parche y el código que lo sustenta
  - ac: AC4, AC5, AC6, AC10
- C3: El desbloqueo se ve en detalle antes y después de decidirlo
  - ac: AC7, AC8, AC10
  - depends: C1, C2
- C4: El test queda como lo deja el parche aprobado
  - ac: AC9, AC10
  - depends: C2

## Riesgos

- R1: Un parche que se aplica al pedirlo puede dejar de aplicarse si el test cambia antes de decidirlo — el test está bloqueado, así que no cambia; si aun así no se aplica al aprobarlo, Specty rechaza la solicitud con el motivo, como hace con la huella de `retro --into`.
- R2: La evidencia copia código al `state.json` de la rama — se limita a 5 fragmentos de 40 líneas, de archivos que git sigue, y sale de la solicitud al decidirla.
- R3: Exigir el parche y la evidencia añade fricción al agente — el guard le da el comando completo de una vez, y `--patch -` evita escribir un archivo en el repositorio.
- R4: `cards/task.ts` (258 líneas) se acerca al aviso de 300, y `commands/scope.ts` (211) y `flow/task-done.ts` (198) crecerían — lo nuevo va en módulos propios (`flow/unlock-proposal.ts`, `progress/unlock-detail.ts`, `progress/test-code.ts`) y, si los rechazos no caben en `cards/task.ts`, en una tarjeta propia del desbloqueo.

## Cierre

### Resumen

Cada test de «Tests por aprobar» y de «Tests bloqueados», en Progreso y en Aceptación, tiene «Ver código». Despliega el test entero en su fila, con sus líneas numeradas y resaltadas. El servidor lo da en `GET /api/changes/<id>/test` y solo para los tests del cambio, leídos de su rama o, con el cambio cerrado, de la principal (C1). Para desbloquear un test aprobado, `scope add` exige `--patch`, el cambio exacto al test, y de 1 a 5 `--evidence <ruta>:<desde>-<hasta>`. Specty comprueba que el parche se aplica a la versión bloqueada con `git apply --check --recount`, y guarda las líneas de la evidencia tal como estaban; el guard da al agente el comando completo (C2). La solicitud pendiente muestra en Progreso el motivo, el parche en el visor de diffs y cada fragmento de evidencia, junto a Aprobar y Rechazar. Una vez aprobado, «Tests bloqueados» lo conserva en «Ver el desbloqueo S1» (C3). `task done` no completa la tarea si un test desbloqueado no queda como lo deja el último parche aprobado: muestra la diferencia y el comando para pedir otro desbloqueo. Al aprobar, Specty vuelve a comprobar el parche (C4). Tras la épica, cuatro cambios cerraron sus pendientes:
- la terminal muestra el parche y la evidencia al decidir un desbloqueo (P210, f94d12b);
- el prototipo da el código de los tests y trae un desbloqueo pendiente y otro aprobado (P213 y P227, 4471046);
- la trazabilidad y «Ver código» arman sus líneas con `contextFile` (P214, 8c4af06).

### Desviaciones

- C4 aplica a cada test solo el último parche aprobado para la tarea, y no todos en orden como decía A8. C2 comprueba cada parche sobre la versión bloqueada, así que el último ya trae el cambio completo, y encadenarlos fallaría si tocan las mismas líneas. Por lo mismo, un test ya desbloqueado se puede volver a pedir (A6 de C4).
- El código de un test no se pinta con `DiffFileView`, como decía el diseño, sino como las líneas de la trazabilidad del Historial, con un solo número por línea (C1). El parche sí usa el visor de diffs (C3).
- C1 salió XL en su primera spec y se estrechó: el código en el prototipo quedó para P213, ya hecho.
- El parche se normaliza en la UI (`data/patch.ts`) y no se guarda normalizado en el CLI.
- Los rechazos del desbloqueo van en tarjetas propias (`cards/unlock.ts`, `cards/unlock-check.ts`), no en `cards/task.ts`, como preveía R4.
- El clasificador de permisos de Claude Code no dejó al agente aprobar en modo delegado el gate 2 de C1 y C2, aunque el usuario lo había autorizado en el chat, así que los aprobó la persona. En C3, C4 y los pendientes, no rechazó nada.

### Decisiones

- El usuario eligió que el desbloqueo exija a la vez el parche y la evidencia, y que `task done` rechace el test que no quede como lo deja el parche aprobado.
- Un archivo que no se puede mostrar, también uno de más de 512 KB, responde 404, y la fila lo dice (C1).
- La evidencia solo sale de archivos que git sigue, para no copiar secretos al estado (C2).
- La versión bloqueada es la del último commit, y vale solo si su hash es el de `lockedTests`. El parche se aplica en un índice temporal, sin tocar la carpeta del cambio (C4).
- La UI muestra desplegado el detalle de una solicitud pendiente, porque hace falta para decidir, y plegado el de los desbloqueos ya aprobados (C3).

### Pendientes

- P234: la UI no marca los caracteres de dirección del texto (U+202A–U+202E, U+2066–U+2069) en el parche ni en la evidencia, y en el navegador pueden reordenar lo que se lee. La terminal sí los escribe con su código.
- P235: en Progreso, aprobar una solicitud de alcance avisa «T3 vuelve a su lugar» aunque la tarea aún espere otra solicitud.
