---
kind: standard
---

# init detecta y pregunta el flujo de git

## Objetivo

`init --git-flow` ya escribe el flujo, pero hay que saber pasarlo. Con este cambio, `init` detecta el flujo que sigue el repositorio y se lo pregunta a la persona, con el detectado primero; un agente se queda con el detectado al crear la configuración; y un proyecto nuevo que termina sin flujo lo dice y pide elegirlo.

## Fuera de alcance

- Preguntar o detectar `git.branchPattern`.
- Preguntar o detectar el flujo en una configuración que ya existe, lo tenga o no, como pasa con el idioma: para elegirlo o cambiarlo está `--git-flow`.
- Las ramas `release/` y `hotfix/` de Git Flow, más allá de servir para detectarlo.

## Supuestos

- A1: Sin nada detectado, la primera opción es la de Specty (`specty/<id>`), la de siempre: quien acepta sin mirar no cambia de nombres; GitHub Flow va después.
  - impacto: medio
- A2: `init` solo elige el flujo (preguntando o por detección) cuando crea la configuración, como el idioma: en una instalación que ya existe, cambiar el nombre de las ramas se pide con `--git-flow`, y repetir `init` para actualizar los hooks no pregunta nada nuevo. Lo decidió el usuario el 2026-10-27.
  - impacto: medio
- A3: La pregunta va después de la de los agentes y antes de la entrevista de un proyecto nuevo, porque el flujo se escribe en `config.yaml` antes que `PRODUCT.md`.
- A4: Elegir «Specty» escribe `git.flow: specty`, así `init` no vuelve a preguntar.

## Criterios de aceptación

- AC1: CUANDO una persona en la terminal ejecuta `init` sin `--git-flow` ni `--dry-run` en un repositorio sin configuración ENTONCES, después de los agentes, `init` le pregunta qué flujo de git sigue el repositorio (una sola opción), escribe el elegido en `git.flow` y, con Git Flow, prepara `develop` como con `--git-flow gitflow`.
- AC2: CUANDO `init` detecta el flujo (Git Flow por la configuración de git-flow, una rama `develop` o ramas `feature/`, `bugfix/`, `release/` o `hotfix/`; GitHub Flow por ramas `<tipo>/…` con un tipo de commit; el de Specty por ramas `specty/…`) ENTONCES ese va primero en la pregunta, con la etiqueta «detectado»; sin detección, el primero es el de Specty y la pregunta no habla de ninguno detectado.
- AC3: CUANDO la persona cancela la pregunta ENTONCES `init` escribe el flujo detectado, o ninguno si no lo hay.
- AC4: CUANDO nadie puede responder (un agente o `--dry-run`) ENTONCES `init` escribe el flujo detectado solo si crea la configuración; en una configuración que ya existe no lo toca.
- AC5: CUANDO la configuración ya existe, tenga o no `git.flow`, o se pasa `--git-flow`, ENTONCES `init` no pregunta el flujo ni lo detecta, y solo `--git-flow` lo cambia.
- AC6: CUANDO un proyecto nuevo termina `init` sin flujo de git ENTONCES la salida avisa de que las ramas serán `specty/<id>` hasta elegirlo con `--git-flow`, y su SIGUIENTE pide preguntárselo al usuario y ejecutar `init --git-flow <flujo>`.
- AC7: CUANDO se lee ARCHITECTURE §14 ENTONCES dice cómo detecta `init` el flujo, cuándo lo pregunta y qué pasa en un proyecto nuevo sin él.

## Diseño

- Core, `cards/init.ts`:
  - `flowQuestion(detected, lang)` y `flowChoices(detected, lang)`: los cuatro flujos con el nombre de sus ramas (`FLOW_BRANCHES`), el detectado primero y con «detectado»; sin él, Specty, GitHub Flow, Git Flow y trunk.
  - `noFlowWarning(command, lang)` para el proyecto nuevo sin flujo.
  - `InitView.chooseFlow`: `newProjectNext` añade a su SIGUIENTE elegir el flujo con `init --git-flow <flujo>`.
- CLI, `install/git-flow.ts`:
  - `detectFlow(git)`: lee `gitflow.branch.develop` y las ramas locales y remotas (sin el nombre del remoto) y aplica el orden de AC2.
  - `flowToWrite(...)`: el de `--git-flow`; nada en una configuración que ya existe; al crearla, la respuesta de la persona o, si cancela o no hay persona, el detectado. Dice también si el repositorio acaba con flujo.
  - `noFlowWarnings(...)`: el aviso cuando `init` escribió `PRODUCT.md` (un proyecto nuevo) y no hay flujo.
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
- modificar packages/cli/test/new-project.test.ts — el SIGUIENTE de un proyecto nuevo pide elegir el flujo (R1)
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
- [x] T3: ARCHITECTURE dice cómo elige init el flujo de git
  - files: docs/ARCHITECTURE.md
  - ac: AC7
  - type: docs
- [x] T4: detectFlow deja de exportarse
  - files: packages/cli/src/install/git-flow.ts
  - ac: AC2
  - verify: pnpm knip
  - type: refactor

## Riesgos

- R1: Siete tests que ya existían notan la pregunta o el SIGUIENTE nuevos, y el usuario aprobó ajustarlos (2026-10-27): cuatro comparan la lista exacta de preguntas u opciones (`init-agents.test.ts` AC1 y AC2, `init-language.test.ts` AC1 dos veces), dos comprueban con una terminal que falla ante cualquier pregunta que `--tools` o `--language` no preguntan nada (`init-agents.test.ts` AC6, `init-language.test.ts` AC2), y uno espera el SIGUIENTE exacto de un proyecto nuevo de un agente (`new-project.test.ts` AC2, ampliación S1). Mitigación: a las listas solo se añade la pregunta del flujo; los dos de «nada» pasan `--git-flow specty`, así siguen sin preguntar nada; y el de `new-project` espera el SIGUIENTE de AC6. La persona de prueba responde la primera opción, la de Specty, así que lo que instalan no cambia.
- R2: Otros tests que ejecutan `init` con una persona y después `new`. Mitigación: con la de Specty primero, sus ramas siguen siendo `specty/<id>`; la suite completa lo comprueba.

## Cierre

### Resumen

Al crear `.specty/config.yaml`, `init` detecta el flujo de git del repositorio (Git Flow por la configuración de git-flow, `develop` o sus prefijos; GitHub Flow por ramas con un tipo de commit; el de Specty por `specty/`) y, con una persona en la terminal, se lo pregunta tras los agentes, con el detectado primero y marcado o, sin detección, con el de Specty primero. Si cancela o nadie puede responder, se queda el detectado. En una configuración que ya existe no pregunta ni detecta: el flujo se cambia con `--git-flow`. Un proyecto nuevo que acaba sin flujo lo avisa, y su SIGUIENTE pide preguntárselo al usuario. ARCHITECTURE §14 lo describe.

### Desviaciones

- La revisión 1 preguntaba también en una configuración que ya existía sin `git.flow`. Eso rompía un octavo test (repetir `init` no toca nada) y preguntaba en cada `init` de las instalaciones existentes, así que el usuario decidió preguntar solo al crear la configuración, como el idioma. La revisión 2 corrige AC1, AC5, A2 y el diseño.
- El aviso de proyecto nuevo sin flujo depende de que `init` escriba `PRODUCT.md`, no solo de que no haya código: un repositorio con `PRODUCT.md` y sin código no es nuevo para `init`, como ya decía un test de `new-project.test.ts`.
- Siete tests que ya existían se ajustaron con permiso del usuario (R1); `new-project.test.ts` entró por la ampliación S1.
- La primera verificación completa falló en knip: `detectFlow` solo se usa en su archivo; T4 le quita el `export`. Otra falló por `test/server/verify.test.ts:85`, ajeno al cambio (leyó la auditoría antes de que se escribiera la verificación); al repetirla pasó, y `pnpm check` pasó entero.

### Decisiones

- La pregunta va tras la de los agentes y antes de la entrevista, porque el flujo se escribe en `config.yaml` antes que `PRODUCT.md`.
- Elegir «Specty» escribe `git.flow: specty`.

### Pendientes

- `test/server/verify.test.ts:85` es intermitente: lee la auditoría antes de que el servidor escriba `change.verified`. Conviene esperar a esa línea en un cambio aparte.
- Probar a mano la pregunta del flujo en una terminal real con el CLI compilado, junto con la de los agentes del cambio 1.
