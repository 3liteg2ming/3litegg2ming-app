import { useNavigate } from 'react-router-dom';
import { assetUrl } from '../lib/teamAssets';
import { HeaderAuthPill } from './HeaderAuthPill';

import '../styles/topHeader.css';

export default function TopHeader() {
  const nav = useNavigate();

  return (
    <header className="egTopHeader" role="banner">
      <div className="egTopHeader__announce" role="status" aria-live="polite">
        <div className="egTopHeader__announceInner">Preseason registrations are now open.</div>
      </div>

      <div className="egTopHeader__inner">
        <div className="egTopHeader__left">
          <button
            type="button"
            className="egTopHeader__compPill"
            onClick={() => nav('/preseason-registration')}
            aria-label="Open AFL 26 preseason registration"
          >
            <span className="egTopHeader__compPillMark" aria-hidden="true">
              26
            </span>
          </button>
        </div>

        <div className="egTopHeader__center">
          <button
            type="button"
            className="egTopHeader__brand"
            onClick={() => nav('/preseason-registration')}
            aria-label="Go to preseason registration"
          >
            <span className="egTopHeader__brandCrop" aria-hidden="true">
              <img
                className="egTopHeader__brandLogo"
                src={assetUrl('elite-gaming-logo.png')}
                alt=""
                loading="eager"
              />
            </span>
          </button>
        </div>

        <div className="egTopHeader__right">
          <HeaderAuthPill />
        </div>
      </div>
    </header>
  );
}
