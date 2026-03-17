import csv
import json
import re
from pathlib import Path

import requests

INPUT_CSV = Path("eg_players_rows (3).csv")
OUTPUT_CSV = Path("eg_players_rows_photos_only_refreshed.csv")
PLAYERS_JSON_URL = "https://fantasy.afl.com.au/data/afl/players.json"

def norm(text: str) -> str:
    text = (text or "").strip().lower()
    text = text.replace("’", "").replace("'", "").replace("`", "")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def name_key(text: str) -> str:
    return norm(text).replace(" ", "")

def build_headshot_url(player_id: str) -> str:
    pid = str(player_id).strip()
    if not pid:
        return ""
    return f"https://fantasy.afl.com.au/assets/media/players/afl/{pid}_450.png"

def get_first(d, *keys):
    for key in keys:
        value = d.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""

def fetch_players():
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json,text/plain,*/*",
    }

    resp = requests.get(PLAYERS_JSON_URL, headers=headers, timeout=30)
    resp.raise_for_status()

    data = resp.json()

    if isinstance(data, dict):
        if "players" in data and isinstance(data["players"], list):
            return data["players"]
        if "data" in data and isinstance(data["data"], list):
            return data["data"]

    if isinstance(data, list):
        return data

    raise RuntimeError("Unexpected JSON shape from AFL Fantasy")

def build_indexes(players):
    by_id = {}
    by_name = {}

    for p in players:
        pid = get_first(p, "id", "player_id", "playerId")
        full_name = get_first(p, "full_name", "fullName", "name", "player_name", "playerName")

        if not full_name:
            first = get_first(p, "first_name", "firstName")
            last = get_first(p, "last_name", "lastName")
            full_name = f"{first} {last}".strip()

        row = {
            "afl_player_id": pid,
            "name": full_name,
            "headshot_url": build_headshot_url(pid),
            "photo_url": build_headshot_url(pid),
        }

        if pid:
            by_id[pid] = row
        if full_name:
            by_name[name_key(full_name)] = row

    return by_id, by_name

def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def write_csv(path, rows, fieldnames):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

def main():
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Could not find {INPUT_CSV}")

    rows = read_csv(INPUT_CSV)
    players = fetch_players()
    by_id, by_name = build_indexes(players)

    changed = 0

    for row in rows:
        existing_id = str(row.get("afl_player_id", "")).strip()
        existing_name = str(row.get("name", "")).strip()

        match = None
        if existing_id and existing_id in by_id:
            match = by_id[existing_id]
        elif existing_name:
            match = by_name.get(name_key(existing_name))

        if not match:
            continue

        new_headshot = match["headshot_url"]
        new_photo = match["photo_url"]

        old_headshot = str(row.get("headshot_url", "")).strip()
        old_photo = str(row.get("photo_url", "")).strip()

        if new_headshot and old_headshot != new_headshot:
            row["headshot_url"] = new_headshot
            changed += 1

        if new_photo and old_photo != new_photo:
            row["photo_url"] = new_photo

    fieldnames = list(rows[0].keys()) if rows else []
    write_csv(OUTPUT_CSV, rows, fieldnames)

    print("Done.")
    print(f"Fantasy players loaded: {len(players)}")
    print(f"Rows updated: {changed}")
    print(f"Output file: {OUTPUT_CSV}")

if __name__ == "__main__":
    main()