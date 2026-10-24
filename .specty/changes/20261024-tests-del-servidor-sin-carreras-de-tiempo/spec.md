---
kind: standard
---

# Tests del servidor sin carreras de tiempo

## Objetivo

Los tests del servidor local dejan de fallar cuando la máquina está cargada, por ejemplo con tres sesiones corriendo `pnpm check` a la vez. «tells its listeners when a change moves» falló así en un `pnpm check` real, tras 39 s.

La causa es una carrera que también tiene el producto. El servidor envía el primer `changes` a quien escucha antes de tomar su foto inicial de los archivos. Bajo carga, esa foto puede terminar después de un cambio, que entonces queda dentro de la foto y nadie oye. Otros tres tests esperan tiempos fijos que, bajo carga, pueden quedarse cortos.

## Fuera de alcance

- Cambiar los tiempos del producto, como cada cuánto mira el servidor.
- Los tests del core y de la UI.

## Supuestos

- A1: Basta con que quien escucha oiga el primer `changes` después de la foto inicial. Lo que lea a partir de ese evento ya está en la foto, así que todo lo que cambie después se avisa. En el peor caso llega un `changes` de más, que solo hace releer.

## Criterios de aceptación

- AC1: CUANDO alguien empieza a escuchar `/api/events` ENTONCES oye el primer `changes` cuando el servidor ya tiene su foto inicial, y cualquier cambio posterior le llega aunque la foto tarde.
- AC2: CUANDO termina una verificación completa con líneas aún sin enviar ENTONCES el servidor las envía en un `run` antes del `run: null`.
- AC3: CUANDO los tests del servidor y de la ejecución en vivo esperan algo ENTONCES esperan a que ocurra, con un límite medido en tiempo real, y no un tiempo fijo.

## Diseño

- `server/events.ts`: una promesa `ready` con la primera mirada. Cada oyente nuevo oye `changes` cuando se resuelve, y se reinicia cuando ya no queda nadie escuchando.
- `server/runs.ts`: al terminar, si hay un aviso pendiente, se envía la ejecución con sus últimas líneas antes de anotar el resultado y avisar del final.
- Tests: `until` de `server.test.ts` mide tiempo real, con 20 s de límite, y ya no hace falta la espera de 200 ms. `live-run.test.ts` espera a que el archivo tenga la primera línea, y `server/live.test.ts` a que desaparezca el archivo del proceso muerto. `verify.test.ts` busca la salida que empieza por «uno».

## Archivos

- modificar packages/cli/src/server/events.ts — `changes` después de la foto inicial
- modificar packages/cli/src/server/runs.ts — las últimas líneas antes del final
- modificar packages/cli/test/server.test.ts — `until` en tiempo real, sin la espera fija
- modificar packages/cli/test/live-run.test.ts — esperar la primera línea
- modificar packages/cli/test/server/live.test.ts — esperar a que se borre el archivo
- modificar packages/cli/test/server/verify.test.ts — la salida que empieza por «uno»

## Tareas

- [x] T1: changes después de la foto inicial
  - files: packages/cli/src/server/events.ts, packages/cli/test/server.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server.test.ts test/server
- [ ] T2: Las últimas líneas antes del final, y esperas que no dependen del tiempo
  - files: packages/cli/src/server/runs.ts, packages/cli/test/live-run.test.ts, packages/cli/test/server/live.test.ts, packages/cli/test/server/verify.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/live-run.test.ts test/server && pnpm sources
