# ===========================================================================
# run-supa-sql.ps1 — run arbitrary SQL against a Supabase project via the
# Management API (/v1/projects/{ref}/database/query).
#
# Auth: reads the Supabase CLI access token from Windows Credential Manager
#       (target "Supabase CLI:supabase"). The token is never printed.
#
# Usage:
#   .\scripts\run-supa-sql.ps1 -Ref dfwqakoyittmrwbqvxgw -Sql "SELECT 1"
#   .\scripts\run-supa-sql.ps1 -Ref hifouuofcaytijrkbvcy -File .\q.sql
#   .\scripts\run-supa-sql.ps1 -Ref <ref> -File .\q.sql -Pretty
#
# Output: the JSON result of the query (array of row objects, or the raw
#         response on error). Use -Pretty for multi-line JSON.
# ===========================================================================
param(
  [Parameter(Mandatory = $true)][string]$Ref,
  [string]$Sql,
  [string]$File,
  [switch]$Pretty
)

$ErrorActionPreference = "Stop"

if ($File -and -not $Sql) {
  $Sql = Get-Content -Raw -Path $File
}
if (-not $Sql) { throw "Provide -Sql or -File" }

# --- Read the CLI access token from Windows Credential Manager -------------
# A unique class name per run: PowerShell keeps types loaded for the lifetime
# of the session, and a stale (mis-decoded) copy must never win.
$cls = "CredMan" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class $cls {
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool CredRead(string target, int type, int reserved, out IntPtr credential);
    [DllImport("advapi32.dll")]
    public static extern void CredFree(IntPtr buffer);

    [StructLayout(LayoutKind.Sequential)]
    public struct CREDENTIAL {
        public int Flags; public int Type;
        public IntPtr TargetName; public IntPtr Comment;
        public long LastWritten;
        public int CredentialBlobSize; public IntPtr CredentialBlob;
        public int Persist; public int AttributeCount;
        public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName;
    }

    public static string Read(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) return null;
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            if (cred.CredentialBlob == IntPtr.Zero) return null;
            byte[] bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, cred.CredentialBlobSize);
            // The Go CLI stores the token UTF-8 in the blob (not UTF-16).
            return System.Text.Encoding.UTF8.GetString(bytes);
        } finally { CredFree(ptr); }
    }
}
"@
$token = & ([scriptblock]::Create("[$cls]::Read('Supabase CLI:supabase')"))
if (-not $token) { throw "No Supabase CLI token found in Credential Manager. Run 'supabase login' first." }

# --- Call the Management API ------------------------------------------------
$body = @{ query = $Sql } | ConvertTo-Json
$headers = @{
  "Authorization" = "Bearer $token"
  "Content-Type"  = "application/json"
}

$uri = "https://api.supabase.com/v1/projects/$Ref/database/query"
try {
  $resp = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body
  if ($Pretty) {
    $resp | ConvertTo-Json -Depth 10
  } else {
    $resp | ConvertTo-Json -Depth 10 -Compress
  }
} catch {
  $detail = $_.Exception.Message
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }
  Write-Error "Management API call failed: $detail"
  exit 1
}
