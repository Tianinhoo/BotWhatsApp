# Probar el bot sin WhatsApp

<!-- [ByCodex] -->

Desde la carpeta `cecilia-tedin-bot`, con **Python 3.10+ y Node.js** disponibles (el proyecto usa Node 22):

```powershell
python scripts/simulate_chat.py
```

El simulador envía un «hola» inicial y muestra el saludo real. Escribí como una clienta; verás nombres y burbujas de chat. Ejecuta el código JavaScript de producción (árbol, procesamiento, resumen, cola e inbox) mediante un puente Python, con transporte y base de datos en memoria. No instala dependencias nuevas, no lee `.env`, no conecta Meta ni una BD y no necesita `APP_SECRET` ni token.

| Acción | Qué escribir |
|---|---|
| Elegir una fila o un botón mostrado | `#lista 2` / `#boton 1` |
| Enviar un audio simulado | `#audio quiero talla M` (la descripción es una anotación; no se transcribe) |
| Reenviar el último mensaje con el mismo identificador | `#duplicado` |
| Regresar después de tres horas | `#esperar 3h` (reloj virtual, sin esperar ni reiniciar el estado) |
| Ver el estado / iniciar otra conversación | `#estado` / `#reiniciar` |
| Reactivar tras el handoff | `#reanudar` (acción administrativa real; limpia la selección) |
| Ayuda / terminar | `#ayuda` / `#salir` |

**Pruebas automáticas y casos individuales:**

```powershell
python scripts/simulate_chat.py --auto
python scripts/simulate_chat.py --list-scenarios
python scripts/simulate_chat.py --scenario "modelo 2 talla M negro"
python scripts/simulate_chat.py --scenario "quiero asesora"
python scripts/simulate_chat.py --scenario "fuera de menú"
pytest tests/test_simulator.py -v
```

Los 10 casos cubren menú completo, selección de prenda (BRIEF-025), handoff, fuera de guion, abandono/regreso, duplicados, opción inválida, audio, emojis y typos. Cada ✅/❌ comprueba el **comportamiento actual esperado**: un rechazo correcto del texto libre puede aprobar. Aprobar no significa que el bot entienda esas frases ni que ya esté listo para atender clientas. Sin pytest, ejecutá `python -m unittest discover -s tests -p test_simulator.py -v`.

Cada sesión deja un archivo UTF-8 en `logs/sim_YYYYMMDD_HHMMSS.txt`; podés elegir otra carpeta con `--log-dir DIR`. El chat y el estado viven solo en memoria; los logs permanecen locales para revisión con la asesora.

**Qué observar:** el parser es estricto; durante la selección de prenda, «6» significa sexta prenda, no asesora. El handoff deja al bot callado hasta reactivación administrativa; tres horas de ausencia no reinician la conversación. Se usan cuatro prendas de ejemplo del seed, con precios por confirmar; las imágenes aparecen como marcadores, sin descargarlas. La prueba no verifica entregas de WhatsApp, persistencia ni la reproducción de audios reales.
