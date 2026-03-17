import csv
from pathlib import Path

INPUT_CSV = Path("afl_players_2026_master.csv")
OUTPUT_CSV = Path("afl_players_2026_ready_for_supabase.csv")

def clean(value):
    return str(value or "").strip()

def main():
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Cannot find {INPUT_CSV}")

    with INPUT_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    output_rows = []

    for row in rows:
        player_id = clean(row.get("afl_player_id") or row.get("id"))
        name = clean(row.get("name") or row.get("full_name") or row.get("Player Name"))
        team_name = clean(row.get("team_name") or row.get("team") or row.get("Team"))
        team_key = clean(row.get("team_key"))
        position = clean(row.get("position") or row.get("Position"))
        number = clean(row.get("number") or row.get("jumper") or row.get("Jumper Number"))
        headshot_url = clean(row.get("headshot_url") or row.get("Headshot URL"))
        photo_url = clean(row.get("photo_url") or row.get("Photo URL") or headshot_url)

        output_rows.append({
            "afl_player_id": player_id,
            "name": name,
            "full_name": name,
            "display_name": name,
            "team_name": team_name,
            "team_key": team_key,
            "position": position,
            "number": number,
            "headshot_url": headshot_url,
            "photo_url": photo_url,
        })

    fieldnames = [
        "afl_player_id",
        "name",
        "full_name",
        "display_name",
        "team_name",
        "team_key",
        "position",
        "number",
        "headshot_url",
        "photo_url",
    ]

    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"Done. Wrote {OUTPUT_CSV}")

if __name__ == "__main__":
    main()