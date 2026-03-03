import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Play, ShieldCheck, Save } from 'lucide-react';
import { useAuth } from '../state/auth/AuthProvider';
import { isUserAdmin } from '../lib/profileRepo';
import { supabase } from '../lib/supabaseClient';
import '../styles/admin-preseason-seeding.css';

type TeamRow = {
  id: string;
  name: string;
  logo_url?: string | null;
  preseason_seed?: number | null;
};

type ValidationRow = { issue?: string | null };

function toSeedValue(raw: string): number | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const asInt = Math.trunc(parsed);
  if (asInt < 1 || asInt > 32) return null;
  return asInt;
}

export default function AdminPreseasonSeedingPage() {
  const { user, loading: authLoading } = useAuth();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [rows, setRows] = useState<TeamRow[]>([]);
  const [seedDraft, setSeedDraft] = useState<Record<string, string>>({});

  const [teamCount, setTeamCount] = useState<number>(10);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'validating' | 'generating'>('idle');

  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [message, setMessage] = useState<string>('');
  const [messageTone, setMessageTone] = useState<'ok' | 'warn' | 'error'>('ok');

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (authLoading) return;
      if (!user?.id) {
        if (!mounted) return;
        setIsAdmin(false);
        setCheckingAdmin(false);
        return;
      }

      try {
        const admin = await isUserAdmin(user.id);
        if (!mounted) return;
        setIsAdmin(admin);
      } catch {
        if (!mounted) return;
        setIsAdmin(false);
      } finally {
        if (mounted) setCheckingAdmin(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from('eg_teams')
        .select('id,name,logo_url,preseason_seed')
        .order('preseason_seed', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

      if (!mounted) return;

      if (error) {
        setMessage(error.message || 'Failed to load teams.');
        setMessageTone('error');
        return;
      }

      const mapped = ((data || []) as TeamRow[]).map((row) => ({
        id: String(row.id),
        name: String(row.name || 'Unknown Team'),
        logo_url: row.logo_url || null,
        preseason_seed: row.preseason_seed ?? null,
      }));

      setRows(mapped);
      const nextDraft: Record<string, string> = {};
      for (const row of mapped) {
        nextDraft[row.id] = row.preseason_seed ? String(row.preseason_seed) : '';
      }
      setSeedDraft(nextDraft);
    })();

    return () => {
      mounted = false;
    };
  }, [isAdmin]);

  const seededCount = useMemo(() => {
    return rows.reduce((acc, row) => {
      const draft = toSeedValue(seedDraft[row.id] ?? '');
      return draft ? acc + 1 : acc;
    }, 0);
  }, [rows, seedDraft]);

  async function saveSeedForTeam(teamId: string) {
    const seed = toSeedValue(seedDraft[teamId] ?? '');
    setBusy('saving');
    setMessage('');

    const { error } = await supabase
      .from('eg_teams')
      .update({ preseason_seed: seed })
      .eq('id', teamId);

    if (error) {
      setMessage(error.message || 'Failed to save seed.');
      setMessageTone('error');
      setBusy('idle');
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === teamId ? { ...r, preseason_seed: seed } : r)));
    setMessage('Seed saved.');
    setMessageTone('ok');
    setBusy('idle');
  }

  async function saveAllSeeds() {
    setBusy('saving');
    setMessage('');

    try {
      for (const row of rows) {
        const seed = toSeedValue(seedDraft[row.id] ?? '');
        const { error } = await supabase
          .from('eg_teams')
          .update({ preseason_seed: seed })
          .eq('id', row.id);

        if (error) throw new Error(error.message || 'Failed to save seeds.');
      }

      setRows((prev) => prev.map((r) => ({ ...r, preseason_seed: toSeedValue(seedDraft[r.id] ?? '') })));
      setMessage('All seeds saved.');
      setMessageTone('ok');
    } catch (error: any) {
      setMessage(error?.message || 'Failed to save seeds.');
      setMessageTone('error');
    } finally {
      setBusy('idle');
    }
  }

  async function validateSeeds() {
    setBusy('validating');
    setMessage('');

    const { data, error } = await supabase.rpc('eg_preseason_validate_seeds', {
      p_team_count: teamCount,
    });

    if (error) {
      setValidationIssues([error.message || 'Unable to validate seeds.']);
      setMessage('Validation failed.');
      setMessageTone('error');
      setBusy('idle');
      return;
    }

    const issues = ((data || []) as ValidationRow[])
      .map((row) => String(row.issue || '').trim())
      .filter(Boolean);

    setValidationIssues(issues);

    if (issues.length === 1 && issues[0].toLowerCase() === 'ok') {
      setMessage('Seeds look good.');
      setMessageTone('ok');
    } else if (issues.length === 0) {
      setMessage('No validation output returned.');
      setMessageTone('warn');
    } else {
      setMessage('Validation found issues.');
      setMessageTone('warn');
    }

    setBusy('idle');
  }

  async function generateRounds() {
    setBusy('generating');
    setMessage('');

    const { error } = await supabase.rpc('eg_preseason_reset_and_generate_rounds', {
      p_season_slug: 'preseason',
      p_team_count: teamCount,
    });

    if (error) {
      setMessage(error.message || 'Failed to generate rounds.');
      setMessageTone('error');
      setBusy('idle');
      return;
    }

    setMessage('Round 1 + Round 2 generated for Knockout Preseason.');
    setMessageTone('ok');
    setBusy('idle');
  }

  if (authLoading || checkingAdmin) {
    return (
      <section className="eg-admin-card eg-admin-seed-card">
        <h3>Preseason Seeding</h3>
        <p className="eg-admin-muted">Checking permissions…</p>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="eg-admin-card eg-admin-seed-card">
        <h3>Not authorized</h3>
        <p className="eg-admin-muted">Only admins can manage preseason seeding.</p>
      </section>
    );
  }

  return (
    <section className="eg-admin-stack eg-admin-seed-wrap">
      <article className="eg-admin-card eg-admin-seed-card">
        <header className="eg-admin-card-header">
          <div>
            <h3>Preseason Seeding</h3>
            <p>Set seeds (1 = strongest) based on AFL26 Season One form.</p>
          </div>
          <div className="eg-admin-seed-badge">
            <ShieldCheck size={14} /> {seededCount} seeded
          </div>
        </header>

        <div className="eg-admin-toolbar wrap">
          <label className="eg-admin-inline-field narrow">
            <span>Team Count</span>
            <input
              type="number"
              min={4}
              step={2}
              value={teamCount}
              onChange={(event) => setTeamCount(Math.max(4, Number(event.target.value) || 10))}
            />
          </label>

          <button type="button" className="eg-admin-btn" onClick={validateSeeds} disabled={busy !== 'idle'}>
            {busy === 'validating' ? <Loader2 size={14} className="eg-admin-spin" /> : <CheckCircle2 size={14} />} Validate seeds
          </button>

          <button type="button" className="eg-admin-btn" onClick={generateRounds} disabled={busy !== 'idle'}>
            {busy === 'generating' ? <Loader2 size={14} className="eg-admin-spin" /> : <Play size={14} />} Generate Round 1 + 2
          </button>

          <button type="button" className="eg-admin-btn" onClick={saveAllSeeds} disabled={busy !== 'idle'}>
            {busy === 'saving' ? <Loader2 size={14} className="eg-admin-spin" /> : <Save size={14} />} Save all
          </button>
        </div>

        {message ? (
          <div className={`eg-admin-seed-message is-${messageTone}`}>
            {messageTone === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span>{message}</span>
          </div>
        ) : null}

        {validationIssues.length > 0 ? (
          <div className="eg-admin-seed-issues">
            {validationIssues.map((issue, index) => (
              <div key={`${issue}-${index}`} className="eg-admin-seed-issue">
                {issue}
              </div>
            ))}
          </div>
        ) : null}
      </article>

      <article className="eg-admin-card eg-admin-seed-card">
        <header className="eg-admin-card-header">
          <div>
            <h3>Teams</h3>
            <p>Assign seeds 1..N. Leave blank to exclude from seeded priority.</p>
          </div>
        </header>

        <div className="eg-admin-seed-tableWrap">
          <table className="eg-admin-table eg-admin-seed-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Seed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="eg-admin-seed-team">
                      {row.logo_url ? <img src={row.logo_url} alt={row.name} loading="lazy" /> : <span className="eg-admin-seed-fallback">{row.name.slice(0, 2).toUpperCase()}</span>}
                      <span>{row.name}</span>
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={seedDraft[row.id] ?? ''}
                      onChange={(event) => {
                        const next = String(event.target.value || '');
                        setSeedDraft((prev) => ({ ...prev, [row.id]: next }));
                      }}
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <button type="button" className="eg-admin-btn" onClick={() => saveSeedForTeam(row.id)} disabled={busy !== 'idle'}>
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
