---
kind: standard
---

# Un borrador demasiado grande pasa a épica sin cancelarlo

## Objetivo

Hoy, cuando `propose` rechaza un borrador estándar por demasiado grande, no hay forma de convertirlo en épica en su sitio (P354). Ningún comando cambia el `kind` del estado. Si se pone `kind: epic` en el frontmatter, `propose` lo valida como épica, pero `approve` lo aprueba como estándar sin tareas y el cambio pasa directo a aceptación. Solo queda cancelarlo y rehacerlo, y se pierden su petición literal y lo que resuelve. Con este arreglo, mientras el cambio no se ha aprobado nunca, `propose` toma el tipo del frontmatter: el borrador pasa a épica (o de quick a standard, como ya pide el error del carril quick) conservando su id, su carpeta, su rama, su petición y las entradas de la memoria que toma. Tras la primera aprobación, el tipo queda fijo y un frontmatter con otro se rechaza.

## Fuera de alcance

- Un comando aparte para cambiar el tipo: basta con el frontmatter y `propose`.
- Renombrar la rama, la carpeta o el id del cambio al cambiar de tipo.
- La pestaña Historial de la UI: la línea de la propuesta no muestra aún el cambio de tipo, aunque la auditoría lo lleve (A6).
- Convertir el borrador `20261108-interruptor-para-encender-y-apagar-el-flujo-de`, que espera este arreglo: se hará después, con el arreglo en main.
- Rechazar aparte que el esqueleto de un proyecto nuevo pase a quick: `new` ya lo crea standard, y el límite de archivos del carril quick lo frena.

## Supuestos

- A1: El tipo cambia al proponer. Antes de la primera aprobación (en `draft`, o en `review` sin revisión aprobada, también tras pedir cambios la persona), `propose` guarda en el estado el `kind` del frontmatter y usa ese tipo en la transición. No hace falta un comando nuevo: el agente ya edita el frontmatter, y la persona ve el tipo al revisar la spec.
  - impacto: alto
- A2: El cambio de tipo vale entre `quick`, `standard`, `spike` y `epic`. Nunca va hacia ni desde `retro`, que crea `specty retro` sobre código ya hecho. El corte de una épica (con `epic` en el frontmatter) tampoco pasa a épica, porque un corte no puede serlo.
  - impacto: alto
- A3: Tras la primera aprobación, el tipo queda fijo: un frontmatter con otro `kind` es un error de `propose`, en `adjusting`, en la revisión de un ajuste y en `closing`. Es la otra mitad de P354: el frontmatter y el estado no vuelven a contradecirse.
- A4: La validación recibe el tipo del estado en un campo nuevo, `kind`, del contexto. Sin él (la UI valida sin estado), la regla no comprueba nada.
- A5: La auditoría anota el cambio en el `spec.proposed` de esa propuesta, con `kind` (el nuevo) y `previousKind` (el que tenía), sin un evento nuevo. `change.created` conserva el tipo con el que se creó. `specty audit` lo muestra en la línea de la propuesta.
- A6: La pestaña Historial de la UI no cambia en este cambio; queda como pendiente en la memoria.
- A7: La rama conserva su nombre, aunque `git.flow` o `git.branchPattern` nombren distinto una spike.

## Criterios de aceptación

- AC1: CUANDO el borrador de un cambio estándar sin aprobar lleva `kind: epic` y sus cortes, y el agente ejecuta `specty propose` ENTONCES el cambio pasa a épica en su sitio: su estado dice `kind: epic` y la propuesta queda en revisión, con el mismo id, carpeta y rama.
- AC2: CUANDO la persona aprueba ese cambio ENTONCES se aprueba como épica: pasa a `implementing` a la espera de sus cortes, en lugar de ir a aceptación sin tareas.
- AC3: CUANDO el borrador pasa a épica ENTONCES conserva su petición literal y las entradas de la memoria que toma: `specty memory` las sigue dando tomadas por ese cambio y `change.created` no cambia.
- AC4: CUANDO un borrador cambia de tipo al proponerse ENTONCES su `spec.proposed` anota `kind` y `previousKind`, y `specty audit` muestra en la línea de esa propuesta de qué tipo a qué tipo pasó.
- AC5: CUANDO un cambio ya aprobado se propone con otro `kind` en el frontmatter ENTONCES `propose` lo rechaza con `kind-fixed`, que pide volver a poner el suyo, y el estado no cambia.
- AC6: CUANDO una retro se propone con otro `kind`, o un borrador se propone como `retro`, ENTONCES `propose` lo rechaza con `kind-fixed`.
- AC7: CUANDO el corte de una épica se propone con `kind: epic` ENTONCES `propose` lo rechaza con `slice-epic`.
- AC8: CUANDO `propose` rechaza un cambio por demasiado grande (`split-required`) ENTONCES el mensaje dice cómo pasarlo a épica en la misma spec: `kind: epic`, «Cortes» en lugar de «Archivos» y «Tareas», y otra vez `propose`, que conserva su petición y lo que resuelve.
- AC9: CUANDO un borrador quick que no cabe en su carril se propone con `kind: standard` ENTONCES el cambio pasa a standard.

## Diseño

- Core: `ValidationContext` gana `kind?: ChangeKind`, el tipo del cambio en su estado. La regla `checkKind` (en `validate/phase.ts`, junto a las que miran la historia del cambio) da `slice-epic` si el frontmatter dice `kind: epic` y trae `epic`, siempre que difiera del estado. Da `kind-fixed` si difiere del estado y el cambio tiene una revisión aprobada (`ctx.approved`) o uno de los dos tipos es `retro`. Su mensaje dice el motivo y pide volver a poner `kind: <el del estado>`. `split-required` explica cómo pasar a épica en la misma spec.
- CLI: `analyzeChange` pasa `kind: state.kind`. `propose`, con la spec válida, usa el `kind` del frontmatter en la transición y en el nuevo estado; si difiere del anterior, añade a `spec.proposed` `kind` y `previousKind`. La línea de `spec.proposed` en `cards/audit.ts` añade el paso, como «(de standard a epic)», cuando los trae.
- Documentación: formats.md §2 (la regla), §3 (`kind` del estado) y §4 (`spec.proposed`), y ARCHITECTURE.md §11 «Dividir», que dice cómo pasa a épica un borrador demasiado grande.

## Archivos

- modificar packages/core/src/validate/context.ts — `kind`: el tipo del cambio en su estado
- modificar packages/core/src/validate/phase.ts — la regla `checkKind`: `kind-fixed` y `slice-epic`
- modificar packages/core/src/validate/index.ts — registra `checkKind`
- modificar packages/core/src/spec/diagnostics.ts — los códigos `kind-fixed` y `slice-epic`
- modificar packages/core/src/spec/messages.es.ts — sus mensajes, y cómo pasar a épica en `split-required`
- modificar packages/core/src/spec/messages.en.ts — lo mismo en inglés
- crear packages/core/test/validate/kind.test.ts — la regla y los mensajes
- modificar packages/cli/src/flow/analysis.ts — pasa a la validación el tipo del estado
- modificar packages/cli/src/commands/propose.ts — guarda el tipo del frontmatter en el estado y lo anota en `spec.proposed`
- modificar packages/core/src/cards/audit.ts — la línea de `spec.proposed` dice el cambio de tipo
- crear packages/cli/test/kind-change.test.ts — el paso a épica y a standard de punta a punta, la aprobación, la auditoría y el rechazo tras aprobar
- modificar docs/formats.md — §2, §3 y §4
- modificar docs/ARCHITECTURE.md — §11 «Dividir»: pasar a épica en su sitio

## Tareas

- [x] T1: La validación fija el tipo tras la primera aprobación, en una retro y en un corte, y `split-required` dice cómo pasar a épica
  - files: packages/core/src/validate/context.ts, packages/core/src/validate/phase.ts, packages/core/src/validate/index.ts, packages/core/src/spec/diagnostics.ts, packages/core/src/spec/messages.es.ts, packages/core/src/spec/messages.en.ts, packages/core/test/validate/kind.test.ts
  - ac: AC5, AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/kind.test.ts test/validate/quality.test.ts test/validate/split-slice.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
  - type: fix
- [x] T2: `propose` cambia el tipo de un borrador sin aprobar y lo anota en la auditoría
  - files: packages/cli/src/flow/analysis.ts, packages/cli/src/commands/propose.ts, packages/core/src/cards/audit.ts, packages/cli/test/kind-change.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4, AC5, AC9
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/kind-change.test.ts test/audit.test.ts && pnpm typecheck && pnpm lint
  - type: fix

## Riesgos

- R1: Un agente podría pasar un borrador a quick para saltarse la fase de cierre — la persona aprueba la spec, que muestra el `kind`; la auditoría anota el cambio; y el carril quick valida sus límites como siempre.

## Cierre

### Resumen

Un borrador que `propose` rechaza por demasiado grande ya pasa a épica en su sitio, sin cancelarlo (P354). Mientras el cambio no se ha aprobado nunca, `propose` toma el `kind` del frontmatter, lo usa en la transición y lo guarda en el estado, así que `approve` lo aprueba como épica y pasa a `implementing` a la espera de sus cortes, en lugar de ir a aceptación sin tareas. Conserva su id, su carpeta, su rama, su petición literal y las entradas de la memoria que toma. `spec.proposed` anota `kind` y `previousKind`, y `specty audit` lo muestra como «(de standard a epic)». Lo mismo vale de quick a standard, como ya pedía el error del carril quick. La validación recibe el tipo del estado (`ValidationContext.kind`) y su regla `checkKind` da `kind-fixed` tras la primera aprobación o si uno de los dos tipos es retro, y `slice-epic` si un corte pasa a épica. El mensaje de `split-required` dice cómo pasar a épica en la misma spec. Documentado en formats.md §2, §3 y §4 y en ARCHITECTURE.md §11.

### Desviaciones

- Ninguna.

### Decisiones

- El tipo cambia con el frontmatter y `propose`, sin un comando nuevo: el agente ya edita la spec y la persona ve el tipo al revisarla.
- La auditoría lo anota en el `spec.proposed` de esa propuesta, sin un evento nuevo, y `change.created` conserva el tipo con el que se creó.
- Sin el tipo del estado, como en la UI, que valida sin él, la regla no comprueba nada.

### Pendientes

- La pestaña Historial de la UI aún no muestra el cambio de tipo de una propuesta (P377).
