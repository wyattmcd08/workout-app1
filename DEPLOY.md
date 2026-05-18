# Deploy Dialed Dawg to GitHub Pages

## One-time setup (do this once)

### 1. Create a GitHub repo

1. Go to https://github.com/new
2. Repo name: **`dialed-dawg`** (or whatever you want — see "Repo name matters" below)
3. Visibility: **Public** (private repos don't work with free GitHub Pages)
4. **Don't** check "Initialize with README", "Add .gitignore", etc. — leave it empty
5. Click **Create repository**

### 2. Push the code

From inside the `workout-app` folder, run these in PowerShell (replace `YOUR_USERNAME`):

```powershell
git init
git add .
git commit -m "Initial commit: Dialed Dawg"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/dialed-dawg.git
git push -u origin main
```

If git asks you to sign in, follow the GitHub CLI prompts or use a personal access token.

### 3. Turn on Pages with GitHub Actions

1. In your repo on GitHub: **Settings** → **Pages** (left sidebar)
2. Under **Build and deployment** → **Source**, pick **"GitHub Actions"**
3. That's it — no other settings to change. The `.github/workflows/deploy.yml` already in your repo will run automatically.

### 4. Wait for the first build

1. Go to the **Actions** tab in your repo
2. You'll see "Deploy to GitHub Pages" running. Takes ~1-2 minutes.
3. When it's green ✓, your app is live at:
   **https://YOUR_USERNAME.github.io/dialed-dawg/**

---

## Install on iPhone

1. Open Safari on your iPhone (must be Safari, not Chrome — only Safari supports PWA install on iOS)
2. Go to your GitHub Pages URL
3. Tap the **Share** button (square with arrow up)
4. Scroll down and tap **"Add to Home Screen"**
5. Tap **Add**
6. The Dialed Dawg icon appears on your home screen. Tap it — app launches full-screen, no browser bars, just like a real app.

---

## Updating after you change code

Every time you push to `main`, the Action redeploys automatically. To push changes:

```powershell
git add .
git commit -m "Describe what you changed"
git push
```

On your iPhone, close the app and reopen — the service worker auto-updates in the background.

---

## Repo name matters

The `vite.config.ts` is set to `base: './'` (relative paths), which works for **any** repo name. You don't need to change anything if your repo is `dialed-dawg` or `my-app` or whatever.

The **one exception**: if you use the special **user repo** `YOUR_USERNAME.github.io` (which serves at the root `https://YOUR_USERNAME.github.io/` with no subpath), you don't need to change anything either — relative paths handle both cases.

---

## Common issues

| Problem | Fix |
|---|---|
| White screen on first load | Hard refresh (close & reopen the home-screen app). The service worker caches aggressively. |
| Action fails on `npm ci` | Check `package-lock.json` is committed to the repo. |
| Page 404s on refresh in browser | The workflow already copies `index.html` → `404.html` for SPA fallback. If you forked/customized, make sure that step is still there. |
| Pages source set wrong | Settings → Pages → Source must be **"GitHub Actions"**, not "Deploy from a branch". |
| iOS app crashes / blank | Delete the home screen icon, clear Safari data for the site, then re-add. iOS caches PWA shells very aggressively. |

---

## Backing up your data

Your data lives in IndexedDB on whatever device you're using it on — it does **not** sync via GitHub. Use **More → Settings → Export backup** weekly to save a `.json` file to your iCloud/Files. iOS Safari can wipe site data after ~7 days of inactivity, and reinstalling the home-screen app counts as a wipe too.
