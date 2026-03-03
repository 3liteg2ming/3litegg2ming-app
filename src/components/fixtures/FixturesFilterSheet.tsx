type TeamOption = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  teamOptions: TeamOption[];
  venueOptions: string[];
  selectedTeamId: string;
  selectedVenue: string;
  onClose: () => void;
  onTeamChange: (teamId: string) => void;
  onVenueChange: (venue: string) => void;
  onReset: () => void;
};

export default function FixturesFilterSheet({
  open,
  teamOptions,
  venueOptions,
  selectedTeamId,
  selectedVenue,
  onClose,
  onTeamChange,
  onVenueChange,
  onReset,
}: Props) {
  if (!open) return null;

  return (
    <div className="fxSheet" role="dialog" aria-modal="true" aria-label="Filter Fixtures">
      <button className="fxSheet__backdrop" type="button" onClick={onClose} />
      <div className="fxSheet__panel">
        <div className="fxSheet__handle" />
        <h3 className="fxSheet__title">Filter Fixtures</h3>

        <div className="fxSheet__section">
          <div className="fxSheet__sectionTitle">Team</div>
          <div className="fxSheet__list">
            <button
              type="button"
              className={`fxSheet__item ${selectedTeamId === 'ALL' ? 'is-active' : ''}`}
              onClick={() => onTeamChange('ALL')}
            >
              <span>All Teams</span>
            </button>
            {teamOptions.map((team) => (
              <button
                key={team.id}
                type="button"
                className={`fxSheet__item ${selectedTeamId === team.id ? 'is-active' : ''}`}
                onClick={() => onTeamChange(team.id)}
              >
                <span>{team.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="fxSheet__section">
          <div className="fxSheet__sectionTitle">Venue</div>
          <div className="fxSheet__list">
            <button
              type="button"
              className={`fxSheet__item ${selectedVenue === 'ALL' ? 'is-active' : ''}`}
              onClick={() => onVenueChange('ALL')}
            >
              <span>All Venues</span>
            </button>
            {venueOptions.map((venue) => (
              <button
                key={venue}
                type="button"
                className={`fxSheet__item ${selectedVenue === venue ? 'is-active' : ''}`}
                onClick={() => onVenueChange(venue)}
              >
                <span>{venue}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="fxSheet__actions">
          <button type="button" className="fxSheet__reset" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="fxSheet__done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
