# Learning App Backend Setup Script for Windows
Write-Host "🚀 Setting up Learning App Backend..." -ForegroundColor Green

# Check if we're in the Backend directory
if (!(Test-Path "package.json")) {
    Write-Host "❌ Please run this script from the Backend directory" -ForegroundColor Red
    exit 1
}

# Step 1: Clean install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Step 2: Copy environment file
Write-Host "⚙️ Setting up environment configuration..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env file from template" -ForegroundColor Green
    Write-Host "📝 Please edit .env file with your configuration:" -ForegroundColor Cyan
    Write-Host "   - Database credentials" -ForegroundColor White
    Write-Host "   - GEMINI_API_KEY (required)" -ForegroundColor White
    Write-Host "   - OPENAI_API_KEY (optional)" -ForegroundColor White
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

# Step 3: Check PostgreSQL
Write-Host "🐘 Checking PostgreSQL..." -ForegroundColor Yellow

# Try to connect to PostgreSQL
$pgConnected = $false
try {
    $result = psql -U postgres -d postgres -c "SELECT version();" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $pgConnected = $true
        Write-Host "✅ PostgreSQL is running" -ForegroundColor Green
    }
} catch {
    # PostgreSQL not accessible
}

if (!$pgConnected) {
    Write-Host "❌ PostgreSQL is not accessible" -ForegroundColor Red
    Write-Host "📝 Please ensure PostgreSQL is installed and running:" -ForegroundColor Cyan
    Write-Host "   1. Install PostgreSQL from https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host "   2. Start PostgreSQL service" -ForegroundColor White
    Write-Host "   3. Create a user and database:" -ForegroundColor White
    Write-Host "      psql -U postgres" -ForegroundColor Gray
    Write-Host "      CREATE USER learningapp WITH PASSWORD 'your_password';" -ForegroundColor Gray
    Write-Host "      CREATE DATABASE learningapp OWNER learningapp;" -ForegroundColor Gray
    Write-Host "      GRANT ALL PRIVILEGES ON DATABASE learningapp TO learningapp;" -ForegroundColor Gray
    Write-Host "" -ForegroundColor White
    Write-Host "   Then update your .env file with the correct credentials" -ForegroundColor White
    exit 1
}

# Step 4: Create database and user if needed
Write-Host "🗄️ Setting up database..." -ForegroundColor Yellow

$dbExists = $false
try {
    $result = psql -U postgres -d learningapp -c "SELECT 1;" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $dbExists = $true
        Write-Host "✅ Database 'learningapp' already exists" -ForegroundColor Green
    }
} catch {
    # Database doesn't exist
}

if (!$dbExists) {
    Write-Host "📝 Creating database and user..." -ForegroundColor Cyan
    
    # Create user and database
    $createCommands = @"
CREATE USER learningapp WITH PASSWORD 'learningapp123';
CREATE DATABASE learningapp OWNER learningapp;
GRANT ALL PRIVILEGES ON DATABASE learningapp TO learningapp;
"@
    
    $createCommands | psql -U postgres -d postgres
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Created database and user" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to create database. Please create manually." -ForegroundColor Red
        exit 1
    }
}

# Step 5: Apply database schema
Write-Host "📋 Applying database schema..." -ForegroundColor Yellow

try {
    psql -U learningapp -d learningapp -f "database/schema.sql"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database schema applied successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to apply schema" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Failed to apply schema" -ForegroundColor Red
    exit 1
}

# Step 6: Create upload directories
Write-Host "📁 Creating upload directories..." -ForegroundColor Yellow

$uploadDirs = @("uploads", "uploads/videos", "uploads/presentations", "uploads/audio", "uploads/temp")
foreach ($dir in $uploadDirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Created directory: $dir" -ForegroundColor Green
    }
}

# Step 7: Final checks
Write-Host "🔍 Running final checks..." -ForegroundColor Yellow

# Check if .env has required keys
$envContent = Get-Content ".env" -Raw
if ($envContent -notmatch "GEMINI_API_KEY=.+") {
    Write-Host "⚠️ Warning: GEMINI_API_KEY not set in .env file" -ForegroundColor Yellow
}

if ($envContent -notmatch "DB_PASS=.+") {
    Write-Host "⚠️ Warning: DB_PASS not set in .env file" -ForegroundColor Yellow
}

Write-Host "" -ForegroundColor White
Write-Host "🎉 Setup completed!" -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Edit .env file with your API keys:" -ForegroundColor White
Write-Host "      - Get GEMINI_API_KEY from https://aistudio.google.com/app/apikey" -ForegroundColor Gray
Write-Host "      - Optionally get OPENAI_API_KEY from https://platform.openai.com/api-keys" -ForegroundColor Gray
Write-Host "   2. Update database credentials in .env if needed" -ForegroundColor White
Write-Host "   3. Start the server: npm start" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "🔗 Useful URLs (after starting):" -ForegroundColor Cyan
Write-Host "   - Health check: http://localhost:5000/health" -ForegroundColor Gray
Write-Host "   - API docs: See README.md for endpoint documentation" -ForegroundColor Gray
