// Environment setup pipeline — core logic (D-021). Driver-agnostic so the same code runs
// against a real database (scripts/db/apply.mjs, node-postgres) and PGlite in tests.
//
// A "db" is { exec(sql): Promise<void>, query(sql, params?): Promise<{ rows }> }.
//
// Guarantees:
//   • scripts run in manifest order, each at most once (ledger: public._marbee_schema_ledger);
//   • each script runs in its own transaction (unless it manages its own BEGIN/COMMIT);
//   • the first failure stops the run and records nothing for that script;
//   • a non-empty database without a ledger is never written to unless baselined explicitly;
//   • scripts edited after they were applied are reported (checksum drift), never re-run silently.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const LEDGER = 'public._marbee_schema_ledger';

/** Line-ending-insensitive SHA-256 so a Windows checkout never looks like an edit. */
export function checksum(sql) {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/** True when the script manages its own transaction (top-level BEGIN/COMMIT). */
export function managesOwnTransaction(sql) {
  return /^\s*(BEGIN|START\s+TRANSACTION)\s*;/im.test(sql) && /^\s*(COMMIT|END)\s*;/im.test(sql);
}

/** Ordered list of scripts the pipeline may run. */
export function loadPlan(root, manifestPath = 'supabase/sql/manifest.json') {
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));
  const plan = [];
  for (const phase of manifest.phases) {
    const re = new RegExp(phase.pattern);
    // Numeric order (100_ after 99_, not after 10_), then by name for equal numbers.
    const num = (f) => Number.parseInt(f, 10);
    const files = readdirSync(join(root, phase.dir)).filter((f) => re.test(f))
      .sort((x, y) => num(x) - num(y) || x.localeCompare(y));
    for (const file of files) {
      if (phase.exclude && Object.prototype.hasOwnProperty.call(phase.exclude, file)) continue;
      const sql = readFileSync(join(root, phase.dir, file), 'utf8');
      plan.push({
        id: `${phase.name}/${file}`,
        phase: phase.name,
        file,
        path: `${phase.dir}/${file}`,
        sql,
        checksum: checksum(sql),
        selfTx: managesOwnTransaction(sql),
      });
    }
  }
  return { manifest, plan };
}

export async function ensureLedger(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${LEDGER} (
      script      TEXT PRIMARY KEY,
      phase       TEXT NOT NULL,
      checksum    TEXT NOT NULL,
      mode        TEXT NOT NULL CHECK (mode IN ('applied', 'baseline')),
      applied_by  TEXT,
      duration_ms INTEGER,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ${LEDGER} ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON ${LEDGER} FROM PUBLIC;
    DO $$ BEGIN
      EXECUTE 'REVOKE ALL ON ${LEDGER} FROM anon, authenticated';
    EXCEPTION WHEN undefined_object THEN NULL; END $$;
  `);
}

async function ledgerExists(db) {
  const { rows } = await db.query(`SELECT to_regclass('${LEDGER}') IS NOT NULL AS ok`);
  return rows[0]?.ok === true;
}

/** What the database has vs. what the repo has. Read-only (does not create the ledger). */
export async function status(db, plan) {
  const hasLedger = await ledgerExists(db);
  const ledgerRows = hasLedger ? (await db.query(`SELECT script, phase, checksum, mode, applied_at FROM ${LEDGER}`)).rows : [];
  const byId = new Map(ledgerRows.map((r) => [r.script, r]));
  const { rows: t } = await db.query(`SELECT to_regclass('public.tenants') IS NOT NULL AS has_schema`);
  const hasSchema = t[0]?.has_schema === true;
  const applied = [];
  const pending = [];
  const drift = [];
  for (const s of plan) {
    const r = byId.get(s.id);
    if (!r) { pending.push(s); continue; }
    applied.push({ ...s, mode: r.mode, applied_at: r.applied_at });
    if (r.checksum !== s.checksum) drift.push({ id: s.id, mode: r.mode });
  }
  const known = new Set(plan.map((s) => s.id));
  const unknown = ledgerRows.filter((r) => !known.has(r.script)).map((r) => r.script);
  return {
    hasLedger,
    // "fresh" = nothing there yet; "untracked" = a schema exists but nothing records what was run.
    state: ledgerRows.length ? 'tracked' : hasSchema ? 'untracked' : 'fresh',
    applied, pending, drift, unknown,
  };
}

function select(plan, { phases = ['core'], through } = {}) {
  let list = plan.filter((s) => phases.includes(s.phase));
  if (through) {
    const idx = list.findIndex((s) => s.id === through || s.file === through || s.file.startsWith(`${through}_`));
    if (idx < 0) throw new Error(`--through ${through}: no such script in the selected phase(s)`);
    list = list.slice(0, idx + 1);
  }
  return list;
}

/**
 * Apply pending scripts (or baseline them). Returns { ran, skipped, recorded, state }.
 * Throws on the first failing script (after rolling back that script).
 */
export async function apply(db, plan, opts = {}) {
  const { phases = ['core'], through, baseline = false, dryRun = false, appliedBy = 'scripts/db', log = () => {} } = opts;
  const before = await status(db, plan);
  const wanted = select(plan, { phases, through });

  if (before.state === 'untracked' && !baseline) {
    throw new Error('This database already has a Marbee schema but no ledger, so it is unknown which scripts ran. ' +
      'Check it with tools/schema_drift_check.sql, then record it with `baseline` (marks scripts as applied without running them).');
  }
  if (baseline && before.state === 'fresh') {
    throw new Error('Refusing to baseline an empty database — use `apply` to build it.');
  }
  // A later phase needs every script of the earlier phases it depends on.
  for (const phase of phases) {
    const def = opts.manifest?.phases?.find((p) => p.name === phase);
    if (def?.requires && !phases.includes(def.requires)) {
      const missing = before.pending.filter((s) => s.phase === def.requires);
      if (missing.length) throw new Error(`Phase "${phase}" needs phase "${def.requires}" fully applied first (${missing.length} pending, e.g. ${missing[0].id}).`);
    }
  }

  const appliedIds = new Set(before.applied.map((s) => s.id));
  const todo = wanted.filter((s) => !appliedIds.has(s.id));
  if (dryRun) return { ran: [], skipped: wanted.length - todo.length, recorded: [], wouldRun: todo.map((s) => s.id), state: before.state };

  await ensureLedger(db);
  const ran = [];
  const recorded = [];
  const fresh = before.state === 'fresh';
  let preambleDone = false;

  for (const s of todo) {
    if (baseline) {
      await db.query(`INSERT INTO ${LEDGER} (script, phase, checksum, mode, applied_by) VALUES ($1, $2, $3, 'baseline', $4)`,
        [s.id, s.phase, s.checksum, appliedBy]);
      recorded.push(s.id);
      continue;
    }
    const preamble = fresh && !preambleDone && opts.manifest?.phases?.find((p) => p.name === s.phase)?.freshPreamble;
    if (preamble) { await db.exec(preamble); preambleDone = true; }

    log(`run   ${s.id}${s.selfTx ? ' (own transaction)' : ''}`);
    const started = Date.now();
    try {
      if (s.selfTx) {
        await db.exec(s.sql);
      } else {
        await db.exec('BEGIN');
        await db.exec(s.sql);
      }
      await db.query(`INSERT INTO ${LEDGER} (script, phase, checksum, mode, applied_by, duration_ms) VALUES ($1, $2, $3, 'applied', $4, $5)`,
        [s.id, s.phase, s.checksum, appliedBy, Date.now() - started]);
      if (!s.selfTx) await db.exec('COMMIT');
    } catch (e) {
      if (!s.selfTx) await db.exec('ROLLBACK').catch(() => {});
      const err = new Error(`${s.id} failed — nothing from this script was kept. ${e.message}`);
      err.script = s.id;
      err.cause = e;
      err.ran = ran;
      throw err;
    }
    ran.push(s.id);
  }
  return { ran, skipped: wanted.length - todo.length, recorded, state: before.state };
}
