# World Cup 2026 — Predictions Dashboard

A static web dashboard for tracking World Cup group stage predictions.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | The dashboard (open this in a browser) |
| `data.json` | All match data, predictions, actual scores |
| `parse_predictions.ps1` | Regenerates `data.json` from Excel files |
| `predictii *.xlsx` | Each player's predictions |

---

## Hosting on GitHub Pages (free, shareable link)

### One-time setup (~5 minutes)

1. **Create a GitHub account** at https://github.com if you don't have one.

2. **Create a new repository**
   - Click the **+** icon → "New repository"
   - Name it something like `mondial-2026`
   - Set it to **Public** (required for free GitHub Pages)
   - Click **Create repository**

3. **Upload the files**
   - On the new repo page, click **"uploading an existing file"**
   - Drag and drop: `index.html` and `data.json`
   - Click **Commit changes**

4. **Enable GitHub Pages**
   - Go to your repo **Settings** → scroll down to **Pages**
   - Under "Source", select **Deploy from a branch**
   - Branch: `main`, Folder: `/ (root)`
   - Click **Save**

5. **Get the link**
   - Wait ~1 minute, then refresh the Pages settings
   - Your site will be at: `https://YOUR-USERNAME.github.io/mondial-2026/`
   - Share this link with everyone!

---

## Updating actual scores

### Option A — Admin Mode (easiest, no git knowledge needed)

1. Open the site
2. Click the **⚙ gear button** in the bottom-right corner
3. Enter the admin password: `mondial2026` (change it in `parse_predictions.ps1`)
4. Type actual scores into each match (format: `2-1`)
5. Click **Export JSON**
6. Copy the JSON, replace `data.json` on GitHub:
   - Go to your GitHub repo
   - Click `data.json` → click the pencil ✏️ edit icon
   - Select all, paste the new content
   - Click **Commit changes**
7. Site updates in ~60 seconds ✓

### Option B — Direct edit

Edit `data.json` locally, find the match, set `"actual_score": "2-1"` (replacing `null`).
Then upload the updated file to GitHub as above.

---

## Adding more players

1. Get their Excel file (same format as the existing ones)
2. Save it in this folder
3. Open `parse_predictions.ps1` and add their name + file to `$playerFiles`
4. Run the script: `.\parse_predictions.ps1`
5. Upload the new `data.json` to GitHub

---

## Scoring rules

| Result | Points |
|--------|--------|
| Exact score (e.g., predicted 2-1, actual 2-1) | **3 points** |
| Correct outcome (win/draw/loss) but wrong score | **1 point** |
| Wrong outcome | **0 points** |

---

## Running locally (for testing before pushing)

```
py -m http.server 8080
```
Then open http://localhost:8080
