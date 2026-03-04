import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import '../styles/registration-hero.css';

type Props = {
  title: string;
  subtitle: string;
  seedNote?: string;
  kicker?: string;
  leftLogoUrl?: string | null;
  rightLogoUrl?: string | null;
  rightContent?: ReactNode;
  cta?: ReactNode;
  helper?: ReactNode;
  countChip?: ReactNode;
  className?: string;
  fallbackMark?: string;
};

export default function RegistrationHeroCard({
  title,
  subtitle,
  seedNote,
  kicker = 'KNOCKOUT PRESEASON',
  leftLogoUrl,
  rightLogoUrl,
  rightContent,
  cta,
  helper,
  countChip,
  className,
  fallbackMark = 'EG',
}: Props) {
  const mark = String(fallbackMark || 'EG').slice(0, 2).toUpperCase();

  return (
    <section className={`regHeroCard ${className || ''}`}>
      <div className="regHeroCard__watermark regHeroCard__watermark--left" aria-hidden="true">
        {leftLogoUrl ? <img src={leftLogoUrl} alt="" loading="lazy" /> : <span>{mark}</span>}
      </div>
      <div className="regHeroCard__watermark regHeroCard__watermark--right" aria-hidden="true">
        {rightLogoUrl ? <img src={rightLogoUrl} alt="" loading="lazy" /> : <span>{mark}</span>}
      </div>

      <div className="regHeroCard__content">
        <div className="regHeroCard__top">
          <div>
            <div className="regHeroCard__kicker">
              <ShieldCheck size={14} /> {kicker}
            </div>
            <h1 className="regHeroCard__title">{title}</h1>
            <p className="regHeroCard__subtitle">{subtitle}</p>
            {seedNote ? <p className="regHeroCard__seed">{seedNote}</p> : null}
          </div>

          {rightContent ? <div className="regHeroCard__side">{rightContent}</div> : null}
        </div>

        {countChip ? <div className="regHeroCard__countRow">{countChip}</div> : null}

        {cta || helper ? (
          <div className="regHeroCard__ctaArea">
            {cta ? <div className="regHeroCard__cta">{cta}</div> : null}
            {helper ? <div className="regHeroCard__helper">{helper}</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
