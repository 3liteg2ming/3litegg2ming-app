import { useState } from 'react';
import { Heart } from 'lucide-react';
import { MOTIVATION_CONTENT } from '../../lib/playerModeStore';
import type { TransformationProfile } from '../../lib/playerModeStore';
import { getDayAndWeek } from '../../lib/playerModeStore';

interface Props {
  profile: TransformationProfile;
}

const TABS = [
  { key: 'why', label: 'Why I Started' },
  { key: 'mission', label: 'Mission' },
  { key: 'morning', label: 'Morning' },
  { key: 'night', label: 'Night' },
  { key: 'craving', label: 'Cravings' },
  { key: 'badday', label: 'Bad Day' },
  { key: 'reset', label: 'Weekly Reset' },
] as const;

type TabKey = typeof TABS[number]['key'];

const CONTENT_MAP: Record<TabKey, { title: string; body: string }> = {
  why: {
    title: 'Why I Started',
    body: MOTIVATION_CONTENT.why,
  },
  mission: {
    title: 'Project Strong Dad',
    body: MOTIVATION_CONTENT.mission,
  },
  morning: {
    title: 'Morning Activation Script',
    body: MOTIVATION_CONTENT.morningScript,
  },
  night: {
    title: 'Night Discipline Script',
    body: MOTIVATION_CONTENT.nightScript,
  },
  craving: {
    title: 'Craving Control Script',
    body: MOTIVATION_CONTENT.cravingScript,
  },
  badday: {
    title: 'Bad Day Emergency Plan',
    body: MOTIVATION_CONTENT.badDayPlan,
  },
  reset: {
    title: 'Sunday Weekly Reset',
    body: MOTIVATION_CONTENT.weeklyReset,
  },
};

export default function MotivationVault({ profile }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('why');
  const { week, day } = getDayAndWeek(profile.startDate);
  const content = CONTENT_MAP[activeTab];

  const milestoneWeeks = [2, 4, 8, 12];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 12-week progress map */}
      <div className="pm-card pm-fade-up">
        <div className="pm-card__label"><Heart size={12} /> 12-Week Challenge</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-2px', color: 'var(--pm-blue)', lineHeight: 1 }}>{day}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pm-muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>days in</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pm-muted)' }}>Week {week} of 12</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--pm-gold)' }}>{Math.round((day / 84) * 100)}%</span>
            </div>
            <div className="pm-bar">
              <div
                className="pm-bar__fill pm-bar__fill--gold"
                style={{ width: `${Math.min(100, Math.round((day / 84) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Week grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(w => (
            <div
              key={w}
              style={{
                height: 36,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 800,
                background: w < week ? 'var(--pm-gold-dim)' : w === week ? 'var(--pm-blue-dim)' : 'var(--pm-card)',
                border: `1px solid ${w < week ? 'rgba(245,196,0,0.25)' : w === week ? 'rgba(14,165,233,0.3)' : 'var(--pm-border)'}`,
                color: w < week ? 'var(--pm-gold)' : w === week ? 'var(--pm-blue)' : 'var(--pm-faint)',
              }}
            >
              {w < week ? '✓' : w === week ? `W${w}` : `W${w}`}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {milestoneWeeks.map(mw => (
            <div key={mw} style={{
              padding: '5px 10px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 700,
              background: week > mw ? 'var(--pm-gold-dim)' : week === mw ? 'var(--pm-blue-dim)' : 'var(--pm-card)',
              border: `1px solid ${week > mw ? 'rgba(245,196,0,0.25)' : week === mw ? 'rgba(14,165,233,0.3)' : 'var(--pm-border)'}`,
              color: week > mw ? 'var(--pm-gold)' : week === mw ? 'var(--pm-blue)' : 'var(--pm-faint)',
            }}>
              {week > mw ? '✓' : ''} Week {mw} checkpoint
            </div>
          ))}
        </div>
      </div>

      {/* Motivation scripts */}
      <div className="pm-card pm-fade-up">
        <div className="pm-card__label">Motivation Vault</div>
        <div className="pm-motive-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`pm-motive-tab${activeTab === tab.key ? ' pm-motive-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="pm-motive-content">
          <div className="pm-motive-content__title">{content.title}</div>
          <div className="pm-motive-content__body">{content.body}</div>
        </div>
      </div>
    </div>
  );
}
