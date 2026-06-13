# World Cup 2026 — Predictions Dashboard

A static web dashboard for tracking World Cup predictions among a group of friends. Players submit their score predictions via Excel files; the dashboard displays live results, scores each prediction, and ranks players on a leaderboard.

---

## Project structure

| Path | Purpose |
|------|---------|
| `index.html` | The entire frontend — one self-contained file |
| `data.json` | Single source of truth: matches, predictions, actual scores |
| `parse_predictions.ps1` | Regenerates `data.json` from the Excel files |
| `predictions/` | Folder containing one `.xlsx` (or `.ods`) file per player |
| `scripts/update-scores.js` | Node.js script run by CI to fetch live scores automatically |
| `.github/workflows/update-scores.yml` | GitHub Actions workflow that runs the score update on a schedule |

---

## Prerequisites

- **Windows** with PowerShell 5.1+ and Microsoft Excel installed (for `parse_predictions.ps1`)
- **Node.js** 18+ (for running `scripts/update-scores.js` locally)
- **Git**
- A **GitHub** account and repository
- A **Netlify** account (or any static host)

---

## Initial setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
```

### 2. Configure players

Open `parse_predictions.ps1` and edit the `$playerFiles` hashtable near the top. Each entry maps a player display name to their Excel file inside the `predictions/` folder:

```powershell
$predictiiPath = "$BasePath\predictii"

$playerFiles = [ordered]@{
    "ALICE"  = "$predictiiPath\predictii ALICE.xlsx"
    "BOB"    = "$predictiiPath\predictii BOB.xlsx"
    # add one line per player
}
```

Also set the admin password used to unlock score editing on the dashboard:

```powershell
$adminPassword = "your-password-here"
```

### 3. Generate data.json

Place each player's `.xlsx` file in the `predictions/` folder, then run:

```powershell
powershell -ExecutionPolicy Bypass -File ".\parse_predictions.ps1"
```

This reads all Excel files and writes a fresh `data.json`.

### 4. Deploy

Push to GitHub and connect the repository to [Netlify](https://netlify.com) (or another static host). Every push to `main` triggers an automatic redeploy.

```bash
git add .
git commit -m "Initial setup"
git push
```

---

## Automated score updates

Actual scores are fetched automatically via a GitHub Actions workflow that runs hourly during match windows.

### Required secrets

Add the following secrets to your GitHub repository (**Settings → Secrets and variables → Actions**):

| Secret | Description |
|--------|-------------|
| `FOOTBALL_API_KEY` | API key from [football-data.org](https://www.football-data.org/) |
| `API_FOOTBALL_KEY` | API key from [api-sports.io](https://www.api-sports.io/) (used for goal scorers; fallback only) |

The workflow is defined in `.github/workflows/update-scores.yml`. It can also be triggered manually from the **Actions** tab in GitHub.

---

## Adding a new player mid-tournament

1. Add their `.xlsx` file to the `predictions/` folder.
2. Add an entry for them in `parse_predictions.ps1` under `$playerFiles`.
3. Regenerate and push:

```powershell
powershell -ExecutionPolicy Bypass -File ".\parse_predictions.ps1"
git add data.json parse_predictions.ps1 predictions/
git commit -m "Add predictions for NEW-PLAYER"
git push
```

---

## Updating scores manually

Scores are updated automatically by the CI workflow, but they can also be set manually.

### Via the admin panel (recommended)

1. Open the live site.
2. Click the **⚙ gear button** (bottom-right) and enter the admin password.
3. Type the actual score on each match card (format: `2-1`).
4. Click **Export JSON**, then replace `data.json` in the repository with the exported content.

### Via direct file edit

Open `data.json`, find the match, and change `"actual_score": null` to `"actual_score": "2-1"`, then push.

---

## Scoring rules

| Result | Points |
|--------|--------|
| Exact score predicted correctly | **3 points** |
| Correct outcome (win / draw / loss), wrong score | **1 point** |
| Wrong outcome | **0 points** |

Dashboard colors: **green** = 3 pts · **amber** = 1 pt · **red** = 0 pts · **gray** = match not played yet.

---

## Local preview

To preview the site locally without deploying:

```bash
# Python (any platform)
python -m http.server 8080
```

Then open `http://localhost:8080`. Alternatively, use the **Live Server** extension in VS Code (right-click `index.html` → *Open with Live Server*).
