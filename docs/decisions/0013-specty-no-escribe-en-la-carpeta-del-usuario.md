# 0013 · Specty no escribe en la carpeta del usuario

- Estado: aceptada
- Fecha: 2026-10-26

## Contexto

Specty instalaba dos guards fuera del proyecto. El de Codex iba a `~/.codex/hooks.json` (o a `$CODEX_HOME`), porque Codex guarda la confianza de cada hook por la ruta de su archivo, y se creía que un hook del repositorio habría que revisarlo con `/hooks` en cada worktree. El de OpenCode iba a `~/.config/opencode/plugins/specty.js` (o a `$XDG_CONFIG_HOME`), para servir en todas las worktrees sin dejar código que revisaran los formateadores del proyecto. `specty check --install` añadía además el hook de fin de turno de Codex al mismo archivo de usuario.

Así, una instalación servía en todos los repositorios de la persona, pero quedaba fuera de su control de versiones, se activaba también donde no usa Specty y la persona tenía que saber dónde estaba para quitarla.

## Decisión

Decisión del usuario del 2026-10-26: nada de Specty escribe en la carpeta del usuario; Specty escribe en la del proyecto.

- **Specty escribe solo dentro del proyecto**: su carpeta de trabajo y su directorio de git. Nunca en la configuración del usuario (`~`, `$CODEX_HOME`, `$XDG_CONFIG_HOME` u otras), salvo la excepción de las reglas del CLI de Antigravity (abajo).
- **El guard de cada agente vive en el proyecto**: `.claude/settings.json`, `.cursor/hooks.json`, `.codex/hooks.json` y `.opencode/plugins/specty.js`. Se versiona cuando el comando de Specty está en el PATH; si lleva una ruta de la máquina, queda excluido en `.git/info/exclude` y `specty new` lo copia a cada worktree.
- **La configuración del usuario solo se lee**: para la guía de gentle-ai y para lo que `uninstall` dice que queda allí de una instalación anterior.
- **Lo que escriben las herramientas que Specty ejecuta es de esas herramientas**: el gestor de paquetes al preparar una worktree, la caché de `npx`, el modelo de `review.command`, o Codex al guardar la confianza de la persona.
- **Quedan fuera, por ahora,** las worktrees junto al proyecto (`<carpeta>.worktrees/`) y las carpetas temporales de `specty check` en `$TMPDIR`: no están en la carpeta del usuario, y la persona aún no ha decidido sobre ellas.

## Consecuencias

- Codex, desde la 0.131 (PR #21969, «Use root repo hooks in linked worktrees»), carga los hooks de proyecto de una worktree desde la carpeta principal del repositorio. Por eso la persona confía en el proyecto y revisa el hook con `/hooks` una vez por repositorio. Con un Codex anterior, cada worktree pide su revisión. El motivo que llevó el guard a la configuración del usuario ya no vale.
- El guard viaja con el repositorio: lo tiene quien lo clona, y no corre en los demás repositorios de la persona.
- Cada proyecto actualiza su guard con su propio `specty init`, en lugar de una vez por máquina.
- Los formateadores y linters del proyecto ven `.codex/hooks.json` y el JavaScript del plugin; `doctor` dice qué exclusión añadir.

## Excepción: la regla del CLI de Antigravity (2026-11-05)

Decisión del usuario del 2026-11-05 (D4): «para p157 entonces agrega una execpcion para que se agrege el command(specty) se agrege a los permisos de antigravity en la carpeta del usuario».

- El sandbox de terminal de Antigravity CLI (`agy` 1.5.1, `--sandbox`) no deja escribir en `.git`, ni dentro del espacio de trabajo, ni arrancar un `specty` global de nvm, así que el agente no podía ejecutar `specty enter`, `next` ni `task done` (P157). Los `permissionOverrides` que da el guard no cambian ese sandbox, y las reglas de `permissions.allow` de `~/.gemini/antigravity-cli/settings.json` sí (P167). Antigravity no tiene un archivo de permisos en el proyecto.
- Por eso `specty init --tools antigravity` añade `command(specty)` a esa lista, solo si la carpeta del CLI existe: sin duplicarla, respetando `unsandboxed(specty)` (la de las cuentas de empresa) y sin tocar unos ajustes que no puede editar, de los que avisa con la regla que añadir.
- Solo esa regla. Ninguna regla de rutas (`read_file`, `write_file`), que llevan rutas de la máquina de cada repositorio, y nada en los ajustes de la app, que no están en un archivo legible: para la app, `init` dice qué regla añadir. Las reglas de rutas llegaron con la ampliación D5 (abajo).
- `doctor` comprueba la regla cuando existe la carpeta del CLI. `uninstall` la deja, porque la comparten todos los proyectos de la persona, y dice dónde está y cómo quitarla.
- El resto de esta decisión sigue igual.

## Ampliación: las reglas del sandbox del CLI de Antigravity (2026-11-09)

Decisión del usuario del 2026-11-09 (D5), entre las opciones que se le dieron: «Ampliar D4 en la instalación».

- `agy` enciende su sandbox de terminal en todo modo print, y dentro Specty no arrancaba: `node` no podía abrir el bundle, que está fuera del espacio de trabajo (`EPERM`), y git no podía escribir en `.git`. Con `command(specty)`, los comandos de Specty solo salían del sandbox si el modelo ponía `BypassSandbox: true`, y un monitor de seguridad de `agy` lo bloqueó como un intento de eludir el sandbox (P382). Las reglas de rutas de `permissions.allow` sí abren el sandbox (P167).
- Por eso `specty init --tools antigravity` añade, tras `command(specty)` (o `unsandboxed(specty)`), en este orden:
  - `read_file(<prefijo de node>)`, la carpeta dos niveles por encima del node que ejecuta `init`;
  - `read_file(<carpeta del bundle>)`, salvo si está dentro de la de node, como en una instalación global de npm;
  - `write_file(<carpeta común de git>)` del repositorio, la misma desde cualquier worktree.
- Todas llevan rutas absolutas, porque una relativa rompe el sandbox entero. `init` solo añade las que faltan.
- Las de lectura sirven a todos los proyectos de la persona; la de escritura, solo a ese repositorio, así que cada proyecto en el que la persona ejecuta `init` añade la suya.
- `doctor` las comprueba todas y nombra las que faltan, por ejemplo tras cambiar de versión de node. `uninstall` las deja, como `command(specty)`, porque Specty solo escribe en la carpeta del usuario al instalar. Dice cuáles siguen, que `write_file` solo sirve a ese proyecto y cómo quitarlas. Las de un node o un bundle anteriores no se quitan: Specty no las distingue de las de la persona.
- Nada cambia en la app de Antigravity, cuyos permisos no están en un archivo legible. El resto de esta decisión sigue igual.
