import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import '../styles/best-team-page.css';

export default function BestTeamPage() {
  return (
    <div className="bt-page">
      <main className="bt-page__inner">
        <section className="bt-hero">
          <Link to="/" className="bt-backLink">
            <ArrowLeft size={16} />
            Back home
          </Link>
          <span className="bt-hero__eyebrow">AFL 26 honour side</span>
          <h1>Best 23 — Coming Soon</h1>
          <p>The Best 23 team selection is still being finalised. Check back soon!</p>
        </section>
      </main>
    </div>
  );
}
