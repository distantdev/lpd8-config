# LPD8 Mapper

Browser-based editor for configuring the four program slots on the original first-edition LPD8 USB MIDI controller (Mk1, model ID `0x75`). Hosted at [https://lpd8.distantnebula.com](https://lpd8.distantnebula.com).

The old desktop editor software for the first-generation LPD8 can be frustrating to run on newer computers and tedious when entering dozens of MIDI numbers by hand. This tool reads and writes programs directly over WebMIDI SysEx in your browser, with pattern filling so you do not have to type out every knob and pad one by one.

This only supports the original wired LPD8 (Mk1). It does not support the LPD8 Mk2 or LPD8 Wireless, which use different SysEx protocols.

## Browser support

You need a browser that supports WebMIDI with SysEx access:

- Chrome
- Edge
- Opera
- Brave (with WebMIDI enabled if blocked by shields)

Firefox and Safari do not currently support WebMIDI SysEx, though you can still edit layouts locally and export `.syx` or `.json` files to flash later.

## Getting started

1. Plug your LPD8 into USB and open [https://lpd8.distantnebula.com](https://lpd8.distantnebula.com).
2. Click **Connect LPD8** and allow MIDI and SysEx access when the browser prompts.
   - If the ports are not selected automatically, click the connection status pill in the top bar and pick your LPD8 for both **MIDI Input** and **MIDI Output**.
3. Click **Read -> Read All 4 Programs** in the bottom bar to load what is currently stored on your controller.
4. Before making changes, open **Save / Load -> Save Full Backup (.json)** (or **Files** on a phone) to keep a copy of your current setup.

## Editing programs

Each of the four program slots (`P1` through `P4`) holds:

- 1 global MIDI channel (`1–16`)
- 8 pads (`Pad 1`–`Pad 8`), each with a MIDI note (`0–127`), program change (`0–127`), CC (`0–127`), and behavior (`Momentary` or `Toggle`)
- 8 knobs (`K1`–`K8`), each with a CC (`0–127`) and `Min` / `Max` range (`0–127`)

### Direct editing

- **Type a value:** Click any number on a desktop pad or knob to type a value. Note fields accept either MIDI numbers (`36`) or note names (`C2`, `F#3`, `Bb1`).
- **Scrub with a mouse:** On desktop, click and drag vertically on any number to change it. Hold `Shift` while dragging or using the scroll wheel for larger jumps (`±10`, or `±12` octaves for notes).
- **Drag-to-fill:** On desktop, grab the small square in the bottom-right corner of a pad, knob, or grid cell and drag across neighboring controls to auto-increment values. Hold `Alt` while releasing to copy the same value instead.
- **Phone and tablet editing:** Tap any pad or knob to open its editor card directly below the grid with `+` / `-` buttons (including `±12` octave buttons for pad notes).
- **Controller vs. Grid view:** Use the **Controller** view to work on one program at a time in the physical pad/knob layout, or switch to **Grid** to view and edit all four programs at once.
- **Copy, swap, and undo:** Use **Copy / Swap** to duplicate or exchange program slots, press keys `1`–`4` to switch programs, and use `Ctrl+Z` / `Ctrl+Y` (or the header arrow buttons) to undo and redo changes.

### Auto-Fill

Click **Auto-Fill** above the controller to populate ranges across one or multiple programs without typing each control individually.

A few examples of what it handles:

- **Continuous knob banks across programs:** Pick the **Knobs CC 0–31 (P1–P4)** preset (or set target to `Knobs — CC Number`, select `P1`–`P4`, `Count Up/Down`, start `0`, step `+1`, across programs `Continue`). Program 1 gets CC `0–7`, Program 2 gets `8–15`, Program 3 gets `16–23`, and Program 4 gets `24–31`.
- **Musical scales on pads:** Set target to `Pads — MIDI Note`, choose `Musical Scale`, pick a root note and scale, and either continue up the scale across programs or transpose up one octave per program.
- **Skip existing CCs:** Under **More Options**, enable **Skip already-used CCs on channel** when filling CCs so it steps around numbers already assigned to pads or other knobs on that MIDI channel.
- **Selected controls only:** Turn on **Select** on the controller, check the specific pads or knobs you want to change, and enable **Selected controls only** inside Auto-Fill.

While Auto-Fill is open, pending changes appear in cyan directly on the pads, knobs, and program tabs before you click **Apply**.

## Writing changes to the LPD8

Edits stay in your browser (and autosave to local storage) until you send them to the hardware. Each program tab shows a small status dot:

- Hollow ring: local draft (not read from or sent to the device yet)
- Amber dot: edited locally, differs from what was read from or last sent to the LPD8
- Green dot: matches the hardware slot

To write changes back to your LPD8:

1. Click **Slots** in the bottom bar and toggle which slots (`P1`–`P4`) to overwrite. You can tap **Unsaved** to pick only the programs you changed, **Current**, or **All 4**.
2. Leave **Verify after sending** checked if you want the app to read each slot back after flashing and compare every byte.
3. Click **Send ... to LPD8**.

Note that the LPD8 Mk1 only stores changes permanently when sent via SysEx like this; pressing **Activate on LPD8** in the program bar only switches the active slot on the device.

## Backups and SysEx files

Under **Save / Load** (labeled **Files** on small screens):

- **Save Full Backup (.json):** Saves all four programs in one file that can be reloaded into the app later.
- **Export Program N (.syx) / Export All 4 Programs (.syx):** Exports standard 66-byte LPD8 Mk1 SysEx dump files compatible with external MIDI/SysEx tools.
- **Open Preset File (.json, .syx, .lpd8):** Loads a JSON backup or binary `.syx` / `.lpd8` preset file.
- **Reset All 4 Programs to Factory:** Restores the default LPD8 Mk1 factory layout (Ch 1, Pads Note `36–43` / CC `9–16` / PC `0–7`, Knobs CC `1–8`).

At the bottom of the page, **Diagnostics & SysEx Inspector** expands to show any duplicate CC or note assignments within the same program, the exact 66-byte SysEx write packet (tap or hover any byte to see what parameter it maps to), and a live log of MIDI traffic.

## Building from source

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

To run the test suite and build the production static bundle into `dist/`:

```bash
npm test
npm run build
```

### Deploying to Cloudflare Workers

A `wrangler.jsonc` config is included for hosting the static `dist/` folder on Cloudflare Workers (`lpd8.distantnebula.com`). After building:

```bash
npx wrangler login
npx wrangler deploy
```
