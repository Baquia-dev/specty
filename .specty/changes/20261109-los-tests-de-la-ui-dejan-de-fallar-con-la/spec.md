---
kind: standard
---

# Los tests de la UI dejan de fallar con la máquina cargada

## Objetivo

Los tests de la UI pasan también con la máquina cargada dentro de `pnpm check`, que `release.yml` ejecuta antes de publicar la v1: cada test tiene 30 s en lugar de los 5 s por defecto de Vitest (P75), y el módulo del worker que deriva las vistas ignora los mensajes que no son peticiones de derivar, como el saludo de la vista de una MCP App, que en los tests llega a la misma ventana y lo hacía lanzar una excepción no capturada (P78 y P79, que son el mismo fallo).

## Fuera de alcance

- Cambiar los tests ya aprobados (`delegation.test.ts`, `embedded.test.ts`, `views.test.ts`, `fixtures.test.ts`): el arreglo va en la configuración de Vitest y en el código del worker.
- Los tests del CLI (P80) y de la extensión de VS Code (P104, P113), que llevan otros cambios abiertos.
- El tiempo de los `beforeEach` y `afterEach` (`hookTimeout`), que no ha fallado.
- Dejar de registrar el oyente de mensajes cuando el módulo no corre en un worker: en jsdom no hay ámbito de worker y esas líneas quedarían sin ningún test.

## Supuestos

- A1: P78 y P79 siguen abiertos en main (01dabb6) y son el mismo fallo. El constructor de tests de Angular (`@angular/build:unit-test` 22.2.5) ejecuta Vitest con `isolate: false`, así que los archivos de test que caen en el mismo proceso comparten la ventana de jsdom y los módulos ya cargados. `views.test.ts` y `fixtures.test.ts` importan `answer` de `derive.worker.ts`, y al cargarse ese módulo registra con `addEventListener("message", …)` un oyente en esa ventana. Después, el AC7 de `embedded.test.ts` crea `McpAppData`, que saluda al anfitrión con `window.parent.postMessage(…)`; en jsdom `window.parent` es la propia ventana, así que el oyente del worker recibe ese mensaje JSON-RPC, sin `records`, y `deriveViews` → `sharedFiles(undefined)` lee `.filter` de undefined. Falla solo a veces porque depende de qué archivos reparte Vitest al mismo proceso.
  - impacto: alto
- A2: P75 sigue abierto en main: `delegation.test.ts` no da a sus tests un tiempo propio y la configuración de la UI no fija `testTimeout`, así que valen los 5 s por defecto de Vitest. El constructor de Angular, con `runnerConfig: true`, pasa el `test` de `vitest-base.config.ts` a su proyecto de Vitest, como ya pasa su `globalSetup` (20261106-los-tests-de-vscode-la-ui-y-evals-borran-sus), y con él `testTimeout`; un test lo ve en `task.timeout` de su contexto.
  - impacto: alto
- A3: 30 s bastan: el test de P75 pasó de 5 s con la máquina a carga 28 y su archivo solo tarda unos 10 s; la CLI ya da 60 s a cada test. Un test que se cuelga tarda 30 s en fallar en lugar de 5, y los lentos los sigue señalando `checks.testTime`.
- A4: En la aplicación, al worker solo le escribe `changes-store.ts`, siempre con una petición de derivar (`id` numérico y la lista `records`): ignorar los demás mensajes no cambia nada para la persona.

## Criterios de aceptación

- AC1: CUANDO un test de la UI tarda más de 5 s, como el de «turns on only after the warning and an explicit yes…» de `delegation.test.ts` con la máquina cargada ENTONCES Vitest no lo corta hasta los 30 s.
- AC2: CUANDO al módulo del worker que deriva las vistas le llega un mensaje que no es una petición de derivar (sin `id` numérico o sin la lista `records`), como el saludo `ui/initialize` de la vista de una MCP App ENTONCES lo ignora: no lanza ningún error ni responde.
- AC3: CUANDO al módulo del worker le llega una petición de derivar ENTONCES responde, como antes, con su `id` y las vistas de sus registros.

## Diseño

- `packages/ui/vitest-base.config.ts` fija `testTimeout: 30_000` en `test`, con un comentario que dice por qué (la máquina cargada dentro de `pnpm check`).
- `derive.worker.ts` añade un guardián local `isRequest(data: unknown): data is DeriveRequest`, que comprueba con `in` y `typeof` que es un objeto con `id` numérico y `records` una lista, sin casts. El oyente recibe `MessageEvent<unknown>` y solo responde con `postMessage(answer(event.data))` cuando `isRequest` lo acepta. `answer` no cambia de firma: la usan `views.test.ts` y `fixtures.test.ts`.
- `src/test-timeout.test.ts` comprueba `task.timeout` del contexto del test, como `src/temp-dir.test.ts` comprueba la carpeta temporal de la ejecución.
- `src/data/derive.worker.test.ts` importa el módulo (que registra su oyente en la ventana de jsdom), sustituye `postMessage` con `vi.stubGlobal`, despacha en `window` eventos `message` y recoge los eventos `error` de la ventana: con un saludo JSON-RPC, un objeto sin `records`, `undefined` y un texto no hay errores ni respuestas; con una petición de derivar de `sampleRecords` responde `answer(request)`.

## Archivos

- modificar packages/ui/vitest-base.config.ts — cada test de la UI tiene 30 s (AC1)
- crear packages/ui/src/test-timeout.test.ts — comprueba que cada test de la UI tiene 30 s (AC1)
- modificar packages/ui/src/data/derive.worker.ts — responde solo a las peticiones de derivar e ignora los demás mensajes (AC2, AC3)
- crear packages/ui/src/data/derive.worker.test.ts — comprueba que ignora los demás mensajes sin errores y que responde a una petición (AC2, AC3)

## Tareas

- [x] T1: Cada test de la UI tiene 30 s
  - files: packages/ui/vitest-base.config.ts, packages/ui/src/test-timeout.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/test-timeout.test.ts && pnpm lint && pnpm --filter @baquia-dev/specty-ui typecheck
- [ ] T2: El worker de las vistas ignora los mensajes que no son peticiones de derivar
  - files: packages/ui/src/data/derive.worker.ts, packages/ui/src/data/derive.worker.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/derive.worker.test.ts && pnpm lint && pnpm typecheck && pnpm knip

## Riesgos

- R1: Que el constructor de Angular no pasara `testTimeout` de `runnerConfig` a su proyecto — el test de T1 lo detecta, porque lee el tiempo del propio test.
- R2: Que, con `isolate: false`, el módulo del worker se evalúe más de una vez y queden varios oyentes en la ventana — el test de T2 comprueba la respuesta con `toHaveBeenCalledWith` y no cuenta las llamadas.
