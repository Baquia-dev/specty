# 0013 · Specty no escribe en la carpeta del usuario

- Estado: aceptada
- Fecha: 2026-10-26

## Contexto

Specty instalaba dos guards fuera del proyecto. El de Codex iba a `~/.codex/hooks.json` (o a `$CODEX_HOME`), porque Codex guarda la confianza de cada hook por la ruta de su archivo, y se creía que un hook del repositorio habría que revisarlo con `/hooks` en cada worktree. El de OpenCode iba a `~/.config/opencode/plugins/specty.js` (o a `$XDG_CONFIG_HOME`), para servir en todas las worktrees sin dejar código que revisaran los formateadores del proyecto. `specty check --install` añadía además el hook de fin de turno de Codex al mismo archivo de usuario.

Así, una instalación servía en todos los repositorios de la persona, pero quedaba fuera de su control de versiones, se activaba también donde no usa Specty y la persona tenía que saber dónde estaba para quitarla.

## Decisión

Decisión del usuario del 2026-10-26: nada de Specty escribe en la carpeta del usuario; Specty escribe en la del proyecto.

- **Specty escribe solo dentro del proyecto**: su carpeta de trabajo y su directorio de git. Nunca en la configuración del usuario (`~`, `$CODEX_HOME`, `$XDG_CONFIG_HOME` u otras).
- **El guard de cada agente vive en el proyecto**: `.claude/settings.json`, `.cursor/hooks.json`, `.codex/hooks.json` y `.opencode/plugins/specty.js`. Se versiona cuando el comando de Specty está en el PATH; si lleva una ruta de la máquina, queda excluido en `.git/info/exclude` y `specty new` lo copia a cada worktree.
- **La configuración del usuario solo se lee**: para la guía de gentle-ai y para lo que `uninstall` dice que queda allí de una instalación anterior.
- **Lo que escriben las herramientas que Specty ejecuta es de esas herramientas**: el gestor de paquetes al preparar una worktree, la caché de `npx`, el modelo de `review.command`, o Codex al guardar la confianza de la persona.
- **Quedan fuera, por ahora,** las worktrees junto al proyecto (`<carpeta>.worktrees/`) y las carpetas temporales de `specty check` en `$TMPDIR`: no están en la carpeta del usuario, y la persona aún no ha decidido sobre ellas.

## Consecuencias

- Codex, desde la 0.131 (PR #21969, «Use root repo hooks in linked worktrees»), carga los hooks de proyecto de una worktree desde la carpeta principal del repositorio. Por eso la persona confía en el proyecto y revisa el hook con `/hooks` una vez por repositorio. Con un Codex anterior, cada worktree pide su revisión. El motivo que llevó el guard a la configuración del usuario ya no vale.
- El guard viaja con el repositorio: lo tiene quien lo clona, y no corre en los demás repositorios de la persona.
- Cada proyecto actualiza su guard con su propio `specty init`, en lugar de una vez por máquina.
- Los formateadores y linters del proyecto ven `.codex/hooks.json` y el JavaScript del plugin; `doctor` dice qué exclusión añadir.
