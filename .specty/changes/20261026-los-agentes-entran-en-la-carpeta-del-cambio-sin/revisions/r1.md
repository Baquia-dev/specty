---
kind: epic
---

# Los agentes entran en la carpeta del cambio sin abrir otra sesión

## Objetivo

Cada cambio vive en su propia carpeta (una worktree). Hoy solo Claude Code mueve su sesión a esa carpeta (`EnterWorktree`): con las demás herramientas hay que abrir otra sesión allí, que empieza sin el chat anterior. Esta épica les da lo mismo:
- El agente ejecuta `specty enter <id>`, y el guard liga su conversación a la carpeta del cambio.
- Desde ahí, Specty lleva allí cada acción de esa conversación: escribir, leer, buscar y ejecutar comandos.
- Donde la herramienta no deje reescribir una acción, el guard la bloquea y le da la ruta buena.

Así una sesión pasa de un cambio a otro como en Claude Code, sin abrir otra, y los cambios siguen aislados en sus carpetas.

## Fuera de alcance

- Trabajar dos cambios a la vez en una misma conversación: como en Claude Code, una conversación trabaja un cambio abierto cada vez, salvo los cortes de su épica.
- Que la interfaz de cada herramienta (árbol de archivos, diffs, índice) muestre la carpeta del cambio.
- Copilot, que no tiene hooks.

## Supuestos

- A1: Codex 0.164 acepta `updatedInput` en `PreToolUse`, con `permissionDecision: "allow"` y un `command` de texto, comprobado en su binario. Gemini CLI 0.65 acepta `hookSpecificOutput.tool_input` en `BeforeTool` y amplía su espacio de trabajo con `context.includeDirectories`. El plugin de OpenCode puede cambiar los argumentos de cada herramienta (`output.args`).
  - impacto: alto
- A2: Antigravity acepta `overwrite` en `PreToolUse` y Devin `updatedInput`, según su documentación. Cursor documenta `updated_input`, pero según su foro solo lo aplica a `Shell`.
  - impacto: alto
- A3: Las herramientas de archivos de Gemini CLI y de Devin solo trabajan dentro de su espacio de trabajo, y las de OpenCode piden permiso fuera de él (`external_directory`), así que hay que abrirles la carpeta de las worktrees.
- A4: Cada herramienta da a sus hooks un id estable de la conversación (`session_id`, `conversation_id` o `conversationId`).

## Criterios de aceptación

- AC1: CUANDO el agente de una herramienta que no es Claude Code ejecuta `specty enter <id>` ENTONCES su conversación queda ligada a la carpeta del cambio `<id>`, con la regla de Claude Code: una conversación trabaja un solo cambio abierto a la vez, salvo los cortes de su épica.
- AC2: CUANDO una conversación ligada a la carpeta de un cambio escribe, lee, busca o ejecuta un comando ENTONCES la acción ocurre en esa carpeta, aunque la herramienta siga abierta en otra, y el guard la juzga con las reglas de ese cambio.
- AC3: CUANDO la herramienta no deja reescribir una acción de una conversación ligada ENTONCES el guard la bloquea si apunta fuera de la carpeta del cambio y le da la ruta equivalente dentro de ella.
- AC4: CUANDO los permisos o el sandbox de la herramienta no dejan trabajar en la carpeta de las worktrees ENTONCES `init` los amplía en el proyecto, o dice qué añadir si solo se puede en la carpeta del usuario.
- AC5: CUANDO `specty new` crea un cambio desde una herramienta que sabe entrar ENTONCES su SIGUIENTE propone `specty enter <id>` en vez de abrir otra sesión.
- AC6: CUANDO se ejecuta `pnpm check` en una máquina con Gemini CLI, OpenCode o Codex ENTONCES una prueba hace que la herramienta, con un modelo simulado, entre en un cambio y escriba, lea y ejecute en su carpeta; sin la herramienta, la prueba se salta.
- AC7: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES «Worktree por nombre» dice para cada herramienta cómo entra en la carpeta del cambio («indirecto») o por qué no puede.
- AC8: CUANDO el agente de Claude Code ejecuta `specty enter <id>` ENTONCES el guard le pide `EnterWorktree` con `name`, que hace lo mismo de forma nativa.

## Diseño

- `specty enter <id>` es un comando del agente. El guard lo reconoce dentro de un comando de shell (el análisis de shell anota el id), comprueba que el cambio tenga carpeta y aplica la regla de una conversación por cambio (`sessionDenial`). Después liga la conversación a la carpeta (`bindSession`, por `conversationOf`). El comando imprime la tarjeta del cambio en esa carpeta.
- Carpeta virtual: con una conversación ligada, el guard abre la sesión en la carpeta del cambio y lleva allí cada acción:
  - las rutas de la carpeta principal y las relativas pasan a la del cambio;
  - los comandos se ejecutan allí.

  El módulo de cada agente reescribe la entrada de sus herramientas (`redirect`) y responde con la entrada nueva (`Verdict.input`). Si no sabe, el guard bloquea y da la ruta equivalente.
- Las herramientas de leer y buscar también pasan por el guard donde se puede, para que el agente no lea la versión de la carpeta principal.
- Permisos de cada herramienta:
  - Gemini CLI: `context.includeDirectories`;
  - OpenCode: `external_directory`;
  - Codex: las raíces escribibles de su sandbox;
  - Antigravity: `permissionOverrides` también para leer y escribir archivos;
  - Devin: `Read(...)` además de `Write(...)`;
  - Cursor: su sandbox ya tiene la carpeta.
- Cada corte cambia en la tabla la celda «Worktree por nombre» de su herramienta.

## Cortes

- C1: Una conversación entra en la carpeta de un cambio con specty enter
  - ac: AC1, AC3, AC8
- C2: Gemini CLI lleva sus acciones a la carpeta del cambio
  - ac: AC2, AC4, AC6, AC7
  - depends: C1
- C3: OpenCode lleva sus acciones a la carpeta del cambio
  - ac: AC2, AC4, AC6, AC7
  - depends: C1
- C4: Codex lleva sus acciones a la carpeta del cambio
  - ac: AC2, AC4, AC6, AC7
  - depends: C1
- C5: Antigravity y Devin llevan sus acciones a la carpeta del cambio
  - ac: AC2, AC4, AC7
  - depends: C1
- C6: Cursor entra en la carpeta del cambio, y new propone entrar
  - ac: AC2, AC3, AC4, AC5, AC7
  - depends: C2, C3, C4, C5

## Riesgos

- R1: Una acción reescrita cambia sin que el modelo lo vea, y si luego busca un archivo en la carpeta principal no lo encuentra. Mitigación: la tarjeta de `specty enter` le dice que trabaja en la carpeta del cambio, y las lecturas y búsquedas van también allí.
- R2: Pasar las lecturas por el guard suma su tiempo a cada lectura. Mitigación: sin una conversación ligada, el guard responde enseguida, y el camino rápido de `entry.ts` carga lo mínimo.
- R3: Antigravity, Devin y Cursor no se pueden probar con la herramienta de verdad. Mitigación: sus pruebas usan los eventos que documentan, y ARCHITECTURE §10 dice qué queda sin comprobar.
- R4: Si una herramienta ignora la entrada reescrita (Cursor al escribir archivos), la acción iría a la carpeta principal. Mitigación: donde no consta que se aplique, el guard no reescribe: bloquea y da la ruta.
