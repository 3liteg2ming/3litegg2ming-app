import re, csv, time
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

AFL_TEAMS_URL = "https://www.afl.com.au/teams"
UA = {"User-Agent": "Mozilla/5.0", "Accept-Language": "en-AU,en;q=0.9"}
PLAYER_LINK_RE = re.compile(r"^/players/(\d+)/([a-z0-9-]+)$")

def get(url, timeout=20, retries=2):
    last = None
    for i in range(retries + 1):
        try:
            r = requests.get(url, headers=UA, timeout=timeout)
            r.raise_for_status()
            return r.text
        except Exception as e:
            last = e
            if i < retries:
                time.sleep(0.8 * (i + 1))
            else:
                raise last

def norm(s):
    return " ".join((s or "").split()).strip()

def parse_team_pages():
    soup = BeautifulSoup(get(AFL_TEAMS_URL, timeout=25), "lxml")  # faster than html.parser
    out, seen = [], set()
    for a in soup.select('a[href^="/teams/"]'):
        href = a.get("href","")
        name = norm(a.get_text(" ", strip=True))
        if not href.startswith("/teams/") or href.count("/") != 2:
            continue
        if not name:
            continue
        url = urljoin("https://www.afl.com.au", href)
        if url in seen:
            continue
        seen.add(url)
        out.append((name, url))
    return out

def parse_players(team_html):
    soup = BeautifulSoup(team_html, "lxml")  # faster + less likely to hang
    out, seen = [], set()
    for a in soup.select('a[href^="/players/"]'):
        href = a.get("href","")
        m = PLAYER_LINK_RE.match(href)
        if not m:
            continue
        pid = int(m.group(1))
        if pid in seen:
            continue
        seen.add(pid)

        raw = norm(a.get_text(" ", strip=True)).replace("Player Card","").strip()
        nums = re.findall(r"\b(\d{1,2})\b", raw)
        jumper = int(nums[0]) if nums else ""

        name = raw
        if nums:
            idx = raw.find(" " + nums[0] + " ")
            if idx > 0:
                name = raw[:idx].strip()

        position = ""
        if nums:
            after = raw.split(nums[0], 1)[-1].strip()
            position = after

        out.append((pid, name, jumper, position))
    return out

def main():
    teams = parse_team_pages()

    out_csv = "afl_squad_meta_2026.csv"
    written = 0

    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["afl_player_id","team_name","player_name","jumper","position"])
        w.writeheader()

        for team_name, team_url in tqdm(teams, desc="Teams"):
            try:
                html = get(team_url, timeout=25, retries=2)
                players = parse_players(html)
            except Exception as e:
                print("[WARN] team failed:", team_name, team_url, "=>", e)
                continue

            for pid, player_name, jumper, position in players:
                w.writerow({
                    "afl_player_id": pid,
                    "team_name": team_name,
                    "player_name": player_name,
                    "jumper": jumper,
                    "position": position
                })
                written += 1

            f.flush()
            time.sleep(0.15)

    print("Done → afl_squad_meta_2026.csv | rows:", written)

if __name__ == "__main__":
    main()