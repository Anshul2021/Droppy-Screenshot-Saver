# 💧 Droppy — Cloud & Local Screenshot Inbox for Figma

> **Bridge screenshots from your phone to your Figma canvas in real-time — powered by Supabase Cloud & Vercel or Local Wi-Fi.**

<p align="left">
  <img src="https://img.shields.io/badge/Figma-Plugin-blue?logo=figma&logoColor=white" alt="Figma Plugin" />
  <img src="https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/Backend-Supabase-emerald?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/License-MIT-gray" alt="MIT" />
</p>

---

## 🌟 What is Droppy Cloud?

Droppy allows anyone to take screenshots on their mobile phone and have them appear **live inside their Figma canvas in real time**.

- 📱 **Zero App Installation for Phone**: Users simply scan a QR code from Figma.
- ⚡ **Direct-to-Cloud Upload**: Uploads directly to Supabase Storage with Row-Level Security (RLS).
- 🗂️ **Figma Section Organizer**: Auto-creates named Figma Sections and arranges screenshots in clean grids.
- 🔒 **Safe Multi-Project Isolation**: Runs in its own dedicated table (`droppy_screenshots`) and storage bucket without affecting any of your existing Supabase tables (e.g. `profiles`).

---

## 🚀 3-Step Cloud Setup Guide

### Step 1: Run SQL in Supabase (1 Minute)
1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. Go to **SQL Editor** (left menu).
3. Open [`supabase/schema.sql`](file:///Users/fwcuser/Desktop/Droppy-Figma-Screenshot/supabase/schema.sql) in this repo, copy its contents, and click **Run**.

> [!NOTE]
> **Coexistence Guarantee:** This migration only creates the `droppy_screenshots` table and `droppy-screenshots` bucket. It will **never** alter or overwrite your existing tables like `profiles` or existing Auth configurations.

---

### Step 2: Deploy Web App to Vercel (1 Minute)
1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com/new) → Import your repository.
3. Set the **Root Directory** to `web`.
4. Add the following **Environment Variables** in Vercel settings (from Supabase Dashboard → *Project Settings* → *API*):
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://your-project.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `eyJhbGci...`
5. Click **Deploy**. You will get a live URL (e.g. `https://droppy.vercel.app`).

---

### Step 3: Load the Plugin in Figma Desktop
1. Open Figma Desktop App.
2. Go to: **Plugins → Development → Import plugin from manifest...**
3. Select `figma-plugin/manifest.json`.
4. Run the plugin (`Cmd + /` on Mac or `Ctrl + /` on Windows → type **Droppy**).
5. Click the ⚙️ **Settings** icon, enter your Supabase URL & Anon Key, and click **Save**.
6. Click **Sign in with Google**!

---

## 📱 How Users Use Droppy

1. **Open Figma Plugin**: The user launches Droppy inside Figma.
2. **Scan Dynamic QR Code**: The plugin displays a secure QR code paired to their account.
3. **Select Photos on Mobile**: The user scans the QR with their mobile camera, selects 1 or 20 screenshots, and taps **Send to Figma**.
4. **Insert into Canvas**: Screenshots stream live into the Figma plugin. Choose a Section name or click **Insert All**!

---

## 🛠️ Environment Variables Reference

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project API URL | `https://xyzproject.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Public / Anon API Key | `eyJhbGciOiJIUzI1Ni...` |
| `NEXT_PUBLIC_APP_URL` | Deployed Vercel Web App URL | `https://droppy.vercel.app` |

---

## 💻 Optional: Local Wi-Fi Mode (Offline)

If you prefer to run offline over local Wi-Fi without cloud services:
```bash
cd server
npm install
npm start
```
Open `http://localhost:3847` on desktop and the printed IP on mobile.

---

## 📂 Repository Structure

```text
Droppy-Screenshot-Saver/
├── supabase/
│   └── schema.sql          # 1-click Supabase database & storage migration
├── web/                    # Vercel-ready mobile/desktop web client
│   ├── index.html          # Responsive mobile interface with Google Auth
│   ├── style.css           # Modern dark mode design system & shimmers
│   ├── app.js              # Direct Supabase Storage upload & Realtime sync
│   ├── config.js           # Runtime configuration
│   ├── vercel.json         # Vercel deployment routing & headers
│   └── package.json        # Web dependencies
├── figma-plugin/
│   ├── manifest.json       # Figma manifest with Supabase network permissions
│   ├── code.js             # Figma canvas section creation & grid layout
│   ├── ui.html             # Figma UI with Google Auth & QR pairing
│   ├── ui.js               # Realtime Supabase synchronization engine
│   └── logo.png            # 2D Droppy logo asset
├── server/                 # Local Node.js Express server fallback
│   ├── server.js
│   └── package.json
├── .env.example            # Environment variables template
└── README.md
```

---

## 📄 License
MIT License. Free to use and customize.
