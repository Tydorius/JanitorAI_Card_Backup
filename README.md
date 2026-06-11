# JanitorAI Card Backup

Firefox extension that captures character data from JanitorAI and exports it as SillyTavern Character Card V2 format (JSON or PNG with embedded metadata).

## How It Works

The extension uses a two-stage capture pipeline:

1. **Stage 1** — Opening a chat triggers a `GET /hampter/chats/{id}` request. The extension intercepts this and captures basic character data (name, description, avatar, first messages). The toolbar icon shows a yellow badge indicating partial capture.

2. **Stage 2** — Sending a message triggers a `POST /generateAlpha` request. The extension extracts personality, scenario, and example dialogs from the system prompt's tagged sections. The toolbar icon turns green, indicating full capture.

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
| `character.personality` or `<Start Personality>` tag from generateAlpha | `data.personality` |
| `character.scenario` or `<Start Scenario>` tag from generateAlpha | `data.scenario` |
| `character.first_messages[0]` | `data.first_mes` |
| `character.first_messages[1..n]` | `data.alternate_greetings` |
| `character.example_dialogs` or `<Start Example Dialog>` tag from generateAlpha | `data.mes_example` |

Fields are populated in priority order: direct API field first, then generateAlpha extracted content, then tagged sections parsed from the description.

## Icon States

| State | Icon | Meaning |
|---|---|---|
| Gray | Grayscale, no badge | No character data for this tab |
| Yellow | Grayscale, amber "!" badge | Partial data captured (chat loaded, no message sent yet) |
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