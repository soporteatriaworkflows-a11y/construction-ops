<#
.SYNOPSIS
    Valida la configuracion de agentes Claude Code para Construction Ops.

.DESCRIPTION
    Comprueba que .claude/agents/ contenga exactamente los 11 agentes
    esperados con frontmatter YAML valido, configuracion correcta,
    aislamiento adecuado y sin permissionMode prohibido.

    Imprime PASS / WARN / FAIL por cada verificacion y termina con
    codigo distinto de cero si existe al menos un FAIL.

.NOTES
    Project: Construction Ops
    Owner:   agent-orchestrator
#>

$ErrorActionPreference = 'Stop'

# --- Configuracion --------------------------------------------------
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$AgentsDir = Join-Path $RepoRoot '.claude\agents'
$ObsoleteAgentsDir = Join-Path $RepoRoot 'agents'

$ExpectedAgents = @(
    'agent-orchestrator',
    'agent-db-rls',
    'agent-excel-mapper',
    'agent-cost-domain',
    'agent-pricing',
    'agent-homecenter',
    'agent-frontend-boq',
    'agent-dashboard',
    'agent-planning',
    'agent-exports',
    'agent-qa'
)

$ExpectedConfig = @{
    'agent-orchestrator' = @{ Model='opus';   Effort='xhigh'; MaxTurns=70; Color='purple'; Isolation=$false }
    'agent-db-rls'       = @{ Model='opus';   Effort='high';  MaxTurns=50; Color='blue';   Isolation=$true  }
    'agent-excel-mapper' = @{ Model='opus';   Effort='xhigh'; MaxTurns=60; Color='cyan';   Isolation=$true  }
    'agent-cost-domain'  = @{ Model='opus';   Effort='xhigh'; MaxTurns=70; Color='red';    Isolation=$true  }
    'agent-pricing'      = @{ Model='opus';   Effort='high';  MaxTurns=50; Color='orange'; Isolation=$true  }
    'agent-homecenter'   = @{ Model='sonnet'; Effort='high';  MaxTurns=45; Color='yellow'; Isolation=$true  }
    'agent-frontend-boq' = @{ Model='sonnet'; Effort='high';  MaxTurns=60; Color='green';  Isolation=$true  }
    'agent-dashboard'    = @{ Model='sonnet'; Effort='high';  MaxTurns=45; Color='pink';   Isolation=$true  }
    'agent-planning'     = @{ Model='opus';   Effort='high';  MaxTurns=55; Color='cyan';   Isolation=$true  }
    'agent-exports'      = @{ Model='sonnet'; Effort='high';  MaxTurns=50; Color='orange'; Isolation=$true  }
    'agent-qa'           = @{ Model='opus';   Effort='xhigh'; MaxTurns=70; Color='red';    Isolation=$true  }
}

$RequiredKeys = @(
    'name',
    'description',
    'tools',
    'model',
    'permissionMode',
    'maxTurns',
    'memory',
    'effort',
    'color'
)

# --- Estado --------------------------------------------------------
$script:Pass = 0
$script:Warn = 0
$script:Fail = 0

function Write-Pass([string]$msg) {
    Write-Host "  PASS  $msg" -ForegroundColor Green
    $script:Pass++
}
function Write-Warn([string]$msg) {
    Write-Host "  WARN  $msg" -ForegroundColor Yellow
    $script:Warn++
}
function Write-Fail([string]$msg) {
    Write-Host "  FAIL  $msg" -ForegroundColor Red
    $script:Fail++
}
function Write-Section([string]$title) {
    Write-Host ""
    Write-Host "--- $title ---" -ForegroundColor Cyan
}

# --- Helpers -------------------------------------------------------
function Get-Frontmatter([string]$path) {
    $raw = Get-Content -Path $path -Raw -Encoding UTF8
    if ($raw -notmatch '(?s)^---\r?\n(.*?)\r?\n---') {
        return $null
    }
    return $Matches[1]
}

function Get-YamlValue([string]$frontmatter, [string]$key) {
    $pattern = '(?m)^' + [regex]::Escape($key) + '\s*:\s*(.+?)\s*$'
    if ($frontmatter -match $pattern) {
        return $Matches[1].Trim()
    }
    return $null
}

function Test-YamlKeyPresent([string]$frontmatter, [string]$key) {
    $pattern = '(?m)^' + [regex]::Escape($key) + '\s*:'
    return $frontmatter -match $pattern
}

# --- 1) Existencia de carpetas -------------------------------------
Write-Section '1. Estructura de carpetas'

if (Test-Path -Path $AgentsDir -PathType Container) {
    Write-Pass ".claude/agents existe"
} else {
    Write-Fail ".claude/agents NO existe"
}

if (Test-Path -Path $ObsoleteAgentsDir -PathType Container) {
    Write-Fail "Carpeta obsoleta agents/ aun existe -- debe eliminarse"
} else {
    Write-Pass "Carpeta obsoleta agents/ ausente"
}

# --- 2) Inventario de archivos -------------------------------------
Write-Section '2. Inventario de agentes (11 esperados)'

$actualFiles = @()
if (Test-Path $AgentsDir) {
    $actualFiles = @(Get-ChildItem -Path $AgentsDir -Filter '*.md' -File | Select-Object -ExpandProperty BaseName)
}

foreach ($expected in $ExpectedAgents) {
    if ($actualFiles -contains $expected) {
        Write-Pass "Agente presente: $expected"
    } else {
        Write-Fail "Agente FALTANTE: $expected"
    }
}

$unexpected = $actualFiles | Where-Object { $ExpectedAgents -notcontains $_ }
foreach ($extra in $unexpected) {
    Write-Warn "Agente inesperado en .claude/agents: $extra"
}

# --- 3..16) Validacion por agente ----------------------------------
Write-Section '3-16. Frontmatter y configuracion por agente'

foreach ($agent in $ExpectedAgents) {
    $path = Join-Path $AgentsDir "$agent.md"
    if (-not (Test-Path $path)) {
        Write-Fail "$agent : archivo no existe, se omite la validacion individual"
        continue
    }

    Write-Host ""
    Write-Host "[$agent]" -ForegroundColor Magenta

    $fm = Get-Frontmatter -path $path
    if ($null -eq $fm) {
        Write-Fail "$agent : sin frontmatter YAML"
        continue
    } else {
        Write-Pass "$agent : frontmatter YAML detectado"
    }

    foreach ($key in $RequiredKeys) {
        if (Test-YamlKeyPresent -frontmatter $fm -key $key) {
            Write-Pass "$agent : tiene '$key'"
        } else {
            Write-Fail "$agent : FALTA clave '$key'"
        }
    }

    $memory = Get-YamlValue -frontmatter $fm -key 'memory'
    if ($memory -eq 'project') {
        Write-Pass "$agent : memory = project"
    } else {
        Write-Fail "$agent : memory debe ser 'project' (actual: '$memory')"
    }

    $permissionMode = Get-YamlValue -frontmatter $fm -key 'permissionMode'
    if ($permissionMode -eq 'bypassPermissions') {
        Write-Fail "$agent : permissionMode prohibido 'bypassPermissions'"
    } else {
        Write-Pass "$agent : permissionMode = '$permissionMode' (no bypassPermissions)"
    }

    $cfg = $ExpectedConfig[$agent]
    if ($null -ne $cfg) {
        $model = Get-YamlValue -frontmatter $fm -key 'model'
        if ($model -eq $cfg.Model) {
            Write-Pass "$agent : model = '$model' (esperado)"
        } else {
            Write-Fail "$agent : model esperado '$($cfg.Model)' / actual '$model'"
        }

        $effort = Get-YamlValue -frontmatter $fm -key 'effort'
        if ($effort -eq $cfg.Effort) {
            Write-Pass "$agent : effort = '$effort' (esperado)"
        } else {
            Write-Fail "$agent : effort esperado '$($cfg.Effort)' / actual '$effort'"
        }

        $maxTurnsRaw = Get-YamlValue -frontmatter $fm -key 'maxTurns'
        $maxTurns = 0
        if ([int]::TryParse($maxTurnsRaw, [ref]$maxTurns)) {
            if ($maxTurns -eq $cfg.MaxTurns) {
                Write-Pass "$agent : maxTurns = $maxTurns (esperado)"
            } else {
                Write-Fail "$agent : maxTurns esperado $($cfg.MaxTurns) / actual $maxTurns"
            }
        } else {
            Write-Fail "$agent : maxTurns no es numerico ('$maxTurnsRaw')"
        }

        $color = Get-YamlValue -frontmatter $fm -key 'color'
        if ($color -eq $cfg.Color) {
            Write-Pass "$agent : color = '$color' (esperado)"
        } else {
            Write-Fail "$agent : color esperado '$($cfg.Color)' / actual '$color'"
        }

        $isolation = Get-YamlValue -frontmatter $fm -key 'isolation'
        if ($cfg.Isolation) {
            if ($isolation -eq 'worktree') {
                Write-Pass "$agent : isolation = worktree (esperado)"
            } else {
                Write-Fail "$agent : DEBE tener isolation: worktree (actual: '$isolation')"
            }
        } else {
            if ($null -eq $isolation) {
                Write-Pass "$agent : sin isolation (esperado para orchestrator)"
            } else {
                Write-Fail "$agent : NO debe tener isolation (actual: '$isolation')"
            }
        }
    }

    # ag-grid-enterprise: solo permitido en lineas de prohibicion
    $lines = Get-Content -Path $path -Encoding UTF8
    $allowedMarkers = @('No instalar', 'no contiene', 'no contengan', 'prohib', 'NO ', 'AGPL')
    $offending = @()
    foreach ($line in $lines) {
        if ($line -match 'ag-grid-enterprise') {
            $isProhibition = $false
            foreach ($mk in $allowedMarkers) {
                if ($line -like "*$mk*") { $isProhibition = $true; break }
            }
            # Tambien aceptar el simbolo de prohibicion x si esta presente
            if ($line.Contains([char]0x274C)) { $isProhibition = $true }
            if (-not $isProhibition) { $offending += $line }
        }
    }
    if ($offending.Count -eq 0) {
        Write-Pass "$agent : no recomienda ag-grid-enterprise"
    } else {
        Write-Fail "$agent : referencia ag-grid-enterprise fuera de contexto prohibitivo"
        foreach ($o in $offending) { Write-Host "         > $o" -ForegroundColor Red }
    }
}

# --- 18-20) Documentos obligatorios --------------------------------
Write-Section '18-20. Documentos obligatorios'

$docs = @(
    @{ Path = (Join-Path $RepoRoot 'CLAUDE.md');                  Name = 'CLAUDE.md' },
    @{ Path = (Join-Path $RepoRoot 'docs\PROJECT_MASTER.md');     Name = 'docs/PROJECT_MASTER.md' },
    @{ Path = (Join-Path $RepoRoot 'docs\AGENT_REGISTRY.md');     Name = 'docs/AGENT_REGISTRY.md' }
)

foreach ($d in $docs) {
    if (Test-Path -Path $d.Path -PathType Leaf) {
        $size = (Get-Item $d.Path).Length
        if ($size -gt 10) {
            Write-Pass "$($d.Name) existe ($size bytes)"
        } else {
            Write-Warn "$($d.Name) existe pero esta casi vacio ($size bytes)"
        }
    } else {
        Write-Fail "$($d.Name) NO existe"
    }
}

# --- Resumen -------------------------------------------------------
Write-Host ""
Write-Host "===================================================="
Write-Host "  PASS : $script:Pass" -ForegroundColor Green
Write-Host "  WARN : $script:Warn" -ForegroundColor Yellow
Write-Host "  FAIL : $script:Fail" -ForegroundColor Red
Write-Host "===================================================="

if ($script:Fail -gt 0) {
    Write-Host "Resultado global: FAIL" -ForegroundColor Red
    exit 1
} elseif ($script:Warn -gt 0) {
    Write-Host "Resultado global: PASS con WARN" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "Resultado global: PASS" -ForegroundColor Green
    exit 0
}
