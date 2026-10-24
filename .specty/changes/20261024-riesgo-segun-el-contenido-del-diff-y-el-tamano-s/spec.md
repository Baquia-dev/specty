---
kind: standard
---

# Riesgo según el contenido del diff, y el tamaño solo sube

## Objetivo

`task done` busca en el diff real de cada tarea patrones de riesgo conocidos (verificación TLS desactivada, `eval`, deserialización insegura, `shell=True`, hashes débiles, CORS abierto, permisos para todos, secretos en el código, HTML sin escapar), archivos que pasan a ser ejecutables y rutas de pagos, webhooks o seguridad, y lo avisa como ya avisa de las aserciones quitadas: en su salida, en la auditoría y al aceptar. Además, el modelo ya no puede bajar el tamaño de un cambio: hoy `estimate.adjust: -1` baja el nivel, y con él un XL podía esquivar la división en una épica.

## Fuera de alcance

- Mostrar los riesgos en la pestaña Aceptación de la UI: es el punto A7 de la sesión de la UI, con el dato de la auditoría.
- Bloquear `task done` o `accept` por un riesgo: es un aviso.
- Que la persona confirme una bajada de tamaño: si lo pide, irá en otro cambio.
- Que las rutas de riesgo nunca se aprueben solas en `scope add`: las sensibles de la configuración ya no se aprueban solas.

## Supuestos

- A1: Solo cuentan las líneas añadidas de archivos gobernados que no son tests, con los archivos nuevos de la tarea incluidos: el diff va del commit base de la tarea a un árbol con el trabajo actual (`treeWith`), así que no hace falta preparar nada en el índice.
  - impacto: alto
- A2: Cada regla del catálogo tiene un id, su CWE, un patrón de una línea y, si es de un lenguaje, las extensiones donde aplica; los patrones son conservadores y es mejor un aviso de más que uno de menos, porque no bloquean.
  - impacto: medio
- A3: Las rutas de riesgo son las que tienen un segmento `payment(s)`, `billing`, `checkout`, `webhook(s)`, `security`, `crypto` o `secrets`; las de autenticación ya son sensibles en la configuración por defecto.
- A4: Un `adjust: -1` no se aplica, y el tamaño lo dice en sus razones («ajuste del modelo (-1) sin aplicar: el tamaño solo puede subir»), visible en `propose` y en la UI; la spec sigue siendo válida, para no bloquear cambios en curso.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO se analiza un diff ENTONCES cada línea añadida que coincide con una regla da su archivo, su línea, la regla y su CWE; un archivo que pasa a modo 755 y uno en una ruta de riesgo dan su aviso; los tests y las líneas quitadas no dan nada.
- AC2: CUANDO `task done` completa una tarea con riesgos, en archivos nuevos o modificados ENTONCES su salida los avisa, `task.completed` guarda `risks`, y la tarjeta de aceptación y la nota de `specty accept` los muestran por tarea; sin riesgos, nada cambia.
- AC3: CUANDO la spec trae `estimate.adjust: -1` ENTONCES el nivel es el calculado y las razones dicen que el ajuste no se aplicó; con `+1` sube como hoy.
- AC4: CUANDO un cambio es XL por su puntuación y su spec intenta bajarlo con `-1` ENTONCES `propose` sigue pidiendo dividirlo.
- AC5: CUANDO alguien lee ARCHITECTURE y formats.md ENTONCES encuentra el catálogo de riesgos, el dato `risks` de `task.completed` y que el ajuste del modelo solo sube.

## Diseño

- Core, `scope/risk.ts`: el catálogo y `contentRisks(diff)`, que lee un diff unificado con `-U0` y devuelve `{ path, rule, cwe?, line? }`, con el texto de cada regla en los dos idiomas. Se salta los tests.
- Core, tarjetas: `TaskView.risks` y `riskWarnings`, junto a `assertionWarnings`, en el bloque AVISOS de la aceptación.
- CLI, `flow/risk.ts`: el árbol con el trabajo actual de los archivos gobernados de la tarea (`git.treeWith`) y `git diff -U0 -M <base> <árbol>`; `task done` lo analiza tras verificar, como las aserciones; `changeView` lee `risks` de la auditoría; `accept` los añade a su nota.
- Core, `sizing/size.ts`: `computeSize` solo aplica `adjust: 1`; un `-1` queda como razón `adjusted` con la marca de no aplicado.

## Archivos

- crear packages/core/src/scope/risk.ts — el catálogo y los riesgos de un diff
- crear packages/core/test/scope/risk.test.ts — reglas, modos, rutas, tests y líneas quitadas
- modificar packages/core/src/index.ts — exportar lo nuevo
- modificar packages/core/src/cards/view.ts — `TaskView.risks`
- modificar packages/core/src/cards/work.ts — los riesgos en los avisos de aceptación
- modificar packages/core/test/cards/tests.test.ts — los avisos de riesgo
- crear packages/cli/src/flow/risk.ts — el diff de la tarea con sus archivos nuevos
- modificar packages/cli/src/commands/task.ts — avisar y anotar los riesgos
- modificar packages/cli/src/flow/views.ts — leer los riesgos de la auditoría
- modificar packages/cli/src/commands/accept.ts — los riesgos en la nota de la persona
- crear packages/cli/test/risk.test.ts — de punta a punta
- modificar packages/core/src/sizing/size.ts — el ajuste del modelo solo sube
- modificar packages/core/test/sizing/sizing.test.ts — `-1` sin aplicar y el XL que no se esquiva
- modificar docs/ARCHITECTURE.md — §7 y §11: el riesgo de contenido y el ajuste que solo sube
- modificar docs/formats.md — §1 `estimate` y §4 `risks`

## Tareas

- [x] T1: Los riesgos de un diff
  - files: packages/core/src/scope/risk.ts, packages/core/test/scope/risk.test.ts, packages/core/src/index.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/scope
- [x] T2: Los riesgos en las tarjetas
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/work.ts, packages/core/test/cards/tests.test.ts, packages/core/src/index.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
- [x] T3: task done avisa de los riesgos y accept los muestra
  - files: packages/cli/src/flow/risk.ts, packages/cli/src/commands/task.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/accept.ts, packages/cli/test/risk.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/risk.test.ts test/assertions.test.ts
- [ ] T4: El tamaño solo sube, y documentarlo todo
  - files: packages/core/src/sizing/size.ts, packages/core/test/sizing/sizing.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC3, AC4, AC5
  - verify: pnpm check
