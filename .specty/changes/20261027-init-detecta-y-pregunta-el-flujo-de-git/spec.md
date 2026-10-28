---
kind: standard
---

# init detecta y pregunta el flujo de git

## Objetivo

`init --git-flow` ya escribe el flujo, pero hay que saber pasarlo. Con este cambio, `init` detecta el flujo que sigue el repositorio y se lo pregunta a la persona, con el detectado primero; un agente se queda con el detectado al crear la configuración; y un proyecto nuevo que termina sin flujo lo dice y pide elegirlo.

## Fuera de alcance

- Preguntar o detectar `git.branchPattern`.
- Volver a preguntar el flujo cuando la configuración ya lo tiene: para cambiarlo está `--git-flow`.
- Las ramas `release/` y `hotfix/` de Git Flow, más allá de servir para detectarlo.

## Supuestos

- A1: Sin nada detectado, la primera opción es la de Specty (`specty/<id>`), la de siempre: quien acepta sin mirar no cambia de nombres; GitHub Flow va después.
  - impacto: medio
- A2: Un agente solo escribe el flujo detectado cuando `init` crea la configuración: en una instalación que ya existe, cambiar el nombre de las ramas lo decide la persona o `--git-flow`.
  - impacto: medio
- A3: La pregunta va después de la de los agentes y antes de la entrevista de un proyecto nuevo, porque el flujo se escribe en `config.yaml` antes que `PRODUCT.md`.
- A4: Elegir «Specty» escribe `git.flow: specty`, así `init` no vuelve a preguntar.

## Criterios de aceptación

- AC1: CUANDO una persona en la terminal ejecuta `init` sin `--git-flow` ni `--dry-run` y la configuración no tiene `git.flow` ENTONCES, después de los agentes, `init` le pregunta qué flujo de git sigue el repositorio (una sola opción), escribe el elegido en `git.flow` y, con Git Flow, prepara `develop` como con `--git-flow gitflow`.
- AC2: CUANDO `init` detecta el flujo (Git Flow por la configuración de git-flow, una rama `develop` o ramas `feature/`, `bugfix/`, `release/` o `hotfix/`; GitHub Flow por ramas `<tipo>/…` con un tipo de commit; el de Specty por ramas `specty/…`) ENTONCES ese va primero en la pregunta, con la etiqueta «detectado»; sin detección, el primero es el de Specty y la pregunta no habla de ninguno detectado.
- AC3: CUANDO la persona cancela la pregunta ENTONCES `init` escribe el flujo detectado, o ninguno si no lo hay.
- AC4: CUANDO nadie puede responder (un agente o `--dry-run`) ENTONCES `init` escribe el flujo detectado solo si crea la configuración; en una configuración que ya existe no lo toca.
- AC5: CUANDO la configuración ya tiene `git.flow`, o se pasa `--git-flow`, ENTONCES `init` no pregunta el flujo.
- AC6: CUANDO un proyecto nuevo termina `init` sin flujo de git ENTONCES la salida avisa de que las ramas serán `specty/<id>` hasta elegirlo con `--git-flow`, y su SIGUIENTE pide preguntárselo al usuario y ejecutar `init --git-flow <flujo>`.
- AC7: CUANDO se lee ARCHITECTURE §14 ENTONCES dice cómo detecta `init` el flujo, cuándo lo pregunta y qué pasa en un proyecto nuevo sin él.

## Diseño

- Core, `cards/init.ts`:
  - `flowQuestion(detected, lang)` y `flowChoices(detected, lang)`: los cuatro flujos con el nombre de sus ramas (`FLOW_BRANCHES`), el detectado primero y con «detectado»; sin él, Specty, GitHub Flow, Git Flow y trunk.
  - `noFlowWarning(command, lang)` para el proyecto nuevo sin flujo.
  - `InitView.chooseFlow`: `newProjectNext` añade a su SIGUIENTE elegir el flujo con `init --git-flow <flujo>`.
- CLI, `install/git-flow.ts`:
  - `detectFlow(git)`: lee `gitflow.branch.develop` y las ramas locales y remotas (sin el nombre del remoto) y aplica el orden de AC2.
  - `flowToWrite(...)`: el de `--git-flow`; nada si la configuración ya tiene uno; la respuesta de la persona o, si cancela, el detectado; sin persona, el detectado solo al crear la configuración. Devuelve también si un proyecto nuevo quedó sin flujo.
- CLI, `commands/init.ts`: pregunta tras los agentes con `flowToWrite`, y usa su flujo para `config.yaml` y para `develop` en vez de solo `--git-flow`.

## Archivos

- modificar packages/core/src/cards/init.ts — pregunta, opciones, aviso y SIGUIENTE
- modificar packages/core/src/cards/index.ts — exportar los textos nuevos
- modificar packages/core/test/cards/init.test.ts — los textos nuevos
- modificar packages/cli/src/install/git-flow.ts — detección y flujo que se escribe
- modificar packages/cli/src/commands/init.ts — la pregunta y el flujo elegido
- modificar packages/cli/test/init-git-flow.test.ts — detección, pregunta y proyecto nuevo
- modificar packages/cli/test/init-agents.test.ts — la pregunta del flujo tras la de los agentes (R1)
- modificar packages/cli/test/init-language.test.ts — la pregunta del flujo en la lista de preguntas (R1)
- modificar docs/ARCHITECTURE.md — §14

## Tareas

- [x] T1: los textos de la pregunta del flujo y del proyecto nuevo sin flujo
  - files: packages/core/src/cards/init.ts, packages/core/src/cards/index.ts, packages/core/test/cards/init.test.ts
  - ac: AC1, AC2, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/init.test.ts
- [x] T2: init detecta el flujo, lo pregunta y lo escribe
  - files: packages/cli/src/install/git-flow.ts, packages/cli/src/commands/init.ts, packages/cli/test/init-git-flow.test.ts, packages/cli/test/init-agents.test.ts, packages/cli/test/init-language.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-git-flow.test.ts test/init-agents.test.ts test/init-language.test.ts
- [ ] T3: ARCHITECTURE dice cómo elige init el flujo de git
  - files: docs/ARCHITECTURE.md
  - ac: AC7
  - type: docs

## Riesgos

- R1: Los tests que ejecutan `init` con una persona y comparan la lista exacta de preguntas u opciones reciben una más (`init-agents.test.ts` y `init-language.test.ts`). Mitigación: solo se añade la pregunta del flujo a lo que esperan; la persona de prueba responde la primera opción, la de Specty, así que lo que instalan no cambia.
- R2: Otros tests que ejecutan `init` con una persona y después `new`. Mitigación: con la de Specty primero, sus ramas siguen siendo `specty/<id>`; la suite completa lo comprueba.
