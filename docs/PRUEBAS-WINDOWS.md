# Lista de pruebas en Windows

Marca cada punto al probar una versión nueva en un PC con Windows 10/11 real (no se pueden hacer en CI).
Si algo falla, anota qué pasó (captura o mensaje de error), la versión y las últimas líneas de la pestaña **Consola**.
Para la rama de seguridad (PR #9): instala el `.exe` que genera el flujo «Pruebas y auditoría de seguridad» o una versión de prueba, **no** la de la Tienda.

Carpetas útiles (Win + R):
- Datos del launcher: `%APPDATA%\nova-px-event-launcher` (comprobado en un Windows real el 27-11-2026)
- Juego e instancias: `%APPDATA%\.novapx-event-launcher`

## 1. Inicio de sesión Microsoft (OAuth con `msmc`)
- [ ] «Iniciar sesión con Microsoft» abre la ventana de login de Microsoft (login.live.com) y, al terminar, se cierra sola y aparece tu nick y tu skin.
- [ ] Cerrar la ventana de login a la mitad **no** deja el launcher colgado: vuelve a «Sin sesión» y se puede reintentar.
- [ ] Cerrar el launcher y abrirlo de nuevo: la sesión sigue (el refresh token se guardó cifrado).
- [ ] En `%APPDATA%\nova-px-event-launcher\accounts.json` el campo `refresh` es un texto en base64 ilegible (cifrado con safeStorage), **no** un token que empiece por `M.` ni contenga `refresh_token`.
- [ ] Varias cuentas: agregar una segunda, cambiar entre ellas y cerrar sesión de una.
- [ ] Nick local (no premium): entrar y lanzar el juego.
- [ ] Tras unas horas (o al día siguiente), lanzar el juego sin volver a iniciar sesión: el token se renueva solo.
- [ ] En la pestaña Consola, al lanzar: `--accessToken`, `--uuid`, `--xuid` y `--clientId` aparecen como `•••` / `<oculto>`.

## 2. Almacenamiento seguro (Electron safeStorage)
- [ ] Amigos: con sesión iniciada, la sección Amigos conecta (sin el aviso «Activa el llavero seguro»).
- [ ] `%APPDATA%\nova-px-event-launcher\presence.token` empieza por `safeStorage:v1:` (el token viejo en texto plano se migra solo la primera vez).
- [ ] Copiar ese archivo a otro usuario de Windows o a otro PC **no** sirve: allí no se puede descifrar (DPAPI va ligado a tu usuario).
- [ ] Modo administrador: la llave de firma de datos importada se guarda cifrada y publicar sigue funcionando.

## 3. Instalación y ejecución de Minecraft
- [ ] Perfil Vanilla (última versión y una vieja, p. ej. 1.16.5) abre Minecraft.
- [ ] Perfil Fabric abre Minecraft.
- [ ] Perfil Forge abre Minecraft (usa el instalador de Forge: lo lee `adm-zip 0.6.1`).
- [ ] Perfil NeoForge abre Minecraft.
- [ ] Una versión que necesite natives viejos (1.8.9 o 1.12.2) abre: los natives se extraen con `adm-zip 0.6.1`.
- [ ] Instalar un modpack de Modrinth y uno de CurseForge, e importar un `.zip` de CurseForge.
- [ ] Un evento protegido (con contraseña) se instala y abre.

## 4. Loaders y perfiles Nova
- [ ] Crear un perfil ⚡ Nova en 1.21.1: instala la lista del loader Nova, Nova Client y (en modo Clásico) Nova-Pack.
- [ ] Elegir Clásico y PvP; cambiar de modo desde el perfil y dentro del juego (Shift derecho).
- [ ] «Actualizar Nova» aparece solo cuando hay una lista más nueva y solo cambia los mods que puso Nova.
- [ ] La ventana del juego se llama «Nova PX · Minecraft …» y F3 muestra `nova`.
- [ ] (Cuando exista `config/nova-firma.pub.pem`) Con `novaFirmaObligatoria: false`: todo sigue igual. Con `true`: si se borra `nova-client.firma.json` de la release de prueba, el perfil Nova **no** instala Nova Client y avisa.

## 5. Actualizaciones automáticas
- [ ] Con la versión publicada anterior instalada, abrir el launcher: detecta la nueva, la descarga y se reinicia actualizado.
- [ ] La versión de Microsoft Store **no** se autoactualiza por su cuenta (lo hace la Tienda).
- [ ] Si se corta internet durante la descarga, el launcher sigue funcionando y lo reintenta después.

## 6. Enlaces externos
- [ ] Un enlace de noticias a `x.com`, `discord.gg`, `youtube.com` o `github.com` se abre directo en el navegador.
- [ ] Un enlace a un sitio desconocido muestra «Vas a abrir <dominio>» con Abrir / Cancelar; Cancelar no abre nada.
- [ ] Un enlace `http://` (sin s) no se abre y avisa.
- [ ] Un dominio con letras raras (p. ej. cirílicas) se muestra como `xn--…` en la confirmación.

## 7. Ventanas, IPC y modo administrador
- [ ] Recorrer todas las pestañas y el modo administrador: nunca debe aparecer «Origen no permitido».
- [ ] Clic derecho / atajos no abren herramientas de desarrollador ni navegan fuera del launcher.
- [ ] Publicar una noticia y un evento desde el modo administrador.

## 8. Mascota PX
- [ ] Aparece, saluda, se duerme y despierta; se puede apagar en Ajustes.
- [ ] Ventana flotante de PX sobre el juego (sin estilos rotos con la CSP nueva del overlay).
- [ ] PX con IA (administradores): responde; al pasar el límite diario avisa; con el Worker PX sin `QUOTA` dice «en mantenimiento».

## 9. Otros
- [ ] Participantes y ganadores con cabeza 3D; naciones agrupadas.
- [ ] Búsqueda de CurseForge (hoy devuelve 403).
