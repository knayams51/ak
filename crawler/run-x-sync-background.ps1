# run-x-sync-background.ps1
# Arun Kumar Living Archive - Automated Background X Broadsheet Harvester

$ProjectDir = "c:\Users\Mayank Shekhar\Downloads\Arun_Kumar"
Set-Location -Path $ProjectDir

$LogDir = Join-Path $ProjectDir "reports"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$LogFile = Join-Path $LogDir "local_x_sync.log"

function Write-Log {
    param([string]$Message)
    $Entry = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] $Message"
    Add-Content -Path $LogFile -Value $Entry
}

Write-Log "==============================================================="
Write-Log "   Starting Background X Broadsheet Harvester                  "
Write-Log "==============================================================="

# 1. Check internet connectivity to x.com
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connect = $tcp.BeginConnect("x.com", 443, $null, $null)
    $wait = $connect.AsyncWaitHandle.WaitOne(4000, $false)
    if (-not $wait) {
        $tcp.Close()
        Write-Log "No network connection to x.com. Skipping sync."
        exit 0
    }
    $tcp.EndConnect($connect)
    $tcp.Close()
} catch {
    Write-Log "Network check warning: $($_.Exception.Message). Proceeding..."
}

# 2. Pull remote changes (stay synced with daily HT articles from GitHub Actions)
Write-Log "Pulling latest changes from origin/main..."
try {
    & git pull --rebase origin main 2>&1 | Out-File -Append -FilePath $LogFile -Encoding utf8
} catch {
    Write-Log "Git pull error: $($_.Exception.Message)"
}

# 3. Execute X Harvester & OCR Engine
Write-Log "Launching X Harvester & OCR engine..."
$env:NODE_PATH = "$ProjectDir\crawler\node_modules"
$env:PATH = "C:\Program Files\Tesseract-OCR;" + $env:PATH

$nodeResult = & node "$ProjectDir\crawler\x-sync.js" 2>&1
$nodeResult | Out-File -Append -FilePath $LogFile -Encoding utf8

# 4. Check for newly ingested broadsheets
$gitStatus = & git status --porcelain site/input/Periodic_Article_update/ site/public/documents/clippings/ site/src/data/ site/public/
if ($gitStatus) {
    Write-Log "[FOUND] New broadsheet dispatches detected! Staging and committing..."
    & git add site/input/Periodic_Article_update/ site/public/documents/clippings/ site/src/data/ site/public/ reports/ 2>&1 | Out-File -Append -FilePath $LogFile -Encoding utf8
    
    $dateStr = Get-Date -Format "yyyy-MM-dd HH:mm"
    & git commit -m "feat(sync): automated print broadsheet harvest from X [$dateStr]" 2>&1 | Out-File -Append -FilePath $LogFile -Encoding utf8
    
    Write-Log "Pushing updates to GitHub origin/main..."
    & git pull --rebase origin main 2>&1 | Out-File -Append -FilePath $LogFile -Encoding utf8
    & git push origin main 2>&1 | Out-File -Append -FilePath $LogFile -Encoding utf8
    Write-Log "[SUCCESS] Successfully pushed new broadsheets to GitHub. Cloudflare Pages build triggered."
} else {
    Write-Log "[INFO] Archive is up-to-date with X print dispatches. No new broadsheets."
}

Write-Log "==============================================================="
Write-Log "   Background X Sync Finished                                  "
Write-Log "==============================================================="
