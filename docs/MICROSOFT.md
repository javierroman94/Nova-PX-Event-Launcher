# Inicio de sesión con Microsoft: ¿hace falta registrar una app?

**Respuesta corta: por ahora no.** El launcher usa la librería `msmc`, que trae su propia aplicación de Microsoft ya funcionando (la comparten muchos launchers). Con eso los jugadores premium ya pueden entrar. Registrar una app propia es **gratis**, pero solo conviene si algún día el inicio de sesión empieza a fallar con muchos jugadores.

## Cuándo sí conviene
- Muchos jugadores a la vez reciben errores al iniciar sesión.
- Quieres que la ventana de Microsoft muestre «Nova PX Event Launcher» como nombre de la aplicación.

## Cómo hacerlo (gratis, sin tarjeta)
1. Entra en <https://portal.azure.com> con una cuenta Microsoft normal y abre **App registrations → New registration**.
2. **Name:** `Nova PX Event Launcher`. En **Supported account types** elige *Personal Microsoft accounts only*.
3. **Redirect URI:** tipo *Public client/native* con el valor `http://localhost`.
4. Guarda el **Application (client) ID** que aparece al terminar.
5. En **Authentication** activa *Allow public client flows*.
6. **Paso obligatorio de Mojang:** una aplicación nueva no puede entrar a los servicios de Minecraft hasta que Mojang la apruebe. Se solicita en el formulario oficial de acceso a la API de Minecraft (busca «Minecraft Java Edition game API access»). La respuesta puede tardar días. Mientras no la aprueben, el inicio de sesión con tu app dará el error *Invalid app registration*.

## Qué cambia en el launcher
Cuando Mojang apruebe tu app, hay que indicarle al launcher el `client ID` en lugar del que trae `msmc`. Avísame con el ID aprobado y lo conecto, porque esa parte debo probarla con la versión exacta de la librería.

## Recomendación
Deja todo como está hasta que haya un problema real. Si un día falla el inicio de sesión de muchos jugadores, haz estos pasos con anticipación, porque la aprobación de Mojang es lo que más tarda.
