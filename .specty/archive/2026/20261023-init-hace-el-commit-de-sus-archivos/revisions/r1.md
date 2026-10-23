---
kind: standard
---

# Init hace el commit de sus archivos

## Objetivo

`specty init` hace él mismo el commit de los archivos que escribe, así la carpeta principal queda limpia al terminar. Hoy los deja sin commit: `AGENTS.md`, que la persona tiene que commitear a mano, y `.claude/settings.json`, que además exige un retro. Mientras siguen sin commit, ningún `close` puede avanzar la rama principal. Pasó varias veces hoy (5841c05, 475bce1), y una de ellas dejó la rama principal en rojo.

## Fuera de alcance

- Escribir el JSON con el formato que pide cada formateador, o que `doctor` avise si el formateador no excluye esos archivos.
- Una opción para que `init` no haga el commit.
- No dejar que el agente salte de una worktree a otra en la misma sesión (anotado aparte).

## Supuestos

- A1: `init` hace el commit en la rama de la carpeta donde se ejecuta (normalmente `main`, en la carpeta principal), sin spec, porque es la instalación de Specty y no código del proyecto. Lleva un recibo para que el hook `pre-commit` lo deje pasar. El mensaje es `chore(specty): instalar Specty` la primera vez y `chore(specty): actualizar la instalación de Specty` después, con el trailer `Specty-Init: true`.
  - impacto: alto
- A2: Solo entran los archivos que `init` escribió y que no tenían cambios antes de ejecutarlo: `.specty/config.yaml`, `AGENTS.md`, `CLAUDE.md`, la configuración del guard de Claude Code y de Cursor, y los hooks de husky o lefthook. Si alguno ya tenía cambios de la persona, queda sin commit y la salida lo nombra, para no mezclar su trabajo con el de Specty. Los archivos locales, como `settings.local.json` o los hooks de `.git/hooks`, nunca entran.
  - impacto: alto
- A3: Si la carpeta tiene un cambio activo, `init` no hace el commit, porque iría a la rama del cambio fuera de sus tareas. La salida pide ejecutar `init` en la carpeta principal.
- A4: Si `init` no cambió nada, no hay commit.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty init` en un repo sin Specty ENTONCES queda un commit `chore(specty): instalar Specty`, con `Specty-Init: true`, que contiene `.specty/config.yaml`, `AGENTS.md` y `CLAUDE.md`. El hook `pre-commit` instalado lo deja pasar, la carpeta queda limpia (salvo los archivos locales) y la salida dice el commit y sus archivos.
- AC2: CUANDO se vuelve a ejecutar `init` y cambia algún archivo que gestiona ENTONCES hay un commit `chore(specty): actualizar la instalación de Specty` solo con esos archivos; si no cambia ninguno, no hay commit.
- AC3: CUANDO un archivo que `init` toca ya tenía cambios sin commit ENTONCES no entra en el commit, sigue con sus cambios, y la salida lo nombra.
- AC4: CUANDO la persona tiene otros cambios preparados (staged) ENTONCES el commit de `init` no los incluye y siguen preparados.
- AC5: CUANDO la carpeta tiene un cambio activo ENTONCES `init` no hace el commit, y la salida pide ejecutarlo en la carpeta principal.

## Diseño

- `install/commit.ts` (nuevo): `commitInstall(environment, written, before, first)`.
  - Abre la sesión de la carpeta (la configuración ya existe).
  - Si hay un cambio activo, no hace nada y devuelve el aviso de A3.
  - Si no, toma de `written` los archivos que ahora difieren de HEAD y no estaban en `before`, y hace el commit con `commitWithReceipt`, solo esos archivos (`only`).
  - Devuelve las líneas para la salida: el commit y sus archivos, y los que se quedaron fuera.
- `commands/init.ts`: al empezar, guarda los archivos con cambios (`changedSince(HEAD)`). Junta las rutas que escriben los instaladores, relativas al repo, y al final llama a `commitInstall`.
- `store/local.ts`: un tipo de recibo nuevo, `init`.
- `enforce/hook.ts`: con la marca `init`, `prepare-commit-msg` no añade `Specty-Change`, porque el mensaje ya lleva `Specty-Init`.

## Archivos

- crear packages/cli/src/install/commit.ts — el commit de la instalación
- modificar packages/cli/src/commands/init.ts — guardar el estado previo, juntar lo escrito y hacer el commit
- modificar packages/cli/src/store/local.ts — recibo de tipo `init`
- modificar packages/cli/src/enforce/hook.ts — sin `Specty-Change` en el commit de `init`
- crear packages/cli/test/init-commit.test.ts — pruebas de punta a punta con los hooks instalados
- modificar docs/ARCHITECTURE.md — §9: el commit de `init` entre los commits que hace Specty
- modificar docs/formats.md — §7: el trailer `Specty-Init`

## Tareas

- [ ] T1: Recibo y trailer del commit de `init`
  - files: packages/cli/src/store/local.ts, packages/cli/src/enforce/hook.ts, packages/cli/test/init-commit.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-commit.test.ts test/enforce.test.ts
- [ ] T2: `init` hace el commit de lo que escribió
  - files: packages/cli/src/install/commit.ts, packages/cli/src/commands/init.ts, packages/cli/test/init-commit.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-commit.test.ts test/setup.test.ts test/install.test.ts
- [ ] T3: Documentar el commit de `init`
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Un commit directo en `main` sin spec — solo lleva archivos que escribe Specty y que antes no tenían cambios, con un trailer propio, y si hay un cambio activo no se hace.
- R2: Los tests que ejecutan `init` y luego trabajan contaban con esos archivos sin commit — se revisan al correr la suite; con el commit, la carpeta queda limpia como esperan los flujos de cambio.
