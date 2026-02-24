import type { MatchCentreModel } from '@/lib/matchCentreRepo';

export default function MatchTimeline({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  return (
    <section className="w-full max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">Match Timeline</h2>
        <p className="text-muted-foreground text-sm mt-1">Hover timeline to view key events</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-border/50 p-6 relative">
        {loading && !model ? (
          <div className="text-center py-10">
            <div className="text-xl font-black text-foreground">Loading timeline…</div>
            <div className="mt-2 text-sm text-muted-foreground">Preparing match centre.</div>
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="text-xl font-black text-foreground">Timeline coming soon</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Once we store quarter-by-quarter scores (or event feed), this will become the full AFL-style worm.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}