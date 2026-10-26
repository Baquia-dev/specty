---
kind: standard
follows:
  - 20261025-specty-check-en-el-pre-commit
---

# Instalar las verificaciones con diff y confirmación

## Objetivo

`specty check --install` deja el proyecto listo para sus verificaciones, con la persona decidiendo cada paso:
- activa `checks.preCommit`;
- escribe la plantilla de GitHub Actions con `specty check --all --json`;
- pone el analizador de Dart en modo estricto;
- añade dependency-cruiser como devDependency con su versión exacta, si hay capas en TypeScript.

Muestra el diff de cada archivo y pregunta antes de tocarlo. Con `--dry-run` solo enseña lo que haría. Nunca pisa lo que la persona ya decidió: lo fusiona o lo informa como conflicto. Ejecutarlo dos veces no cambia nada la segunda.

## Fuera de alcance

- Instalar Betterleaks o gitleaks, que no son paquetes del proyecto: el comando solo dice cómo.
- Plantillas para otros proveedores de CI (GitLab, Bitbucket, Azure): la estructura queda lista para añadirlas.
- ESLint o typescript-eslint: sin ellos, `strict-types` ya usa su detección propia.
- Que el agente instale: solo la persona, en su terminal; el agente puede ver el plan con `--dry-run`.

## Supuestos

- A1: Escribir `.specty/config.yaml`, que el guard protege, solo puede hacerlo la persona, así que `--install` exige una terminal interactiva y se niega sin ella; `--dry-run` no escribe nada y vale para cualquiera.
  - impacto: alto
- A2: Los archivos YAML se editan con `parseDocument` de la librería `yaml` que ya usa Specty, que conserva comentarios y orden. Un valor que la persona ya puso distinto (un modo estricto en `false`, `preCommit: false`) es un conflicto: no se cambia, se informa. Una plantilla de CI que ya existe con otro contenido tampoco se pisa.
  - impacto: alto
- A3: El diff de cada archivo lo da `git diff --no-index` entre el texto de antes y el de después, sin ninguna dependencia nueva.
- A4: dependency-cruiser se añade con el gestor del proyecto y la versión exacta que Specty probó (18.7.0): `npm install --save-dev --save-exact`, `pnpm add --save-dev --save-exact`, `yarn add --dev --exact` o `bun add --dev --exact`.
- A5: Lo que se aplica se confirma con el mismo commit con recibo que usa `init` (`Specty-Init`), solo con los archivos que no tenían cambios de la persona y nunca dentro de un cambio activo.

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `specty check --install` en su terminal ENTONCES ve, archivo por archivo, el diff de lo que cambiaría y una pregunta; lo que confirma se aplica y entra en un commit `Specty-Init`; lo que rechaza queda igual.
- AC2: CUANDO se ejecuta con `--dry-run` ENTONCES muestra los mismos diffs y comandos sin preguntar ni escribir, y termina diciendo cómo aplicarlo; sin terminal interactiva y sin `--dry-run`, se niega y explica que lo hace la persona.
- AC3: CUANDO `.specty/config.yaml` no tiene `checks.preCommit` ENTONCES lo pone en `true` conservando el resto del archivo y sus comentarios; si ya está en `true` no hay nada que hacer; si está en `false`, es un conflicto que se informa.
- AC4: CUANDO no existe `.github/workflows/specty-check.yml` ENTONCES lo crea con la preparación del stack (Node, pnpm, Flutter o Dart y el comando de instalación detectado) y `npx -y @baquia-dev/specty@<versión> check --all --json`, guardando el JSON como artefacto; si existe igual no hace nada, y si existe distinto lo informa como conflicto.
- AC5: CUANDO el proyecto es de Dart y el analizador no está en modo estricto ENTONCES añade a `analysis_options.yaml` (o lo crea) los modos que faltan bajo `analyzer.language`, sin tocar sus `include` ni comentarios; un modo en `false` es un conflicto.
- AC6: CUANDO hay `checks.layers` en un proyecto TypeScript o JavaScript sin dependency-cruiser ENTONCES ofrece el comando del gestor con la versión exacta, y solo lo ejecuta si la persona lo confirma.
- AC7: CUANDO se ejecuta otra vez tras aplicarlo todo ENTONCES dice que no hay nada que instalar; los textos están en español y en inglés.

## Diseño

- `cli/src/check/ci.ts`: las plantillas de CI por proveedor (hoy, `github`), con su ruta y su texto según el stack y la versión de Specty, que se lee de su `package.json`.
- `cli/src/check/install.ts`: `planInstall(session, stacks)` da las ediciones (ruta, antes, después), los conflictos, las devDependencies y los avisos; `install(session, plan, dryRun)` los enseña con su diff, pregunta por cada uno, aplica lo confirmado y hace el commit.
- `cli/src/check/dart.ts` exporta la lectura de las opciones del analizador, para saber qué modos faltan siguiendo sus `include`.
- `commands/check.ts` añade `--install` y `--dry-run`.

## Archivos

- crear packages/cli/src/check/ci.ts — las plantillas de CI
- crear packages/cli/src/check/install.ts — el plan de instalación, sus diffs, las preguntas y el commit
- modificar packages/cli/src/check/dart.ts — exportar la lectura de las opciones del analizador
- modificar packages/cli/src/commands/check.ts — las opciones `--install` y `--dry-run`
- crear packages/cli/test/check-install.test.ts — la instalación de punta a punta
- modificar docs/formats.md — lo que escribe `specty check --install`
- modificar docs/ARCHITECTURE.md — `specty check --install` en la tabla de comandos

## Tareas

- [x] T1: El plan de instalación y la plantilla de CI
  - files: packages/cli/src/check/ci.ts, packages/cli/src/check/install.ts, packages/cli/src/check/dart.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-install.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-install.test.ts
- [x] T2: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm check

## Riesgos

- R1: El comando del gestor falla o cambia más de lo esperado (el lockfile) — solo corre tras confirmarlo, su salida se muestra si falla, y el commit solo lleva `package.json` y el lockfile si no tenían cambios previos de la persona.
- R2: La plantilla no sirve para un monorepo o un stack raro — es un punto de partida editable; si la persona la cambia, una nueva ejecución la informa como conflicto y no la pisa.
