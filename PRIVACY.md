# Privacy policy

Nova PX Event Launcher is an open-source Minecraft launcher. This page explains what data it handles.

**Stays on your computer**
- Your settings, modpacks, worlds, skins and saved accounts.
- Microsoft sign-in tokens are encrypted with your operating system's secure storage. They are never sent to Nova PX.

**Sent only if you allow it (Settings → share usage)**
- An anonymous usage counter: a random installation id, launcher version and operating system. No IP address is stored.
- The player nickname, only if you sign in, so friends and online status work.

**Friends and chat**
- If you use friends or chat, your nickname, friend list and messages are stored on a Nova PX server (Cloudflare) so they can be delivered.

**PX, the mascot (optional AI, off by default)**
- Rule-based PX runs fully on your computer. What it learns (visit counts, a few short facts) stays in this app's local storage and can be wiped with "Olvidar todo" in its chat.
- Only if you turn on "PX con IA" in Settings → Appearance: the messages you type to PX, a short summary of what PX remembers about you, and — only when you press "Revisar mi último error" — the last lines of a game error log are sent to a Nova PX server on Cloudflare, which answers using an AI model (Cloudflare Workers AI; Anthropic's Claude if the project owner enables it). Your user name, file paths, access tokens, UUIDs, e-mails and IP addresses are removed from logs before sending. Do not type personal data to PX.
- The server does not store conversations or logs. It only counts messages per day (by a random id and by IP, expiring in 2 days) to enforce daily limits.

**Advertising**
- Ads show only the advertiser's name, image and link. The launcher counts views and clicks per ad (not per person).

**Third parties**
- Downloads come from Modrinth, CurseForge, Feed The Beast, Mojang, Microsoft, GitHub and Cloudflare, each under its own privacy policy.

**Contact and requests**
- To ask for your data to be deleted, open an issue at https://github.com/javierroman94/Nova-PX-Event-Launcher/issues

This project is not affiliated with Mojang or Microsoft.
