import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Competition = { id: string; name: string; season: string; active: boolean };
type Team = { id: string; competition_id: string; name: string; short_name: string; team_key: string };

type Status = "SCHEDULED" | "LIVE" | "FINAL";

export default function AdminCreateFixturePage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [competitionId, setCompetitionId] = useState<string>("");
  const [roundNum, setRoundNum] = useState<number>(1);
  const [homeKey, setHomeKey] = useState<string>("");
  const [awayKey, setAwayKey] = useState<string>("");
  const [venue, setVenue] = useState<string>("MCG, Melbourne");
  const [status, setStatus] = useState<Status>("SCHEDULED");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setMsg(null);

        const { data: comps, error: cErr } = await supabase
          .from("competitions")
          .select("id,name,season,active")
          .order("active", { ascending: false })
          .order("name", { ascending: true });

        if (cErr) throw cErr;

        if (!mounted) return;
        setCompetitions((comps || []) as Competition[]);

        const defaultComp = (comps || [])[0] as any;
        if (defaultComp?.id) setCompetitionId(defaultComp.id);
      } catch (e: any) {
        if (!mounted) return;
        setMsg(e?.message || "Failed to load competitions.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!competitionId) return;

    (async () => {
      try {
        setMsg(null);

        const { data, error } = await supabase
          .from("teams")
          .select("id,competition_id,name,short_name,team_key")
          .eq("competition_id", competitionId)
          .order("name", { ascending: true });

        if (error) throw error;

        if (!mounted) return;
        const list = (data || []) as Team[];
        setTeams(list);

        // set defaults if empty
        if (list.length) {
          if (!homeKey) setHomeKey(list[0].team_key);
          if (!awayKey && list.length > 1) setAwayKey(list[1].team_key);
        }
      } catch (e: any) {
        if (!mounted) return;
        setMsg(e?.message || "Failed to load teams.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [competitionId]);

  const teamOptions = useMemo(
    () =>
      teams.map((t) => ({
        key: t.team_key,
        label: `${t.name} (${t.team_key})`,
      })),
    [teams]
  );

  async function onCreate() {
    try {
      setMsg(null);

      if (!competitionId) throw new Error("Pick a competition.");
      if (!homeKey || !awayKey) throw new Error("Pick both home and away teams.");
      if (homeKey === awayKey) throw new Error("Home and away can’t be the same.");
      if (!venue.trim()) throw new Error("Enter a venue.");

      const { data, error } = await supabase.rpc("create_fixture", {
        competition_id: competitionId,
        round_num: roundNum,
        home_key: homeKey,
        away_key: awayKey,
        venue_text: venue,
        status_text: status,
      });

      if (error) throw error;

      setMsg(`✅ Fixture created! id: ${data}`);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Failed to create fixture."}`);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ margin: "6px 0 4px" }}>Admin • Create Fixture</h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Uses team_key (no UUIDs). Requires admin role in Supabase <code>users</code> table.
      </p>

      {loading ? <div>Loading…</div> : null}
      {msg ? (
        <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.06)", marginBottom: 12 }}>
          {msg}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          Competition
          <select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} style={{ width: "100%", height: 42 }}>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} • {c.season} {c.active ? "(active)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Round
          <input
            type="number"
            value={roundNum}
            onChange={(e) => setRoundNum(Number(e.target.value))}
            style={{ width: "100%", height: 42 }}
            min={1}
          />
        </label>

        <label>
          Home (team_key)
          <select value={homeKey} onChange={(e) => setHomeKey(e.target.value)} style={{ width: "100%", height: 42 }}>
            {teamOptions.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Away (team_key)
          <select value={awayKey} onChange={(e) => setAwayKey(e.target.value)} style={{ width: "100%", height: 42 }}>
            {teamOptions.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Venue
          <input value={venue} onChange={(e) => setVenue(e.target.value)} style={{ width: "100%", height: 42 }} />
        </label>

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} style={{ width: "100%", height: 42 }}>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="LIVE">LIVE</option>
            <option value="FINAL">FINAL</option>
          </select>
        </label>

        <button
          type="button"
          onClick={onCreate}
          style={{
            height: 46,
            borderRadius: 14,
            border: "none",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Create Fixture
        </button>
      </div>
    </div>
  );
}
