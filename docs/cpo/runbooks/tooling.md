# Tooling gaps — what to install, and why

**Status:** recommendation (CTO), waiting for CEO OK. Nothing has been installed. All three are free.

| Tool | Recommendation | What it unlocks | Install (PowerShell) |
|---|---|---|---|
| **Supabase CLI** | **Yes: install first** | `npm run fn:deploy` deploys all 28 functions with the right JWT settings in one command instead of 28 dashboard pastes; needed to build staging/production (environment-setup §6); reads function logs from the terminal; no more `web-deploy/` copies drifting from the source. | `winget install Supabase.CLI` |
| **GitHub CLI (`gh`)** | **Yes** | Claude opens PRs, reads Codex review comments and CI from the terminal instead of driving Chrome, which is faster and more reliable. You stay the only one who merges (D-014); `gh` doesn't change that. | `winget install GitHub.cli` |
| **Deno** | **Yes, lower priority** | Type-checks and unit-tests the edge functions before deploy (`deno check`, `deno test`), so a broken function is caught on the PC, not after a paste. Today function tests run through Node shims only. | `winget install DenoLand.Deno` |

Install commands are *assumptions* about the current winget package IDs. If one isn't found,
`winget search <name>` shows the right ID.

## After installing (one time each)

Close and reopen PowerShell, then:

```powershell
supabase --version
```

```powershell
gh auth login
```

(`gh auth login`: choose GitHub.com → HTTPS → Login with a web browser. It opens a page where you enter a
short code. No token is pasted anywhere.)

```powershell
deno --version
```

For deploys, the Supabase CLI also needs an access token **in your terminal only** (Account → Access
tokens). See [environment-setup.md](environment-setup.md) §6. Never paste it into chat.

## Not recommended now

- **Docker / local Supabase (`supabase start`):** heavy on a laptop, and dev in the cloud works. Revisit when
  we add automated database tests in CI.
- **Any paid monitoring tool:** not until there's measured need (CLAUDE.md non-negotiable 3).
