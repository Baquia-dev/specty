---
kind: standard
---

# El modo delegado en la UI

## Objetivo

La persona ve y cambia el modo delegado desde la UI, como pidió: mientras está activo, la cabecera muestra «Modo delegado», para que nunca olvide que su agente decide por ella, y desde ahí lo desactiva; para activarlo, el menú de preferencias (y la paleta de comandos) abre el mismo aviso que `specty delegate on`, en su idioma, y solo se activa si elige «Sí, que decida mi agente». Con el servidor local lo hace con sus rutas del modo delegado; en el prototipo, con los datos de ejemplo.

## Fuera de alcance

- Cambiar qué hace el modo delegado o su aviso (ADR 0010).
- Comentarios, «pedir cambios», la verificación y los diffs desde el servidor.

## Supuestos

- A1: `SpectyData` gana `delegation()` (activo o no, quién y cuándo, y el aviso en los dos idiomas; nada si la fuente no lo sabe) y `setDelegation(on)`; `ServerData` usa `GET` y `POST /api/delegation`, y `FixtureData` lo guarda en memoria.
  - impacto: alto
- A2: El chip de la cabecera solo aparece con el modo activo; la sección del menú de preferencias y el comando de la paleta abren el aviso para activarlo o la confirmación para desactivarlo; si la fuente no sabe del modo delegado, no aparece nada.
  - impacto: alto
- A3: El aviso se muestra tal como lo da la fuente: las líneas que empiezan con «- » son una lista y el texto entre comillas invertidas es código.
- A4: `ServerData` comparte una sola conexión de eventos entre todos los que se suscriben (la Bandeja y el modo delegado), en vez de abrir una por cada uno.

## Criterios de aceptación

- AC1: CUANDO el modo delegado está activo ENTONCES la cabecera muestra «Modo delegado» y, al pulsarlo, un diálogo dice desde cuándo y quién lo activó y permite desactivarlo.
- AC2: CUANDO la persona elige activarlo desde el menú de preferencias o la paleta ENTONCES ve el aviso en su idioma y el modo solo se activa si elige «Sí, que decida mi agente»; si la fuente lo rechaza, un aviso dice por qué.
- AC3: CUANDO la UI corre sobre el servidor local ENTONCES lee el modo delegado de `/api/delegation`, lo cambia con un `POST` con el token CSRF, y se actualiza con los eventos del servidor por una sola conexión.

## Diseño

- `data/records.ts` y `data/source.ts`: el tipo `Delegation` y los dos métodos del contrato.
- `data/server.ts`: `delegation()`, `setDelegation()` y la conexión de eventos compartida; `data/fixtures.ts` con `data/sample-delegation.ts`, y la búsqueda del diff de ejemplo pasa a `data/sample-diffs.ts` para que `fixtures.ts` tenga sitio.
- `app/delegation.ts`: el estado del modo delegado, el chip, la sección del menú, el comando y los dos diálogos; `app/shell.ts` y `app/preferences-menu.ts` los colocan.

## Archivos

- modificar packages/ui/src/data/records.ts — el tipo del modo delegado
- modificar packages/ui/src/data/source.ts — leerlo y cambiarlo en el contrato
- modificar packages/ui/src/data/server.ts — rutas del servidor y eventos compartidos
- modificar packages/ui/src/data/server.test.ts — sus tests
- modificar packages/ui/src/data/fixtures.ts — el modo delegado del prototipo
- crear packages/ui/src/data/sample-delegation.ts — el modo delegado de ejemplo
- modificar packages/ui/src/data/sample-diffs.ts — la búsqueda del diff de ejemplo
- crear packages/ui/src/app/delegation.ts — chip, sección, comando y diálogos
- crear packages/ui/src/app/delegation.test.ts — sus tests
- modificar packages/ui/src/app/shell.ts — el chip en la cabecera
- modificar packages/ui/src/app/preferences-menu.ts — la sección del modo delegado
- modificar docs/ui.md — Armazón: el modo delegado
- modificar docs/ARCHITECTURE.md — §15: el interruptor ya está en la UI

## Tareas

- [x] T1: El modo delegado en las fuentes de datos
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server.test.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/sample-delegation.ts, packages/ui/src/data/sample-diffs.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server.test.ts --include src/data/fixtures.test.ts
- [x] T2: El chip, la sección y los diálogos
  - files: packages/ui/src/app/delegation.ts, packages/ui/src/app/delegation.test.ts, packages/ui/src/app/shell.ts, packages/ui/src/app/preferences-menu.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/app/delegation.test.ts --include src/app/shell.test.ts
- [x] T3: Documentar el modo delegado en la UI
  - files: docs/ui.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

La persona ve y cambia el modo delegado desde la UI. Mientras está activo, la cabecera muestra el chip «Modo delegado» en tono de atención, que abre un diálogo con desde cuándo y quién lo activó y el botón para desactivarlo. El menú de preferencias tiene una sección «Modo delegado» y la paleta el comando «Modo delegado…»: activarlo muestra el aviso de `specty delegate on` en el idioma de la persona (con su lista y su código) y solo se activa con «Sí, que decida mi agente». `SpectyData` gana `delegation()` y `setDelegation()`: `ServerData` usa las rutas del servidor y ahora comparte una sola conexión de eventos entre todos sus suscriptores, y `FixtureData` guarda en memoria el modo delegado de ejemplo.

### Desviaciones

- `shell.test.ts`, test implícito de `shell.ts`, cuenta ahora tres grupos en el menú de preferencias: tema, idioma y modo delegado.

### Decisiones

- El aviso viene de la fuente, en los dos idiomas: con el servidor, de las tarjetas del core, así que la UI no copia el texto; el prototipo lo trae escrito igual en `sample-delegation.ts`.
- El chip solo aparece con el modo activo y la sección del menú solo si la fuente sabe del modo delegado; el estilo de la leyenda de la sección lo pasa el menú, para no duplicarlo ni crear una importación circular.
- `fixtures.ts`, que estaba en 289 líneas, pasó la búsqueda del diff de ejemplo a `sample-diffs.ts` para tener sitio.

### Pendientes

- Comentarios y «pedir cambios» en la revisión, y la verificación completa y los diffs desde la UI con el servidor.
- Ocultar o desactivar los botones de decisión cuando el servidor es de solo lectura.
