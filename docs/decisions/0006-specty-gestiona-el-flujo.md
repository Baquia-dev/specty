# 0006 · Specty es la máquina de estados; el agente, un trabajador sin estado

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

En el legacy, el flujo se transmitía con un AGENTS.md extenso, unos 40 archivos de reglas, 6 roles, una matriz de enrutamiento y 38 comandos. El modelo tenía que decidir qué leer y qué ejecutar en cada momento, y cada una de esas decisiones era una oportunidad de saltarse el flujo. Además, solo 2 de los 21 adaptadores instalaban hooks; los demás dependían únicamente de reglas en prosa.

## Decisión

- Specty es lo único que escribe el estado, hace los commits de tarea y cambia de fase.
- El agente tiene siete comandos, pero en la práctica solo necesita recordar uno: `specty next`. Cada salida termina con la acción exacta que sigue.
- Las transiciones que conceden permisos sobre el código son exclusivamente humanas. Ninguna variable de entorno ni modo de prueba las habilita.
- El bloque de flujo en AGENTS.md ocupa unas 8 líneas.

## Consecuencias

- Cualquier sesión, herramienta o modelo puede retomar un cambio, porque todo el estado está en disco.
- También funciona con modelos pequeños: basta con seguir la última línea de la salida.
- Los textos de salida pasan a ser interfaz pública. Se prueban con la suite de cumplimiento, porque una redacción distinta puede cambiar el comportamiento de un modelo.
- Hay más lógica en Specty y menos en los prompts.
