import React from 'react';
import { ChevronRight } from 'lucide-react';
import '../styles/season-card-pro-preview.css';

type Props = {
  backgroundUrl: string;
  logoUrl: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

export default function SeasonCardProPreview({
  backgroundUrl,
  logoUrl,
  onClick,
  className,
  style,
}: Props) {
  return (
    <button
      type="button"
      className={['eg-seasonProCard', className].filter(Boolean).join(' ')}
      style={style}
      onClick={onClick}
    >
      <div className="eg-seasonProCard__bg" style={{ backgroundImage: `url(${backgroundUrl})` }} />
      <div className="eg-seasonProCard__grain" />

      <div className="eg-seasonProCard__chips">
        <div className="eg-seasonProCard__chip eg-seasonProCard__chipLeft">
          <span className="eg-seasonProCard__dot" />
          <span>PRO TEAM</span>
        </div>

        <div className="eg-seasonProCard__chip eg-seasonProCard__chipRight">
          <span>COMING SOON</span>
        </div>
      </div>

      <div className="eg-seasonProCard__content">
        <div className="eg-seasonProCard__logoWrap">
          <img className="eg-seasonProCard__logo" src={logoUrl} alt="Elite Gaming Pro Team" />
        </div>

        <div className="eg-seasonProCard__title">AFL Pro Team</div>
        <div className="eg-seasonProCard__subtitle">Season One • Coming Soon</div>

        <div className="eg-seasonProCard__divider" />

        <div className="eg-seasonProCard__meta">Coming Soon • 16 Teams</div>

        <div className="eg-seasonProCard__cta">
          <span className="eg-seasonProCard__ctaText">Register Interest</span>
          <span className="eg-seasonProCard__ctaIcon">
            <ChevronRight size={22} />
          </span>
        </div>
      </div>
    </button>
  );
}
