# Droppy — Screenshot Inbox for Figma

**Droppy** is a zero-config, personal local-network tool for bridging mobile and desktop screenshots directly into Figma. Upload screenshots from your phone or computer over local Wi-Fi, and pull them straight into your active Figma canvas individually or in a clean grid with a single click.

---

## 1. Project Structure

```text
screenshot-to-figma/
├── figma-plugin/
│   ├── manifest.json       # Figma plugin manifest (with dev network access)
│   ├── code.js             # Figma main canvas thread (node creation & placement)
│   ├── ui.html             # Plugin UI iframe & interface
│   └── ui.js               # Plugin network communication & image downscaling
├── server/
│   ├── server.js           # Local Express backend (binds to 0.0.0.0:3847)
│   ├── package.json        # Server dependencies (Express, Multer, image-size, CORS)
│   ├── uploads/            # Filesystem queue (<timestamp>-<suffix>.<ext>)
│   └── public/             # Mobile/Desktop web upload client
│       ├── index.html      # Responsive upload interface
│       ├── style.css       # Mobile-first utility stylesheet
│       └── app.js          # Client upload logic with 1-second polling
└── README.md
```

---

## 2. Server Setup & Startup

### Prerequisites
- Node.js (v18 or newer recommended)
- Phone and computer connected to the **same Wi-Fi network**

### Start the Server
```bash
# Navigate to the server folder
cd server

# Install dependencies (only required on first run)
npm install

# Start the server
npm start
```

On startup, the server automatically detects your computer's local network IP and prints:
```text
==================================================
  DROPPY SCREENSHOT INBOX SERVER
==================================================
Server listening on http://0.0.0.0:3847
Mobile upload address: http://192.168.x.x:3847
==================================================
```

---

## 3. How to Load the Plugin in Figma Desktop

1. Open the **Figma Desktop App**.
2. Open any existing file or create a new design file.
3. Open the main menu (Figma icon or right-click canvas) and navigate to:
   **Plugins → Development → Import plugin from manifest...**
4. In the file picker, select:
   `Droppy-Figma-Screenshot/figma-plugin/manifest.json`
5. The plugin **Screenshot Inbox** is now installed.
6. Run it at any time via **Plugins → Development → Screenshot Inbox** (or search `Screenshot Inbox` in Quick Actions `Cmd + /` / `Ctrl + /`).

---

## 4. Phone Upload Instructions

1. Ensure your phone is connected to the **same Wi-Fi** as your computer.
2. Open your phone's browser (Safari, Chrome, etc.).
3. Type the address displayed in your terminal upon server startup:
   `http://192.168.x.x:3847` (e.g. `http://192.168.1.105:3847`).
4. Tap **Select Screenshot** → choose a photo or screenshot from your library.
5. Review the instant preview (thumbnail, dimensions, file size).
6. Tap **Send to Figma**.
7. You will see `✓ Screenshot sent` — the image is now in your Droppy queue.

---

## 5. Using the Figma Plugin

- **View Queue**: When you open the plugin, it fetches pending screenshots from `http://localhost:3847/screenshots`.
- **Insert Single Screenshot**:
  - Click **Insert** on any screenshot card.
  - If a layer is currently selected on your Figma canvas, the screenshot is placed **to the right** of your selection.
  - If nothing is selected, it is placed at the **center of your current viewport**.
  - The layer is automatically named `Screenshot — HH:MM:SS` (e.g. `Screenshot — 14:32:07`).
- **Insert All (Grid Layout)**:
  - Click **Insert All** at the bottom of the plugin window.
  - Arranges all queued screenshots in a clean, non-overlapping grid with **100px horizontal and vertical gaps**.
- **Delete Screenshot**:
  - Click **Delete** next to any item to remove it from the server queue and update the list.
- **Auto-Downscaling (>4096px)**:
  - Figma restricts image nodes to a maximum of 4096px per dimension. If a screenshot exceeds 4096px, Droppy automatically downscales it proportionally before inserting, preventing crashes.

---

## 6. Limitations & Notes

- **Local Network Scope**: Your phone and computer must be on the same local Wi-Fi / subnet. Droppy intentionally uses no external cloud servers or databases.
- **Figma Desktop App**: Importing local development plugins requires the Figma Desktop application.
- **Keep Server Running**: The plugin communicates with `http://localhost:3847`. The server must remain active while inserting screenshots.
