# JanitorAI Card Backup

Firefox extension that captures character data from JanitorAI and exports it as SillyTavern Character Card V2 format (JSON or PNG with embedded metadata).

## How It Works

The extension captures character data through two API endpoints:

1. **Chat data** — Opening a chat triggers a `GET /hampter/chats/{id}` request. The extension intercepts this and captures basic character data (name, description, avatar, first messages). The toolbar icon shows a yellow badge.

2. **Full character data** — The extension immediately fetches `GET /hampter/characters/{id}` to get personality, scenario, and example dialogs. The toolbar icon turns green when complete.

3. Click the toolbar icon, choose JSON or PNG, and download.

Each browser tab tracks its own character independently. Navigating away from a chat clears that tab's data.

## Export Formats

**JSON** — Downloads a `chara_card_v2` JSON file compatible with SillyTavern and other card readers.

**PNG** — Downloads the character's avatar as a PNG with the V2 card data embedded in a `tEXt` chunk (keyword: `chara`).

## Field Mapping

| JanitorAI Source | SillyTavern V2 Field |
|---|---|
| `character.name` | `data.name` |
| `character.description` | `data.description` (tagged sections extracted and removed) |
| `character.personality` | `data.personality` |
| `character.scenario` | `data.scenario` |
| `character.first_messages[0]` | `data.first_mes` |
| `character.first_messages[1..n]` | `data.alternate_greetings` |
| `character.example_dialogs` | `data.mes_example` |

## Icon States

| State | Icon | Meaning |
|---|---|---|
| Gray | Grayscale, no badge | No character data for this tab |
| Yellow | Grayscale, amber "!" badge | Chat loaded, fetching full character data |
| Green | Color, no badge | Full data captured, ready to export |

## Installation

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" → "Load Temporary Add-on"
3. Select `manifest.json` from this directory

## Requirements

- Firefox 142.0 or later
- No build step — plain JavaScript loaded directly by the browser

## Support for Plugin

For support, open an issue on Github. You can find it [here](https://github.com/Tydorius/JanitorAI_Card_Backup).

## Support Me

If you want to support me, you can do so on [Ko-fi](https://ko-fi.com/tydorius).
