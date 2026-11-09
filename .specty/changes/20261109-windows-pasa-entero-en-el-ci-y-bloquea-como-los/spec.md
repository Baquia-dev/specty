---
kind: standard
follows:
  - 20261109-los-fallos-de-windows-que-quedan-en-la-ci
---

# Windows pasa entero en el CI y bloquea como los demás sistemas

## Objetivo

Windows entra en la primera versión. En el run 42628873388 (main fba98e4) Linux y macOS pasan, y en Windows queda un solo test intermitente: el AC3 de `live-run.test.ts` con `runLines: 100` nunca ve la línea «300» en el archivo de la verificación en vivo. La causa es del producto: `writeText` reemplaza el archivo con un renombrado que Windows rechaza (EPERM, EACCES o EBUSY) mientras otro lo tiene abierto un momento, como el servidor de la UI (o el test) que lo lee o un antivirus que mira el archivo nuevo, y la verificación en vivo descarta esa escritura; si era la última, el archivo se queda sin las últimas líneas. Este cambio repite ese renombrado en Windows, da margen al test en un runner lento y quita el `continue-on-error` del job de Windows, para que bloquee como los demás.

## Fuera de alcance

- Repetir otras operaciones de archivos en Windows (`move`, `remove`, las lecturas de `readText`): no han fallado en ningún run.
- Hacer configurable la espera entre intentos: `writeText` no recibe la configuración, y la espera solo cubre un instante en que otro tiene el archivo abierto.
- Cambiar los tests AC1 y AC4 de `live-run.test.ts`, que pasan en todos los runs de Windows.

## Supuestos

- A1: Windows rechaza un renombrado que reemplaza un archivo mientras otro proceso o descriptor lo tiene abierto, aunque sea para leer (EPERM o EACCES), o mientras un antivirus lo examina (EBUSY), y lo acepta en cuanto se cierra; graceful-fs repite por eso el renombrado en Windows con esos tres códigos. En Linux y macOS esos errores no pasan solos: allí sale el error a la primera, como hoy.
  - impacto: alto
- A2: El fallo del run 42628873388 es ese renombrado rechazado y no la ventana de 2 s del test: el mismo test pasó en los runs anteriores de Windows, la suite tardó lo normal alrededor (los otros tests del archivo, 2,5 s) y el test agotó sus 20 s sin ver nunca la línea, lo que cuadra con una escritura perdida y no con una tardía.
  - impacto: alto
- A3: Unas esperas de 50, 100, 200, 400 y 800 ms (1,55 s en total, el doble cada vez desde 50 ms, como `lockWaits` de `markBranch`) bastan para que el lector o el antivirus suelten el archivo.

## Criterios de aceptación

- AC1: CUANDO Specty reemplaza un archivo en Windows con `writeText` (el estado de un cambio, la verificación en vivo…) y el sistema rechaza el renombrado con EPERM, EACCES o EBUSY ENTONCES lo intenta de nuevo tras 50, 100, 200, 400 y 800 ms, el archivo queda con el texto nuevo en cuanto un intento sale bien, y si el último también falla lanza ese error.
- AC2: CUANDO el renombrado falla en Linux o en macOS, o en Windows con otro error (por ejemplo ENOENT) ENTONCES el error sale a la primera, sin esperar, como hasta ahora.
- AC3: CUANDO los tests AC3 de la verificación en vivo corren en una máquina lenta ENTONCES el comando que imprime las líneas sigue vivo hasta que el test ha leído su última línea en el archivo, y comprueban lo mismo que antes: que el archivo guarda solo las últimas `internal.server.runLines` líneas (las 1000 últimas sin la clave).
- AC4: CUANDO el CI corre en un push a main o en un pull request ENTONCES el job `check` de Windows bloquea como los de Linux y macOS: ninguno tiene `continue-on-error`, y ARCHITECTURE.md ya no dice que Windows no bloquea.

## Diseño

- `cli/src/io/files.ts`: `writeText` reemplaza con `replaceFile(temporal, destino, plataforma)`, que en `win32` intenta el renombrado y, si falla con EPERM, EACCES o EBUSY, espera la siguiente de `RENAME_WAITS` (50, 100, 200, 400, 800 ms) y lo intenta de nuevo; tras la última espera, el último intento lanza su error. En otras plataformas, y con otros códigos, el primer error sale tal cual. La plataforma es un parámetro con `process.platform` por defecto, como en `io/browser.ts`, para probarlo en macOS.
- Test nuevo `cli/test/replace-file.test.ts`: sustituye `rename` de `node:fs/promises` por uno que rechaza los primeros intentos con el código elegido y luego renombra de verdad, con temporizadores falsos para no esperar 1,55 s.
- `cli/test/live-run.test.ts`: el comando de `printing` imprime sus líneas y espera, hasta 60 s, a que aparezca el archivo `listo` en la carpeta del repositorio; un helper corre la verificación, espera a ver la última línea en el archivo y crea `listo` (también si falla), y los dos AC3 lo usan con las mismas aserciones.
- `.github/workflows/ci.yml`: sin `continue-on-error` ni su comentario; `workflows.test.ts` comprueba que el job `check` no lo tiene.

## Archivos

- modificar packages/cli/src/io/files.ts — repetir en Windows el renombrado que reemplaza un archivo abierto por otro
- crear packages/cli/test/replace-file.test.ts — el renombrado rechazado, repetido en Windows y no en otros sistemas (AC1, AC2)
- modificar packages/cli/test/live-run.test.ts — el comando de los AC3 sigue vivo hasta que el test lee su última línea (AC3)
- modificar .github/workflows/ci.yml — Windows bloquea como Linux y macOS
- modificar packages/cli/test/workflows.test.ts — ningún job `check` tiene `continue-on-error` (AC4)
- modificar docs/ARCHITECTURE.md — Windows bloquea en el CI, y la verificación en vivo repite en Windows el renombrado rechazado

## Tareas

- [x] T1: `writeText` repite en Windows el renombrado que otro tiene abierto
  - files: packages/cli/src/io/files.ts, packages/cli/test/replace-file.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/replace-file.test.ts && pnpm lint
  - type: fix
- [x] T2: Los AC3 de la verificación en vivo sostienen el comando hasta leer su última línea
  - files: packages/cli/test/live-run.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/live-run.test.ts && pnpm lint
  - type: test
- [x] T3: Windows bloquea en el CI como Linux y macOS
  - files: .github/workflows/ci.yml, packages/cli/test/workflows.test.ts, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/workflows.test.ts && pnpm lint && pnpm typecheck
  - type: fix

## Riesgos

- R1: Aquí no hay Windows: el renombrado repetido solo se comprueba de verdad en la CI. Mitigación: el test nuevo simula los rechazos de Windows con la plataforma `win32` en macOS, y la sesión principal lee el siguiente run.
- R2: Con Windows bloqueando, un test intermitente de Windows que aún no ha salido bloquearía main. Mitigación: es lo que la persona decidió para la primera versión; el siguiente run lo dirá.
