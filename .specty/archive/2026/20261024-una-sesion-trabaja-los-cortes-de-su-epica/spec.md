---
kind: standard
follows:
  - 20261024-las-epicas-guian-por-sus-cortes
---

# Una sesión trabaja los cortes de su épica

## Objetivo

La regla «una sesión, una worktree» ata una sesión a la carpeta de su cambio mientras siga abierto. Una épica sigue abierta hasta que se cierran todos sus cortes, así que la sesión que la lleva no puede entrar en la carpeta de ninguno: la otra sesión tuvo que cancelar su épica por eso. Ahora una sesión atada a una épica abierta puede entrar en la carpeta de un corte de esa épica, y desde entonces queda atada al corte, como con cualquier cambio.

## Fuera de alcance

- Volver a la carpeta de la épica, o entrar en otro corte, con el corte aún abierto.
- Trabajar dos cortes a la vez en la misma sesión.

## Supuestos

- A1: Un cambio es un corte de la épica si su spec la nombra en `epic`. Se mira el cambio abierto de la carpeta de destino.
- A2: Al entrar en el corte, la sesión queda atada a él, como ya pasa al entrar en cualquier carpeta; al cerrarse el corte queda libre y puede volver a la épica para seguir con el siguiente.

## Criterios de aceptación

- AC1: CUANDO una sesión atada a una épica abierta entra en la carpeta de un corte de esa épica ENTONCES el guard lo permite, y la sesión queda atada al corte.
- AC2: CUANDO esa sesión, con el corte aún abierto, intenta entrar en la carpeta de la épica o en la de otro cambio ENTONCES el guard lo rechaza como hasta ahora; con el corte cerrado, vuelve a la épica.
- AC3: CUANDO una sesión atada a un cambio que no es esa épica intenta entrar en un corte ENTONCES el guard lo rechaza como hasta ahora.
- AC4: CUANDO alguien lee ARCHITECTURE §10 ENTONCES encuentra la excepción de los cortes.

## Diseño

- Core: la acción `enter` de `decideGuard` lleva `epic`, la épica del cambio de destino, y `sessionDenial` deja entrar cuando es el cambio al que está atada la sesión.
- CLI, `enforce/sessions.ts`: `enterAction` lee la spec del cambio abierto de la carpeta de destino para saber su `epic`.

## Archivos

- modificar packages/core/src/guard/session.ts — la excepción del corte
- modificar packages/core/src/guard/decide.ts — `epic` en la acción `enter`
- modificar packages/core/test/guard/decide.test.ts — la excepción y sus límites
- modificar packages/cli/src/enforce/sessions.ts — la épica del cambio de destino
- modificar packages/cli/test/sessions.test.ts — de la épica al corte y de vuelta, de punta a punta
- modificar docs/ARCHITECTURE.md — §10

## Tareas

- [x] T1: El guard deja entrar en un corte de la épica de la sesión
  - files: packages/core/src/guard/session.ts, packages/core/src/guard/decide.ts, packages/core/test/guard/decide.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/decide.test.ts
- [x] T2: La CLI sabe de qué épica es el cambio de destino
  - files: packages/cli/src/enforce/sessions.ts, packages/cli/test/sessions.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check

## Cierre

### Resumen

La sesión que lleva una épica ya puede trabajar sus cortes. Al entrar en una worktree, `enterAction` lee la spec del cambio abierto de esa carpeta y pasa su `epic` al guard, y `sessionDenial` deja entrar si es la épica a la que está atada la sesión. Desde ese momento la sesión queda atada al corte: no vuelve a la épica ni entra en otro cambio hasta que el corte se cierra. El test de punta a punta recorre la épica, su corte, otra sesión que no entra, y la vuelta a la épica con el corte terminado. ARCHITECTURE §10 cuenta la excepción.

### Desviaciones

- Ninguna.

### Decisiones

- La relación se mira en el destino (la spec del corte nombra la épica), no en la épica: así basta con el cambio abierto de la carpeta, sin buscar los cortes.

### Pendientes

- Ninguno.
