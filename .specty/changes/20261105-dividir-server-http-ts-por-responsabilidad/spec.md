---
kind: quick
---

# Dividir server/http.ts por responsabilidad

## Objetivo

`packages/cli/src/server/http.ts` tiene 303 líneas de código, por encima del aviso de 300 (P163), porque mezcla el arranque del servidor con toda la API. Las lecturas (`GET /api/...`) y las acciones de la persona (`POST /api/...`), con sus comprobaciones de origen, sesión y CSRF, pasan a `server/api.ts`; lo que comparten todas las respuestas (el contexto de cada petición, `send`, las cabeceras seguras y las comprobaciones de host y cookie) pasa a `server/context.ts`, para que ninguno de los dos importe del otro. `http.ts` se queda con arrancar y escuchar, enrutar cada petición, el inicio de sesión con el enlace y servir la UI. No cambia ninguna ruta, respuesta ni cabecera, y los tests del servidor no cambian.

## Archivos

- modificar packages/cli/src/server/http.ts — se queda con el arranque, el enrutado, el inicio de sesión y la UI
- crear packages/cli/src/server/api.ts — las lecturas y las acciones de la API, con sus comprobaciones
- crear packages/cli/src/server/context.ts — el contexto de cada petición y lo que comparten las respuestas

## Tareas

- [x] T1: La API y lo compartido salen de server/http.ts
  - files: packages/cli/src/server/http.ts, packages/cli/src/server/api.ts, packages/cli/src/server/context.ts
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/server test/server.test.ts test/server-holds.test.ts test/server-restore.test.ts
  - type: refactor
