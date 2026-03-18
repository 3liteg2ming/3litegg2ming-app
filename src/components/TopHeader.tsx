import { assetUrl } from '../lib/teamAssets';
import { HeaderAuthPill } from './HeaderAuthPill';

import '../styles/topHeader.css';

export default function TopHeader() {
  return (
    <header className="egTopHeader" role="banner">
      <div className="egTopHeader__backdrop" aria-hidden="true" />

      <div className="egTopHeader__inner">
        <div className="egTopHeader__logoWrapper" aria-hidden="true">
          <div className="egTopHeader__brand">
            <span className="egTopHeader__brandCrop">
              <img
                className="egTopHeader__brandLogo"
                src={assetUrl('elite-gaming-logo.png')}
                alt=""
                loading="eager"
              />
            </span>
          </div>
        </div>

        <div className="egTopHeader__authContainer">
          <HeaderAuthPill />
        </div>
      </div>
    </header>
  );
}
