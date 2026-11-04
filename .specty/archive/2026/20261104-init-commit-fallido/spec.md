---
kind: standard
follows:
  - 20261104-commits-con-worktrees-ignoradas
---

# Un commit de init que falla se explica y deja la carpeta como estaba

## Objetivo

Cuando falla el commit de lo que instala `specty init` (o `specty check --install`), hoy sale una traza de Node con el `GitError`, y los archivos quedan escritos y preparados sin commit. Volver a ejecutar `init` tampoco los incluye, porque los toma por cambios de la persona. Ahora Specty explica el fallo con el comando de git y su error. Además deshace lo que había escrito en los archivos que iba a incluir, que solo había tocado él, para que repetir el comando funcione en cuanto se corrige la causa. Termina con código 1.

## Fuera de alcance

- Los demás comandos, como `task done`, `approve` o `close`: un `GitError` en ellos sigue saliendo como traza. Queda anotado como pendiente en la memoria de Specty.
- Deshacer lo que `init` no incluye en su commit: archivos locales, hooks nativos de git, copias de seguridad y los archivos que ya tenían cambios de la persona.

## Supuestos

- A1: Los archivos que `init` incluye en su commit no tenían cambios antes de ejecutarlo, así que su estado previo es el de HEAD, o no existían. Devolverlos a HEAD, o borrarlos si no estaban en HEAD, no pierde nada de la persona.
- A2: Un fallo de git al deshacer (por ejemplo, con el índice bloqueado) sigue saliendo como error; no se trata aparte.

## Criterios de aceptación

- AC1: CUANDO falla el commit de `specty init` ENTONCES su salida no lleva la traza de Node. Un aviso dice que no se pudo hacer el commit, con el subcomando de git y su error sin las líneas `hint:`, y qué archivos se deshicieron. Su SIGUIENTE pide corregir la causa y volver a ejecutar `specty init`, y termina con código 1.
- AC2: CUANDO falla ese commit ENTONCES los archivos que `init` iba a incluir vuelven a como estaban en HEAD (los que creó se borran) y no queda nada de ellos preparado. Los que ya tenían cambios de la persona no se tocan. CUANDO se corrige la causa y se vuelve a ejecutar `init` ENTONCES hace su commit.
- AC3: CUANDO falla el commit de `specty check --install` ENTONCES su informe lleva el mismo aviso, deshace lo mismo y termina con código 1.
- AC4: CUANDO se ejecutan los tests de core ENTONCES cubren el aviso y la tarjeta de `init` con el commit fallido, en español y en inglés.

## Diseño

- `io/git.ts` exporta `GitError`.
- `install/commit.ts`: `commitInstall` captura el `GitError` de `commitWithReceipt`. Entonces:
  - Deshace `mine`: `git checkout HEAD -- <los que están en HEAD>` y, para los demás, `git rm --cached --ignore-unmatch` y los borra del disco.
  - Devuelve el aviso `installCommitFailedWarning(mine, detalle, lang)` y `failed: true`. El detalle es `git <subcomando>: <stderr sin líneas hint:>`, en una línea.
- `cards/install.ts` (core): `installCommitFailedWarning`, exportado en `cards/index.ts`.
- `cards/init.ts` (core): `InitView.failed`. Con él, la tarjeta sale con estado `invalid` (código 1) y el SIGUIENTE de volver a ejecutar `specty init`.
- `commands/init.ts` pasa `failed` a la tarjeta; `check/install.ts` sale con código 1 si el commit falló.

## Archivos

- modificar packages/cli/src/io/git.ts — exportar `GitError`
- modificar packages/cli/src/install/commit.ts — capturar el fallo, deshacer y avisar
- modificar packages/cli/src/commands/init.ts — pasar el fallo a la tarjeta
- modificar packages/cli/src/check/install.ts — código 1 si el commit falló
- modificar packages/core/src/cards/install.ts — el aviso del commit fallido
- modificar packages/core/src/cards/init.ts — `InitView.failed`: estado y SIGUIENTE
- modificar packages/core/src/cards/index.ts — exportar el aviso
- modificar packages/core/test/cards/install.test.ts — el aviso, en español e inglés
- modificar packages/core/test/cards/init.test.ts — la tarjeta con el commit fallido
- modificar packages/cli/test/init-commit.test.ts — `init` con un commit que falla, al actualizar y al instalar por primera vez
- modificar packages/cli/test/check-install.test.ts — `check --install` con un commit que falla
- modificar docs/ARCHITECTURE.md — qué hace `init` si su commit falla

## Tareas

- [x] T1: El aviso del commit fallido y la tarjeta de `init` que lo refleja
  - files: packages/core/src/cards/install.ts, packages/core/src/cards/init.ts, packages/core/src/cards/index.ts, packages/core/test/cards/install.test.ts, packages/core/test/cards/init.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/install.test.ts test/cards/init.test.ts && pnpm lint
- [x] T2: `init` deshace lo escrito y avisa cuando su commit falla
  - files: packages/cli/src/io/git.ts, packages/cli/src/install/commit.ts, packages/cli/src/commands/init.ts, packages/cli/test/init-commit.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-commit.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T3: `check --install` termina con código 1 si su commit falla, y la documentación
  - files: packages/cli/src/check/install.ts, packages/cli/test/check-install.test.ts, docs/ARCHITECTURE.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-install.test.ts && pnpm lint

## Riesgos

- R1: Hacer fallar el commit en los tests. Mitigación: `commit.gpgsign=true` con `gpg.program=false` en el repositorio de prueba hace fallar `git commit` sin tocar el índice.

## Cierre

### Resumen

Si falla el commit de lo instalado, `commitInstall` captura el `GitError` de `commitWithReceipt` y deshace lo que escribió en los archivos que iba a incluir. Devuelve a HEAD los que estaban allí (`git checkout HEAD --`) y quita del índice y del disco los que había creado. Lo cuenta en AVISOS con `installCommitFailedWarning`: el subcomando de git, su error en una línea sin `hint:` y los archivos deshechos. La tarjeta de `init` sale entonces con estado `invalid` (código 1), y su SIGUIENTE pide corregir la causa y volver a ejecutar `specty init`. `check --install`, que comparte el commit, también termina con código 1. Volver a ejecutar `init` una vez corregida la causa hace su commit, como comprueba el test de AC2. `io/git.ts` exporta `GitError`, y `docs/ARCHITECTURE.md` explica el comportamiento.

### Desviaciones

- T2 se dividió en T2 (`init`) y T3 (`check --install` y la documentación) antes de aprobar la spec, porque `propose` avisó de que tocaba 7 archivos.

### Decisiones

- Se deshace en vez de dejar los archivos sin commit. Así, volver a ejecutar `init` los vuelve a escribir y hace su commit; sin deshacer, los tomaría por cambios de la persona. Es seguro porque esos archivos no tenían cambios antes de `init`.
- Solo se captura `GitError`: cualquier otro error sigue siendo un fallo de Specty y conserva su traza.
- El error de git se cita tal cual; los tests solo comprueban su comienzo, porque el texto cambia entre versiones de git.

### Pendientes

- Un `GitError` en los demás comandos (`task done`, `approve`, `close`, `integrate`…) sigue saliendo como traza de Node. Falta un manejo común en `sessionRunner` (`program.ts`) con un aviso bilingüe en el idioma de la sesión.
