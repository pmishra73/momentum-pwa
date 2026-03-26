# ◆ Momentum PWA

> Build habits that actually stick — Progressive Web App

---

## 📁 File Structure

```
momentum-pwa/
├── index.html          ← App shell (all PWA meta tags, splash screen)
├── app.js              ← Full React app (no build step needed)
├── manifest.json       ← PWA manifest (icons, shortcuts, theme)
├── sw.js               ← Service worker (offline cache + push notifications)
├── install.js          ← Install prompt + notification manager
├── offline.html        ← Offline fallback page
├── styles.css          ← (optional) global overrides
└── icons/
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-152.png
    ├── icon-192.png
    ├── icon-384.png
    └── icon-512.png
```

---

## 🚀 Deploy Options

### Option 1: Vercel (Recommended — fastest)
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Inside the momentum-pwa folder:
cd momentum-pwa
vercel

# 3. Follow prompts. Your app will be live at https://momentum-xxx.vercel.app
```

Add a `vercel.json` for clean routing:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

### Option 2: Netlify
```bash
# Drag & drop the momentum-pwa/ folder to https://app.netlify.com/drop
# OR use the CLI:

npm install -g netlify-cli
cd momentum-pwa
netlify deploy --prod --dir .
```

Add a `_redirects` file:
```
/*  /index.html  200
```

---

### Option 3: GitHub Pages
```bash
# 1. Create a repo at github.com
git init
git add .
git commit -m "Initial Momentum PWA"
git remote add origin https://github.com/YOUR_USERNAME/momentum-pwa.git
git push -u origin main

# 2. In repo settings → Pages → Source: main branch / root
# 3. App live at https://YOUR_USERNAME.github.io/momentum-pwa/
```

---

### Option 4: Any Static Host (Apache / Nginx / S3)
Just copy all files to your web root. Ensure:
- HTTPS is enabled (required for service workers + PWA install)
- Files are served from the domain root `/`

---

## 📱 Install on Android

1. Open Chrome on your Android device
2. Navigate to your deployed URL
3. Tap the **"⋮" menu** → **"Add to Home Screen"**
4. OR wait for the **Install banner** that appears automatically in the app
5. Tap **Install** — Momentum appears on your home screen like a native app

**Works on:** Chrome for Android, Samsung Internet, Edge for Android

---

## 🍎 Install on iOS

1. Open **Safari** on iPhone/iPad
2. Navigate to your deployed URL
3. Tap the **Share button** (box with arrow)
4. Tap **"Add to Home Screen"**
5. Tap **Add** — Momentum appears on your home screen

**Note:** iOS requires Safari for PWA install. Push notifications on iOS require iOS 16.4+.

---

## 🔔 Push Notifications Setup

To enable real push notifications (beyond local reminders), you need a VAPID key pair and a backend:

### Step 1: Generate VAPID keys
```bash
npx web-push generate-vapid-keys
```

### Step 2: Update `install.js`
Replace `YOUR_VAPID_PUBLIC_KEY_HERE` with your actual public key.

### Step 3: Backend endpoint
When a user subscribes, `subscribeToPush()` returns a subscription object.
Send it to your backend and store it. Use `web-push` npm package to send notifications:

```js
// Node.js backend example
const webpush = require('web-push');
webpush.setVapidDetails('mailto:you@example.com', PUBLIC_KEY, PRIVATE_KEY);

await webpush.sendNotification(subscription, JSON.stringify({
  title: 'Momentum 🌿',
  body: "Time to check your habits!",
  url: '/?view=today'
}));
```

---

## 🛠 Development (local)

```bash
# Serve locally with HTTPS (required for SW + PWA)
# Option A: Use npx serve
npx serve . --ssl-cert localhost.pem --ssl-key localhost-key.pem

# Option B: Use Python (HTTP only — SW won't work on non-localhost)
python3 -m http.server 8080
# Then open http://localhost:8080

# Option C: VS Code Live Server extension
# Right-click index.html → Open with Live Server
```

> ⚠️ Service workers only work over HTTPS or on `localhost`.

---

## ⚙️ Customization

| What to change | Where |
|---|---|
| App name | `manifest.json` → `name`, `index.html` → `<title>` |
| Theme color | `manifest.json` → `theme_color`, `index.html` → `meta[name=theme-color]` |
| Pricing | `app.js` → `PRICING` constant (top of file) |
| Reminder time default | `install.js` → `scheduleLocalReminder(9)` |
| Cache strategy | `sw.js` → fetch event handlers |
| Icons | Replace `icons/*.png` (keep same filenames) |

---

## 📦 For Production (optional build step)

The app currently uses Babel Standalone (transpiles in-browser). For production performance:

```bash
# Install Vite
npm create vite@latest momentum-app -- --template react
# Copy app.js content into src/App.jsx
# Run: npm run build
# Deploy the dist/ folder
```

This gives you:
- ~70% smaller bundle (tree-shaking)
- No browser-side Babel (faster first load)
- Proper code splitting

---

## 🔐 Auth Note

This demo uses a simplified auth system (passwords stored as base64 in cloud storage).
For production, replace with:
- **Firebase Auth** (easiest)
- **Supabase** (open-source)
- **Auth0**
- Any JWT-based backend

---

Made with ◆ Momentum · MIT License
