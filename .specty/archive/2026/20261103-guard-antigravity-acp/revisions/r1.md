---
kind: standard
---

# El guard ve las herramientas de Antigravity en los editores ACP y protege los hooks de cada agente

## Objetivo

En Zed (y en cualquier editor que hable ACP), Antigravity lee y escribe con `client_view_file`, `client_edit_file` y `client_create_file`, que el guard no reconoce: en Frecu el agente reescribió `.specty/config.yaml`, que está protegido, sin que nada lo frenara. Con este cambio el guard juzga esas tres herramientas como las propias de Antigravity, y protege también los archivos de hooks de Antigravity, Gemini CLI y Devin, para que ningún agente pueda quitarse su guard.

## Fuera de alcance

- Que Antigravity no entre en un cambio cuya carpeta no alcanza (el bloqueo cruzado tras `specty enter`): va en un cambio aparte.
- Proteger los ajustes de permisos o de sandbox (`.codex/config.toml`, `.cursor/sandbox.json`, `.devin/config.json`, `.devin/config.local.json`, `.opencode/opencode.jsonc`): no apagan el guard.
- Probar con Antigravity de verdad: su modelo va por su servidor, y manejarlo desde un script con la cuenta de la persona arriesga que Google la suspenda.

## Supuestos

- A1: En los editores ACP, las únicas herramientas de archivos propias de Antigravity son `client_view_file` (campo `absolute_path`), `client_edit_file` y `client_create_file` (campo `target_file`, con el contenido completo en `code_content`). Sale del servidor ACP 1.4.5 que instala Zed y de las conversaciones de Frecu; sus herramientas nativas (`run_command` y las demás) siguen igual.
  - impacto: alto
- A2: Antigravity pasa por los hooks de `.agents/hooks.json` también sus herramientas `client_*`, con la misma entrada que las nativas (`toolCall.name` y `toolCall.args`), y el matcher con alternativas las selecciona igual que hoy selecciona las demás.
  - impacto: alto
- A3: Proteger los tres archivos de hooks no frena a Specty: `init` y `uninstall` son comandos de Specty, a los que el guard no les hace la foto de antes y después, y la persona los edita a mano.
- A4: `doctor` distingue dos instalaciones antiguas de Antigravity: la de antes de `specty enter` (sin las lecturas) sigue con su aviso de siempre, y la que tiene las lecturas pero no las herramientas `client_*` recibe uno nuevo. Las dos piden `specty init --tools antigravity`.

## Criterios de aceptación

- AC1: CUANDO Antigravity escribe o crea un archivo con `client_edit_file` o `client_create_file` ENTONCES el guard lo juzga como cualquier escritura: deniega `.specty/config.yaml` y lo que está fuera del alcance de la tarea, con el motivo y el SIGUIENTE, y deja pasar lo que la tarea permite.
- AC2: CUANDO una conversación de Antigravity que entró en la carpeta de un cambio lee con `client_view_file` un archivo de fuera de ella ENTONCES el guard lo deniega y le da la misma ruta dentro de esa carpeta, como con `view_file`.
- AC3: CUANDO un agente escribe o borra `.agents/hooks.json`, `.gemini/settings.json` o `.devin/hooks.v1.json` ENTONCES el guard lo deniega como archivo protegido, y el resto de esas carpetas sigue siendo de la persona.
- AC4: CUANDO `.agents/hooks.json` tiene el hook de Specty de antes de este cambio ENTONCES `specty doctor` dice que el guard no ve lo que Antigravity lee y escribe en los editores ACP, pide `specty init --tools antigravity` y sale con 1; tras `init`, el matcher lleva las tres herramientas y el aviso desaparece.

## Diseño

- `agents/antigravity.ts`: el matcher (`TOOLS`) suma `client_view_file|client_edit_file|client_create_file`; `READS` suma `client_view_file` con `absolute_path`; `action` juzga `client_edit_file` y `client_create_file` como escrituras de `target_file`. En `doctor`, un matcher distinto del actual da `antigravity-acp` si ya tenía `view_file` entre sus herramientas, y `enter-outdated` si no.
- Core: la línea de `doctor` `{ code: "antigravity-acp"; file }` en `cards/doctor.ts` y su texto en español e inglés en `cards/doctor-agents.ts`; `guard/spec.ts` suma a `PROTECTED` los tres archivos de hooks.

## Archivos

- modificar packages/cli/src/agents/antigravity.ts — el guard juzga las herramientas `client_*` y `doctor` avisa del hook anterior
- modificar packages/cli/test/antigravity.test.ts — escrituras, lecturas y el aviso de `doctor` con las herramientas ACP
- modificar packages/core/src/cards/doctor.ts — la línea `antigravity-acp`
- modificar packages/core/src/cards/doctor-agents.ts — su texto en español e inglés
- modificar packages/core/src/guard/spec.ts — los hooks de Antigravity, Gemini CLI y Devin, protegidos
- modificar packages/core/test/guard/decide.test.ts — los tres archivos protegidos, al escribir y al borrar
- modificar docs/ARCHITECTURE.md — las herramientas ACP de Antigravity y los archivos protegidos

## Tareas

- [ ] T1: El guard juzga las herramientas ACP de Antigravity, y `doctor` avisa de su hook anterior
  - files: packages/cli/src/agents/antigravity.ts, packages/cli/test/antigravity.test.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts test/antigravity-turn.test.ts test/doctor-enter.test.ts && pnpm typecheck && pnpm lint
- [ ] T2: Los hooks de Antigravity, Gemini CLI y Devin, protegidos, y la documentación
  - files: packages/core/src/guard/spec.ts, packages/core/test/guard/decide.test.ts, docs/ARCHITECTURE.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/decide.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Antigravity no pasa sus herramientas `client_*` por los hooks (A2 falso), y el guard sigue sin verlas — el registro de cada conversación (`~/.gemini/antigravity-acp/conversations/<id>.db`) dice si el hook respondió; si no, el cambio aparte del bloqueo cruzado lo anotará como límite de Antigravity.
- R2: Un test o un flujo legítimo escribía uno de los tres archivos a través del guard — el check completo de `task done` lo destaparía; `init` y `uninstall` no pasan por él.
