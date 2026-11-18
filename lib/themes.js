'use strict';
// Temas del launcher. Los 4 primeros viven en styles.css; los demás se añadieron en 1.0.64.
const BASE = ['nova', 'dark', 'light', 'oled'];
const EXTRA = [
  {
    "id": "catppuccin",
    "name": "Catppuccin",
    "accent": "#cba6f7"
  },
  {
    "id": "tokyonight",
    "name": "Tokyo Night",
    "accent": "#7aa2f7"
  },
  {
    "id": "dracula",
    "name": "Dracula",
    "accent": "#bd93f9"
  },
  {
    "id": "rosepine",
    "name": "Rosé Pine",
    "accent": "#ebbcba"
  },
  {
    "id": "synthwave",
    "name": "Synthwave",
    "accent": "#ff2fb9"
  },
  {
    "id": "cyberpunk",
    "name": "Cyberpunk",
    "accent": "#fcee0a"
  },
  {
    "id": "sakura",
    "name": "Sakura",
    "accent": "#e0679a"
  },
  {
    "id": "deepdark",
    "name": "Deep Dark",
    "accent": "#2ee6d6"
  },
  {
    "id": "nether",
    "name": "Nether",
    "accent": "#ff6a2b"
  },
  {
    "id": "end",
    "name": "The End",
    "accent": "#b86bff"
  }
];
const ALL = [...BASE, ...EXTRA.map((t) => t.id)];
module.exports = { BASE, EXTRA, ALL };
