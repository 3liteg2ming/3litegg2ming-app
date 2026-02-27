import { useMemo, useState } from 'react';
import { Trophy, Zap, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import '../styles/preseason.css';

type FormState = {
  firstName: string;
  lastName: string;
  dob: string;
  psn: string;
  pref1: string;
  pref2: string;
  pref3: string;
  pref4: string;
};
type PrefKey = keyof FormState;

const INITIAL_FORM: FormState = {
  firstName: '',
  lastName: '',
  dob: '',
  psn: '',
  pref1: '',
  pref2: '',
  pref3: '',
  pref4: '',
};

function teamOptions() {
  return (Object.keys(TEAM_ASSETS) as TeamKey[])
    .map((k) => ({ value: k, label: TEAM_ASSETS[k].name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default function PreseasonPage() {
  const teams = useMemo(() => teamOptions(), []);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [submitMsg, setSubmitMsg] = useState<string>('');

  const preferences = [form.pref1, form.pref2, form.pref3, form.pref4].filter(Boolean);
  const hasDuplicatePrefs = new Set(preferences).size !== preferences.length;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (submitState !== 'idle') {
      setSubmitState('idle');
      setSubmitMsg('');
    }
  }

  function validate() {
    if (!form.firstName.trim()) return 'First name is required.';
    if (!form.lastName.trim()) return 'Last name is required.';
    if (!form.dob) return 'Date of birth is required.';
    if (!form.psn.trim()) return 'PSN is required.';
    if (!form.pref1) return 'Team preference #1 is required.';
    if (hasDuplicatePrefs) return 'Team preferences must be unique.';
    return '';
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setSubmitState('error');
      setSubmitMsg(err);
      return;
    }

    setSubmitState('saving');
    setSubmitMsg('Saving your registration...');

    try {
      const payload = {
        ...form,
        preferences: [form.pref1, form.pref2, form.pref3, form.pref4].filter(Boolean),
        submittedAt: new Date().toISOString(),
        competition: 'knockout-preseason-cup',
      };
      localStorage.setItem('eg-preseason-registration-draft', JSON.stringify(payload));
      await new Promise((r) => setTimeout(r, 550));
      setSubmitState('success');
      setSubmitMsg('Registration captured. We will bring the live registration backend online soon.');
    } catch {
      setSubmitState('error');
      setSubmitMsg('Could not save registration locally. Please try again.');
    }
  }

  return (
    <div className="preseasonPage">
      <div className="preseasonWrap">
        <section className="preseasonHero">
          <div className="preseasonHero__glow" aria-hidden="true" />
          <div className="preseasonHero__badge"><Zap size={14} /> REGISTRATION OPEN</div>
          <div className="preseasonHero__titleRow">
            <div className="preseasonHero__cup"><Trophy size={22} /></div>
            <div>
              <h1 className="preseasonHero__title">Knockout Preseason Cup</h1>
              <p className="preseasonHero__sub">10 teams • Knockout format • Fast chaos</p>
            </div>
          </div>
          <p className="preseasonHero__desc">
            Warm up before the main season with a short, high-pressure tournament. Two games guaranteed, then a third match becomes elimination-style pressure.
          </p>
          <a href="#preseason-register" className="preseasonBtn preseasonBtn--primary">
            Register Now <ArrowRight size={16} />
          </a>
          <p className="preseasonHero__note">Registration form is open now. Final bracket allocation and scheduling confirmation will follow.</p>
        </section>

        <section className="preseasonCard">
          <div className="preseasonCard__head">
            <ShieldCheck size={16} /> Format Overview
          </div>
          <div className="preseasonFormatGrid">
            <div className="preseasonStep">
              <div className="preseasonStep__num">1</div>
              <div>
                <div className="preseasonStep__title">Round 1</div>
                <div className="preseasonStep__text">Opening fixture draw to seed momentum and standings.</div>
              </div>
            </div>
            <div className="preseasonStep">
              <div className="preseasonStep__num">2</div>
              <div>
                <div className="preseasonStep__title">Round 2</div>
                <div className="preseasonStep__text">Second guaranteed game for every team.</div>
              </div>
            </div>
            <div className="preseasonStep">
              <div className="preseasonStep__num">3</div>
              <div>
                <div className="preseasonStep__title">Knockout Match</div>
                <div className="preseasonStep__text">Third match becomes elimination-style based on your path and results.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="preseasonRegister" id="preseason-register">
          <div className="preseasonRegister__head">
            <div>
              <div className="preseasonRegister__kicker">Registration</div>
              <h2 className="preseasonRegister__title">Enter your details</h2>
              <p className="preseasonRegister__sub">Submit your PSN and up to 4 preferred teams for preseason placement.</p>
            </div>
            <div className="preseasonRegister__status">
              <span>Open</span>
            </div>
          </div>

          <form className="preseasonForm" onSubmit={onSubmit} noValidate>
            <div className="preseasonForm__grid preseasonForm__grid--two">
              <label className="preseasonField">
                <span>First name</span>
                <input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="First name" />
              </label>
              <label className="preseasonField">
                <span>Last name</span>
                <input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Last name" />
              </label>
            </div>

            <div className="preseasonForm__grid preseasonForm__grid--two">
              <label className="preseasonField">
                <span>Date of birth</span>
                <input type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} />
              </label>
              <label className="preseasonField">
                <span>PSN</span>
                <input value={form.psn} onChange={(e) => update('psn', e.target.value)} placeholder="PlayStation Network ID" autoCapitalize="none" />
              </label>
            </div>

            <div className="preseasonForm__prefsHead">Preferred Teams (1–4)</div>
            <div className="preseasonForm__grid preseasonForm__grid--two">
              {[1, 2, 3, 4].map((n) => {
                const key = `pref${n}`;
                const k = key as PrefKey;
                return (
                  <label className="preseasonField" key={k}>
                    <span>{`Preference ${n}`}{n === 1 ? ' *' : ''}</span>
                    <select value={form[k]} onChange={(e) => update(k, e.target.value)}>
                      <option value="">Select team</option>
                      {teams.map((t) => (
                        <option key={`${k}-${t.value}`} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>

            {submitMsg ? (
              <div className={`preseasonForm__message is-${submitState}`}>
                {submitState === 'success' ? <CheckCircle2 size={16} /> : null}
                <span>{submitMsg}</span>
              </div>
            ) : null}

            <div className="preseasonForm__actions">
              <button type="submit" className="preseasonBtn preseasonBtn--secondary" disabled={submitState === 'saving'}>
                {submitState === 'saving' ? 'Saving…' : 'Register Now'}
              </button>
            </div>
          </form>
        </section>

        <div className="preseasonBottom" />
      </div>
    </div>
  );
}
