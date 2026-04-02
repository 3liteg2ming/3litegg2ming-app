/**
 * FormGuideStrip — displays coach's last 5 match results as colored pills
 * W = green, L = red, D = amber, empty = grey
 */
export default function FormGuideStrip({ results = [], maxGames = 5 }: { results?: string[]; maxGames?: number }) {
  // Pad results to maxGames with undefined (empty slots)
  const padded: (string | undefined)[] = [...results].slice(-maxGames);
  while (padded.length < maxGames) {
    padded.unshift(undefined);
  }

  return (
    <div className="formGuide">
      <div className="formGuide__label">Form</div>
      <div className="formGuide__chips">
        {padded.map((result, idx) => {
          const resultType = result === 'W' ? 'W' : result === 'L' ? 'L' : result === 'D' ? 'D' : 'empty';
          return (
            <div key={idx} className={`formGuide__chip formGuide__chip--${resultType}`} title={result ? `Match result: ${result}` : 'Match not yet played'}>
              {result || '—'}
            </div>
          );
        })}
      </div>
    </div>
  );
}
