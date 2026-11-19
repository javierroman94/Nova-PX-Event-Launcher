# Cómo reportar un error del launcher (beta testers)

Mientras más datos traiga el reporte, más rápido se arregla. Pega esto en el canal de comentarios del launcher:

1. En el launcher, abre **Consola** y pulsa **Copiar reporte**. Copia solo lo importante (versión, sistema, tipo de cuenta, qué se estaba jugando y las últimas líneas del registro) y oculta tu usuario.
2. Pégalo en el canal y completa **Qué pasó**.

## Plantilla manual (si no puedes copiar el reporte)

```
Versión del launcher:
Sistema (Windows 10/11, Linux):
Cuenta: premium / no premium
Qué hacías (por ejemplo: pulsar Jugar en el modpack X, instalar un modpack, cambiar skin):
Modpack, versión de Minecraft y loader (Fabric/Forge/NeoForge):
Qué esperabas que pasara:
Qué pasó en realidad:
¿Pasa siempre o a veces?:
¿Con otra cuenta o modpack también pasa?:
Captura de pantalla o registro (Consola → Guardar):
```

## Si el juego se cierra solo
Además adjunta (carpeta del modpack, dentro de `%APPDATA%\.novapx-event-launcher\instancias\`):
- `logs\latest.log` (últimas 40 líneas)
- el archivo más nuevo de `crash-reports\`, si existe

## Antes de enviar
- No pegues contraseñas ni claves. El reporte ya oculta tu usuario de Windows, pero revisa que no haya datos tuyos.
- Un error por reporte.
