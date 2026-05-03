import { useState } from 'react';
import { ChevronDown, ChevronUp, ShoppingCart, UtensilsCrossed, Zap } from 'lucide-react';
import type { TransformationProfile } from '../../lib/playerModeStore';
import { MEAL_PLAN, GROCERY_LIST, EMERGENCY_MEALS } from '../../lib/playerModeStore';

interface Props {
  profile: TransformationProfile;
}

export default function NutritionHub({ profile }: Props) {
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const [checkedGrocery, setCheckedGrocery] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'meals' | 'grocery' | 'emergency'>('meals');

  const macros = [
    { name: 'Calories', val: profile.dailyCalories, unit: 'kcal', pct: null, color: 'blue' },
    { name: 'Protein', val: profile.dailyProtein, unit: 'g', pct: Math.round((profile.dailyProtein * 4 / profile.dailyCalories) * 100), color: 'green' },
    { name: 'Carbs', val: Math.round((profile.dailyCalories * 0.38) / 4), unit: 'g', pct: 38, color: 'gold' },
    { name: 'Fat', val: Math.round((profile.dailyCalories * 0.27) / 9), unit: 'g', pct: 27, color: null },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Daily targets */}
      <div className="pm-card pm-fade-up">
        <div className="pm-card__label"><UtensilsCrossed size={12} /> Daily Targets</div>
        <div className="pm-macro-bar-row">
          {macros.map(m => (
            <div key={m.name} className="pm-macro-bar">
              <div className="pm-macro-bar__header">
                <span className="pm-macro-bar__name">{m.name}</span>
                <span className="pm-macro-bar__val">{m.val}{m.unit}{m.pct ? ` · ${m.pct}%` : ''}</span>
              </div>
              {m.pct && (
                <div className="pm-bar">
                  <div
                    className={`pm-bar__fill pm-bar__fill--${m.color ?? 'blue'}`}
                    style={{ width: `${m.pct}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['meals', 'grocery', 'emergency'] as const).map(tab => (
          <button
            key={tab}
            className={`pm-workout-tab${activeTab === tab ? ' pm-workout-tab--active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'meals' ? 'Meal Plan' : tab === 'grocery' ? 'Grocery' : 'Emergency'}
          </button>
        ))}
      </div>

      {/* Meal plan */}
      {activeTab === 'meals' && (
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label">Meal Plan</div>
          <div className="pm-meal-accordion">
            {MEAL_PLAN.map(meal => (
              <div key={meal.label} className="pm-meal-row">
                <div
                  className="pm-meal-row__header"
                  onClick={() => setOpenMeal(o => o === meal.label ? null : meal.label)}
                >
                  <div className="pm-meal-row__title">{meal.label}</div>
                  {openMeal === meal.label ? <ChevronUp size={15} color="var(--pm-faint)" /> : <ChevronDown size={15} color="var(--pm-faint)" />}
                </div>
                {openMeal === meal.label && (
                  <div className="pm-meal-row__body">
                    {meal.options.map((opt, i) => (
                      <div key={i} className="pm-meal-option">{opt}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grocery list */}
      {activeTab === 'grocery' && (
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label">
            <ShoppingCart size={12} /> Weekly Grocery List
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--pm-muted)' }}>
              {checkedGrocery.size}/{GROCERY_LIST.length}
            </span>
          </div>
          {GROCERY_LIST.map(item => (
            <div
              key={item}
              className={`pm-grocery-item${checkedGrocery.has(item) ? ' pm-grocery-item--checked' : ''}`}
              onClick={() => setCheckedGrocery(prev => {
                const next = new Set(prev);
                next.has(item) ? next.delete(item) : next.add(item);
                return next;
              })}
            >
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${checkedGrocery.has(item) ? 'var(--pm-green)' : 'var(--pm-border-strong)'}`, background: checkedGrocery.has(item) ? 'var(--pm-green)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {checkedGrocery.has(item) && <span style={{ fontSize: 10, color: '#fff', fontWeight: 800 }}>✓</span>}
              </div>
              <span className="pm-grocery-item__label">{item}</span>
            </div>
          ))}
          {checkedGrocery.size > 0 && (
            <button className="pm-add-btn" style={{ marginTop: 8 }} onClick={() => setCheckedGrocery(new Set())}>
              Reset list
            </button>
          )}
        </div>
      )}

      {/* Emergency meals */}
      {activeTab === 'emergency' && (
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label"><Zap size={12} /> Emergency Meals</div>
          <div style={{ fontSize: 12, color: 'var(--pm-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            No time to meal prep? No excuse. These options keep you on track anywhere.
          </div>
          {EMERGENCY_MEALS.map(meal => (
            <div key={meal.name} style={{ padding: '12px 0', borderBottom: '1px solid var(--pm-border)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--pm-text)', marginBottom: 3 }}>{meal.name}</div>
              <div style={{ fontSize: 12, color: 'var(--pm-muted)' }}>{meal.macros}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
