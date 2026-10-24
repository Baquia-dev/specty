# 0011 · Revisión independiente con un modelo que elige la persona

- Estado: aceptada
- Fecha: 2026-10-24
- Modifica: [0001](0001-sin-llm.md)

## Contexto

El agente que redacta la spec es el mismo que la implementa y el que se revisa. Una segunda opinión encuentra lo que se le escapa: supuestos falsos, criterios que no se pueden comprobar, archivos que faltan. Mejor si viene de un modelo más fuerte, o del mismo con más esfuerzo.

Specty no puede exigirla. No sabe qué modelo ni qué esfuerzo usó el agente: lo que el agente declara es contexto, no prueba. Sí puede ofrecer una revisión con un modelo que elige la persona.

La [0001](0001-sin-llm.md) dice que Specty nunca llama a modelos, y prevé que un proveedor opcional vaya en un ADR nuevo, sin convertirlo en requisito.

## Decisión

- Specty puede pasar la spec a un **comando de revisión** que la persona configura en `review.command`. Por ejemplo, Claude Code en modo headless con Opus y sin herramientas: `claude -p --model opus --tools "" --setting-sources "" --strict-mcp-config`. Specty lo ejecuta con la shell, le pasa por la entrada estándar las instrucciones y la spec, y guarda lo que responde.
- **Es opcional y lo activa la persona.** Sin `review.command`, Specty ni la recomienda ni la ejecuta. El agente no puede activarla, porque `.specty/config.yaml` está protegido.
- **Specty no gestiona claves ni proveedores.** Usa la CLI que la persona ya tiene, con su cuenta.
- **El revisor solo ve lo que le pasa Specty:** ni la conversación del agente ni herramientas. Así su opinión es independiente.
- **La revisión es información.** No aprueba, no rechaza y no bloquea; decide la persona. La respuesta queda en `reviews/` del cambio, que el guard protege, y `review.completed` la anota en la auditoría.
- **La lanza el agente** con `specty review`, cuando el SIGUIENTE de `propose` se lo pide. `propose` la pide una vez por cambio, si la spec es L o XL o toca rutas sensibles. Luego el agente corrige lo que sea un error real, o le cuenta al usuario lo que encontró.

## Consecuencias

- Cada revisión consume la cuenta de la persona y envía la spec al proveedor de su CLI. Por eso es opcional, la configura ella y Specty solo la recomienda en los cambios grandes o sensibles, una vez.
- Si el comando falla o no responde, el flujo sigue: la revisión no es un paso obligatorio.
- Los tests usan un revisor falso, un script que lee la entrada estándar. No llaman a ningún modelo.
- El mismo comando revisa el resultado antes de aceptar. Con el cambio en aceptación, `specty review` le pasa la spec y el diff de todo el cambio, sin `.specty/`. La tarjeta de aceptación lo pide cuando el cambio es L o XL, o alguna tarea quitó aserciones o añadió riesgos conocidos, hasta que haya una revisión posterior a la última tarea. Luego el agente se lo cuenta al usuario, que acepta o pide un ajuste.
- La [0001](0001-sin-llm.md) sigue en pie para todo lo demás: Specty no redacta, no decide y no necesita un modelo para funcionar.
