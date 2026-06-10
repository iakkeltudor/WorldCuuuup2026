# parse_predictions.ps1
# Reads all player Excel files and generates data.json
# Run this whenever you add a new player's Excel file.
#
# Usage:
#   .\parse_predictions.ps1
#
# To add a new player:
#   1. Add their xlsx file to this folder (named: predictii-NAME.xlsx or predictii NAME.xlsx)
#   2. Add their name + filename to the $playerFiles hashtable below
#   3. Re-run this script

param(
    [string]$BasePath = $PSScriptRoot
)

# ── CONFIGURE PLAYERS HERE ───────────────────────────────────────────────────
$playerFiles = [ordered]@{
    "IAKKEL" = "$BasePath\predictii IAKKEL.xlsx"
    "OLO"    = "$BasePath\predictii-OLO.xlsx"
    "MARC BORLEANU" = "$BasePath\predictii BORLEANU MARC.xlsx"
    "BEN" = "$BasePath\predictii BEN.xlsx"
    
}

# Admin password for the dashboard (change this!)
$adminPassword = "mondial2026"
# ─────────────────────────────────────────────────────────────────────────────

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $playerNames = @($playerFiles.Keys)
    $workbooks   = @{}
    $worksheets  = @{}

    foreach ($player in $playerNames) {
        $path = $playerFiles[$player]
        if (-not (Test-Path $path)) {
            Write-Warning "File not found for ${player}: $path - skipping"
            continue
        }
        $wb = $excel.Workbooks.Open($path)
        $workbooks[$player]  = $wb
        $worksheets[$player] = $wb.Sheets.Item(1)
    }

    $validPlayers = @($worksheets.Keys)
    if ($validPlayers.Count -eq 0) { throw "No valid player files found." }

    $baseWs    = $worksheets[$validPlayers[0]]
    $totalRows = $baseWs.UsedRange.Rows.Count

    $matches = [System.Collections.Generic.List[object]]::new()

    for ($r = 2; $r -le $totalRows; $r++) {
        $timeStr = $baseWs.Cells.Item($r, 1).Text
        if ([string]::IsNullOrWhiteSpace($timeStr)) { continue }

        $venue    = $baseWs.Cells.Item($r, 2).Text
        $homeTeam = $baseWs.Cells.Item($r, 3).Text
        $awayTeam = $baseWs.Cells.Item($r, 4).Text
        $group    = $baseWs.Cells.Item($r, 6).Text

        # Parse "11.06.2026 22:00 UTC+3"
        $parts = $timeStr -split '\s+'
        $dp    = $parts[0] -split '\.'
        $date  = "$($dp[2])-$($dp[1])-$($dp[0])"
        $time  = if ($parts.Count -ge 2) { $parts[1] } else { "" }
        $tz    = if ($parts.Count -ge 3) { $parts[2] } else { "UTC+3" }

        $predictions = [ordered]@{}
        foreach ($player in $validPlayers) {
            $score = $worksheets[$player].Cells.Item($r, 5).Text
            $predictions[$player] = $score
        }

        $match = [ordered]@{
            id           = [int]($r - 1)
            date         = $date
            time         = $time
            timezone     = $tz
            venue        = $venue
            home         = $homeTeam
            away         = $awayTeam
            group        = $group
            actual_score = $null
            predictions  = $predictions
        }
        $matches.Add($match)
    }

    $data = [ordered]@{
        admin_password = $adminPassword
        players        = $validPlayers
        matches        = @($matches.ToArray())
    }

    $json     = $data | ConvertTo-Json -Depth 10
    $outPath  = "$BasePath\data.json"
    [System.IO.File]::WriteAllText($outPath, $json, [System.Text.Encoding]::UTF8)

    Write-Host "OK  data.json generated: $($matches.Count) matches, $($validPlayers.Count) players ($($validPlayers -join ', '))"
    Write-Host "    -> $outPath"

} finally {
    foreach ($player in $workbooks.Keys) {
        try { $workbooks[$player].Close($false) } catch {}
    }
    try { $excel.Quit() } catch {}
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
