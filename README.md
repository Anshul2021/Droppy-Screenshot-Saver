# 💧 Droppy — Screenshot Inbox for Figma

> **Bridge screenshots from your phone to your Figma canvas in seconds over local Wi-Fi — zero cloud, zero accounts, zero config.**

<p align="left">
  <img src="https://img.shields.io/badge/Figma-Plugin-blue?logo=figma&logoColor=white" alt="Figma Plugin" />
  <img src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Network-Local%20Wi--Fi-purple" alt="Local Wi-Fi" />
  <img src="https://img.shields.io/badge/License-MIT-gray" alt="MIT" />
</p>

---

## ⚡ Quick Start for New Users (Takes 2 Minutes)

Follow these 4 simple steps on any new computer or device:

### 1️⃣ Clone & Start the Server
```bash
git clone https://github.com/Anshul2021/Droppy-Screenshot-Saver.git
cd Droppy-Screenshot-Saver/server
npm install
npm start
```
The terminal will print your local mobile upload link:
```text
==================================================
  DROPPY SCREENSHOT INBOX SERVER
==================================================
Server listening on http://0.0.0.0:3847
Mobile upload address: http://192.168.1.xxx:3847
==================================================
```

### 2️⃣ Load the Plugin into Figma Desktop
1. Open the **Figma Desktop App** (open any file).
2. Go to: **Plugins → Development → Import plugin from manifest...**
3. Select `Droppy-Screenshot-Saver/figma-plugin/manifest.json`.
4. Run the plugin anytime via `Cmd + /` (Mac) or `Ctrl + /` (Windows) → type **Screenshot Inbox**.

### 3️⃣ Open on Your Phone
1. Connect your phone to the **same Wi-Fi** as your computer.
2. Open Safari/Chrome on your phone and go to your printed URL (e.g. `http://192.168.1.xxx:3847`).
3. Tap **Select Screenshots** (multi-selection supported) → tap **Send to Figma**.

### 4️⃣ Drop into Canvas
- In Figma, your screenshots appear **live in real-time** (no reload needed).
- Pick or name your Figma **Section** (e.g., `Mobile Screenshots`), then click **Insert All to Canvas**!

> [!TIP]
> **Share with Teammates (Guest Mode):** If a colleague wants to send screenshots to *your* Figma file, they don't need to install anything! Just send them your local IP link while on the same Wi-Fi.

> [!IMPORTANT]
> **Office / Enterprise Wi-Fi Tip:** If your office Wi-Fi has *Client Isolation* (firewall blocking device-to-device connections), simply turn on your phone's **Personal Hotspot**, connect your laptop to it, and run `npm start`. It works 100% reliably anywhere!

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔄 **Live Sync Engine** | Screenshots uploaded from mobile pop up in Figma within ~1s without manual refresh. |
| 🗂️ **Figma Section Support** | Organizes imported screenshots into named Figma Sections in clean, non-overlapping grids. |
| 📱 **Multi-Image Selection** | Select 5, 10, or 20 screenshots at once with live dimensions and file size previews. |
| ⚡ **Smart Downscaling** | Auto-downscales images exceeding Figma's 4096px canvas limit to prevent crashes. |
| 🛡️ **Memory & Cache Optimized** | `no-store` headers and explicit blob cleanup prevent device RAM buildup when clearing inbox. |
| 🔒 **100% Private & Local** | Everything stays on your local network. No databases, accounts, or cloud storage. |

---

## 📂 Project Structure

```text
Droppy-Screenshot-Saver/
├── figma-plugin/
│   ├── manifest.json       # Figma plugin manifest (devAllowedDomains port 3847)
│   ├── code.js             # Figma main canvas thread (Section creation & grid layout)
│   ├── ui.html             # Plugin UI iframe with Live Sync & progress modal
│   ├── ui.js               # Plugin network communication & image downscaling
│   └── logo.png            # 2D flat brand logo
├── server/
│   ├── server.js           # Local Express server (binds to 0.0.0.0:3847)
│   ├── package.json        # Dependencies (Express, Multer, image-size, CORS)
│   ├── uploads/            # Filesystem queue (<timestamp>-<suffix>.<ext>)
│   └── public/             # Mobile/Desktop web upload client
│       ├── index.html      # Responsive mobile-first interface
│       ├── style.css       # Utility stylesheet with skeleton shimmer
│       ├── app.js          # Multi-selection client with active memory release
│       └── logo.png        # Brand icon & favicon
└── README.md
```

---

## 🛠️ Daily Workflow

To run Droppy anytime:
```bash
cd server
npm start
```
When you're done for the day, press `Ctrl + C` in your terminal. All code and Figma plugin configurations remain saved.
