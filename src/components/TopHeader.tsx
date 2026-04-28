import { useNavigate } from 'react-router-dom';
import { assetUrl } from '../lib/teamAssets';
import { HeaderAuthPill } from './HeaderAuthPill';

import '../styles/topHeader.css';

export default function TopHeader() {
  const nav = useNavigate();

  return (
    <header className="egTopHeader" role="banner">
      <div className="egTopHeader__inner egTopHeader__inner--brandOnly">
        <button
          type="button"
          className="egTopHeader__brand"
          onClick={() => nav('/')}
          aria-label="Go to home"
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

        <div className="egTopHeader__auth">
          <HeaderAuthPill />
        </div>
      </div>
    </header>
  );
}
