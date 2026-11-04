---
kind: standard
epic: 20261104-epicas-y-features-con-subagentes
slice: C2
---

# La tarjeta de una épica reparte sus cortes listos entre subagentes

## Objetivo

Hoy la tarjeta de una épica aprobada propone empezar un corte cada vez, en la misma sesión, aunque su herramienta pueda lanzar subagentes. Con este corte, si la herramienta detectada reparte cortes en subagentes (Claude Code, desde C1) y `subagents` de `.specty/config.yaml` no lo apaga, la tarjeta trae un encargo por cada corte listo o huérfano y pide lanzar un subagente por encargo, en paralelo, mientras la sesión principal se queda en la épica. Sin esa capacidad, o con `subagents: false`, la tarjeta es la de hoy.

## Fuera de alcance

- Que el guard bloquee a un subagente que usa `EnterWorktree` o `specty new` sin `--subagent` (P81): lo hace otro cambio a la vez.
- Repartir los cortes con Codex, OpenCode o Cursor: la tarjeta lo hará sola cuando sus cortes (C6, C7 y C8) pongan su capacidad en «sí».
- Medir el tiempo y el coste de una épica con subagentes (C10).
- Que `init` escriba la clave `subagents`: sin ella vale `true`.
- Repartir entre subagentes las tareas de un cambio, también las de un corte (decisión de la persona, 2026-11-04).

## Supuestos

- A1: Un corte en curso es huérfano con la regla de `status` (ADR 0016): su cambio espera al agente y nadie dio un paso en su carpeta ni escribió su estado en `memory.orphanAfterMin` minutos (60 por defecto). Los pasos de un subagente atado a la carpeta de su corte se anotan en esa carpeta (C1), así que su corte no sale huérfano mientras trabaja.
  - impacto: alto
- A2: La tarjeta sabe la herramienta por el entorno del comando (`CLAUDECODE=1` en Claude Code), así que la ve así la sesión principal que ejecuta `specty next` en la épica; la persona que lo ejecuta en su terminal ve la de hoy.
- A3: El encargo de un corte listo no puede nombrar el id ni la carpeta de su cambio, que aún no existen: el subagente los lee en la salida de `specty new` y de `specty enter`. El de un corte huérfano sí los nombra.
- A4: Los cortes de una misma épica no se duplican entre sí aunque sus títulos se parezcan, porque `new` rechaza un corte que ya tiene un cambio.
- A5: Varios `specty new` a la vez no chocan en git (R5 de la épica): el 2026-11-04, 20 `specty new --subagent` simultáneos, en 5 rondas de 4 en un repositorio temporal, crearon todos su carpeta y su rama.

## Criterios de aceptación

- AC1: CUANDO una épica aprobada tiene cortes listos, la herramienta detectada reparte cortes en subagentes y `subagents` no está en `false` ENTONCES la tarjeta de la épica trae un encargo por cada corte listo, también si solo hay uno, y su SIGUIENTE pide lanzar en paralelo, en un solo mensaje, un subagente por encargo con su texto tal cual, y volver a ejecutar `specty next` en la épica cuando terminen.
- AC2: CUANDO la tarjeta trae el encargo de un corte listo ENTONCES el encargo pide, en este orden: crear su cambio con `specty new "<título>" --epic <épica> --slice <corte> --subagent`, entrar con `specty enter` con el id que dé `new`, empezar cada comando con `cd '<carpeta del cambio>' &&` y usar rutas absolutas de esa carpeta, seguir `specty next` hasta cerrarlo con sus tareas en orden y sin lanzar otros subagentes, ejecutar `specty wait` cuando espere a la persona y responder en tres líneas: el cambio, su fase y lo que falta.
- AC3: CUANDO no se detecta ninguna herramienta, la detectada no reparte cortes en subagentes o `.specty/config.yaml` tiene `subagents: false` ENTONCES la tarjeta de la épica es la de hoy, sin encargos.
- AC4: CUANDO se cierra un corte y deja listo otro, o un corte en curso se queda huérfano ENTONCES la tarjeta de la épica trae el encargo de empezar el nuevo, o el de retomar el huérfano: el mismo desde `specty enter`, con el id y la carpeta de su cambio.
- AC5: CUANDO un corte en curso no es huérfano ENTONCES sale en curso, sin encargo, y si no queda ningún encargo el SIGUIENTE pide esperar los informes de los subagentes y volver a ejecutar `specty next` en la épica, sin ir a la carpeta de ningún corte.
- AC6: CUANDO el cambio no es una épica (una feature suelta o el corte de una épica) ENTONCES ninguna de sus tarjetas pide lanzar subagentes, aunque la herramienta los reparta, y sus tareas van en orden como hoy.
- AC7: CUANDO varios subagentes crean a la vez los cambios de cortes de una misma épica, aunque sus títulos se parezcan ENTONCES cada `specty new --subagent` crea el suyo, con su carpeta y su rama, sin que el freno de duplicados lo pare.
- AC8: CUANDO una épica de 9 cortes tiene 6 listos, con títulos largos ENTONCES su tarjeta con los encargos no pasa de unos 1.500 tokens, ni en español ni en inglés.
- AC9: CUANDO `.specty/config.yaml` no trae la clave `subagents` ENTONCES vale `true`, y con un valor que no es `true` ni `false` la configuración no es válida.

## Diseño

- La épica reparte cuando `AGENT_CAPABILITIES[ctx.tool].subagentSlices` está en «sí» y `ctx.subagents` no es `false` (`cards/epic.ts`). `CardContext` gana `subagents`, que la CLI toma de `config.subagents`; sin herramienta detectada no reparte. Así, cuando C6, C7 y C8 pongan su herramienta en «sí», la tarjeta reparte también allí sin tocarla.
- Configuración: `subagents` (`true` por defecto) en `ResolvedConfig`, con `z.boolean()` en el esquema.
- Cortes huérfanos: `SliceView.child` gana `orphan`. La CLI marca los hijos en curso que `openChanges` (la lista de `status`) da por huérfanos, solo para la vista de una épica con algún corte en curso (`flow/epic.ts`, que usa `flow/views.ts`).
- La tarjeta, con reparto:
  - tras «CORTES», un bloque por encargo: «ENCARGO C2» para un corte listo y «ENCARGO C3 (huérfano)» para uno huérfano; los cortes en curso que no son huérfanos no lo tienen;
  - el encargo de un corte listo tiene una línea de entrada y 5 pasos numerados (AC2); el de un huérfano, los mismos desde `specty enter <id>`, con la carpeta de su cambio citada como la cita el guard (`'` pasa a `'\''`), para que el comando que pide sea el que el guard acepta;
  - SIGUIENTE: con encargos, lanzarlos en paralelo y volver a `specty next` en la épica; sin encargos y con cortes en curso, esperar los informes de los subagentes; sin nada en curso, el de hoy (todos cerrados, o ninguno puede empezar).
- Sin reparto, la tarjeta no cambia: la misma lista y el mismo SIGUIENTE, que va al corte en curso o empieza el primero listo.
- El freno de duplicados (`flow/duplicates.ts`) no compara el corte que se crea con los cambios abiertos de otros cortes de su misma épica, como ya no lo compara con la épica.
- Documentos: ARCHITECTURE §5 (la fila de `epic`), §6 (el freno de duplicados en `new`), §7 (la tarjeta de una épica y su presupuesto), §10 (los subagentes) y §16 (una épica sí reparte, a pesar del coste medido), formats §6 (`subagents`) y el glosario con «Encargo».

## Archivos

- modificar packages/core/src/cards/epic.ts — los encargos y el SIGUIENTE de una épica que reparte sus cortes
- modificar packages/core/src/cards/view.ts — `subagents` en el contexto de las tarjetas y el corte huérfano en `SliceView`
- modificar packages/core/src/schema/config.ts — la clave `subagents`, `true` por defecto
- modificar packages/cli/src/session.ts — pasa `subagents` a las tarjetas
- modificar packages/cli/src/flow/duplicates.ts — un corte no se compara con los otros cortes de su épica
- modificar packages/cli/src/flow/epic.ts — marca los cortes en curso huérfanos
- modificar packages/cli/src/flow/views.ts — la vista de una épica trae sus cortes huérfanos
- modificar packages/core/test/cards/epic.test.ts — la tarjeta con encargos, sin ellos y la de un cambio que no es una épica
- modificar packages/core/test/cards/budget.test.ts — el presupuesto de la tarjeta con encargos
- modificar packages/core/test/schema/schema.test.ts — la clave `subagents`
- crear packages/cli/test/epic-subagents.test.ts — una épica con Claude Code: sus encargos, `subagents: false`, sus cortes huérfanos y los cortes hermanos creados a la vez

## Tareas

- [x] T1: La tarjeta de una épica reparte sus cortes listos y huérfanos entre subagentes
  - files: packages/core/src/cards/epic.ts, packages/core/src/cards/view.ts, packages/core/test/cards/epic.test.ts, packages/core/test/cards/budget.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/epic.test.ts test/cards/budget.test.ts && pnpm typecheck
- [x] T2: La clave `subagents` de config.yaml apaga el reparto
  - files: packages/core/src/schema/config.ts, packages/cli/src/session.ts, packages/core/test/schema/schema.test.ts
  - ac: AC3, AC9
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/schema.test.ts && pnpm typecheck
- [x] T3: Los cortes de una épica no se frenan entre sí como duplicados
  - files: packages/cli/src/flow/duplicates.ts, packages/cli/test/epic-subagents.test.ts
  - ac: AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic-subagents.test.ts -t AC7
- [ ] T4: La épica marca sus cortes huérfanos para darles un encargo
  - files: packages/cli/src/flow/epic.ts, packages/cli/src/flow/views.ts, packages/cli/test/epic-subagents.test.ts
  - ac: AC1, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic-subagents.test.ts && pnpm typecheck

## Riesgos

- R1: La tarjeta crece con los encargos (R7 de la épica): unos 150 tokens cada uno, con títulos largos. Mitigación: encargos de seis líneas que remiten a `specty next`, y el test de presupuesto con 6 cortes listos (AC8); con más de 7 a la vez, la tarjeta pasa de 1.500 tokens.
- R2: Hasta P81, un subagente que use `EnterWorktree` o `new` sin `--subagent` movería a la sesión principal. Mitigación: el encargo trae los comandos exactos, y P81 va en otro cambio a la vez.
- R3: Otros cambios abiertos a la vez (C6, C7, C8 y P81) tocan archivos cercanos. Mitigación: `propose` avisa de los archivos compartidos, y al cerrar los conflictos van a `specty integrate`.
- R4: Si un subagente responde sin cerrar su corte y este sigue esperando al agente, el corte sale en curso, sin encargo, hasta que queda huérfano (60 minutos). Mitigación: su informe dice la fase y lo que falta, y la sesión principal se lo cuenta a la persona.
