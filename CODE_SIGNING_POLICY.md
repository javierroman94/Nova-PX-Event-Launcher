# Code signing policy

Nova PX Event Launcher is open source (MIT). Windows installers published in
[GitHub Releases](https://github.com/javierroman94/Nova-PX-Event-Launcher/releases)
are built from this repository by GitHub Actions and, once a signing certificate
is available, signed so Windows can show the publisher name.

- **What is signed:** only the installer and executables built by the release
  workflow from a `vX.Y.Z` tag of this repository. Nothing built on a personal
  computer is signed.
- **Who can approve a signing request:** the repository owner, Francisco Javier
  Román Fajardo (`javierroman94`).
- **Privacy:** the launcher only sends an anonymous usage counter if the player
  allows it in Settings. It does not collect IP addresses or personal data
  beyond what the player chooses to share (for example a nickname for friends).
- **Not affiliated:** this project is not made by or affiliated with Mojang
  or Microsoft. "Minecraft" is a trademark of Mojang AB.
- **Contact:** open an issue at
  https://github.com/javierroman94/Nova-PX-Event-Launcher/issues
