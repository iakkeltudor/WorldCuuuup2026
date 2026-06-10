# World Cup 2026 — Predictions Dashboard

A static web dashboard for tracking World Cup group stage predictions.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | The dashboard |
| `data.json` | All match data, predictions, actual scores — the single source of truth |
| `parse_predictions.ps1` | Regenerates `data.json` from Excel files |
| `predictii *.xlsx` | Each player's predictions |

---

## Hosting — Netlify (free, private repo)

The site is deployed via [Netlify](https://netlify.com), connected to a private GitHub repo.
Every `git push` to `main` triggers an automatic redeploy (~30 seconds).

**Live URL:** `https://mondial2026.netlify.app` *(update if you renamed it)*

### One-time setup (already done)

1. Create a private GitHub repo and push the files (see "Pushing to GitHub" below)
2. Sign in to [app.netlify.com](https://app.netlify.com) with GitHub
3. "Add new site" → pick the repo → Deploy
4. Optionally rename: **Site configuration → Site details → Change site name**

---

## Common commands

All commands assume you're in the project folder. Open a terminal there, or run:

```powershell
cd "C:\Users\tiakkel\onedrive - endava\desktop\Folderul\Personal Projects\Predictii Mondial"
```

### Regenerate data.json from Excel files

Run this whenever you add a new player or their Excel file changes:

```powershell
powershell -ExecutionPolicy Bypass -File ".\parse_predictions.ps1"
```

### Push changes to GitHub (triggers Netlify redeploy)

After regenerating `data.json` or editing any file:

```powershell
git add data.json parse_predictions.ps1
git commit -m "your message here"
git push
```

First-time push (one-time setup, already done):

```powershell
git init
git add index.html data.json parse_predictions.ps1 README.md
git commit -m "Initial dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

### Preview locally before pushing

```powershell
py -m http.server 8080
```

Then open http://localhost:8080 — useful for testing score colors and layout.

---

## Adding a new player

1. Save their Excel file in this folder
2. Open `parse_predictions.ps1` and add them to `$playerFiles` at the top:
   ```powershell
   $playerFiles = [ordered]@{
       "IAKKEL"      = "$BasePath\predictii IAKKEL.xlsx"
       "OLO"         = "$BasePath\predictii-OLO.xlsx"
       "MARC BORLEANU" = "$BasePath\predictii BORLEANU MARC.xlsx"
       "BEN"         = "$BasePath\predictii BEN.xlsx"
       "NEWPLAYER"   = "$BasePath\predictii-NEWPLAYER.xlsx"  # add here
   }
   ```
3. Regenerate and push:
   ```powershell
   powershell -ExecutionPolicy Bypass -File ".\parse_predictions.ps1"
   git add data.json parse_predictions.ps1
   git commit -m "Add NEWPLAYER predictions"
   git push
   ```

---

## Updating actual scores after a match

### Option A — Admin Mode on the site (easiest)

1. Open the live site
2. Click the **⚙ gear button** (bottom-right) → password: `mondial2026`
3. Type the actual score on each match card (format: `2-1`)
4. Click **Export JSON**
5. Copy the JSON → replace `data.json` in the GitHub repo:
   - Go to your GitHub repo → click `data.json` → pencil ✏️ edit icon
   - Select all, paste → **Commit changes**
6. Netlify redeploys in ~30 seconds ✓

### Option B — Edit data.json directly

Open `data.json`, find the match, change `"actual_score": null` to `"actual_score": "2-1"`, then push:

```powershell
git add data.json
git commit -m "Add scores for June 11"
git push
```

---

## Scoring rules

| Result | Points |
|--------|--------|
| Exact score (e.g., predicted 2-1, actual 2-1) | **3 points** |
| Correct outcome (win/draw/loss) but wrong score | **1 point** |
| Wrong outcome | **0 points** |

Colors on the dashboard: green = 3 pts, amber = 1 pt, red = 0 pts, gray = not played yet.
