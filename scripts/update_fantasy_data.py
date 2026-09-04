import json, re, time, unicodedata
from pathlib import Path
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "live-data.js"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FantasyDraftCommandCenter/1.0; +https://github.com/judeweidner/fantasy-draft)"
}
ESPN_URL = "https://www.espn.com/fantasy/football/story/_/id/47513496/2026-fantasy-football-rankings-ppr-mike-clay"
FP_URL = "https://www.fantasypros.com/nfl/rankings/andrew-erickson.php?scoring=PPR&signedout="
SLEEPER_URL = "https://api.sleeper.app/v1/players/nfl"
FP_NEWS = "https://www.fantasypros.com/nfl/player-news.php?page={}"

TEAM_NAMES = {
    "ARI":"Arizona Cardinals","ATL":"Atlanta Falcons","BAL":"Baltimore Ravens","BUF":"Buffalo Bills",
    "CAR":"Carolina Panthers","CHI":"Chicago Bears","CIN":"Cincinnati Bengals","CLE":"Cleveland Browns",
    "DAL":"Dallas Cowboys","DEN":"Denver Broncos","DET":"Detroit Lions","GB":"Green Bay Packers",
    "HOU":"Houston Texans","IND":"Indianapolis Colts","JAC":"Jacksonville Jaguars","KC":"Kansas City Chiefs",
    "LV":"Las Vegas Raiders","LAC":"Los Angeles Chargers","LAR":"Los Angeles Rams","MIA":"Miami Dolphins",
    "MIN":"Minnesota Vikings","NE":"New England Patriots","NO":"New Orleans Saints","NYG":"New York Giants",
    "NYJ":"New York Jets","PHI":"Philadelphia Eagles","PIT":"Pittsburgh Steelers","SF":"San Francisco 49ers",
    "SEA":"Seattle Seahawks","TB":"Tampa Bay Buccaneers","TEN":"Tennessee Titans","WAS":"Washington Commanders"
}

CURATED = {
    "Josh Jacobs": {"tag":"MAJOR RISK","note":"On the NFL Commissioner's Exempt List and currently cannot practice or play; return timetable remains unclear.","delta":28},
    "MarShawn Lloyd": {"tag":"ROLE UP","note":"Expected to lead Green Bay's backfield while Josh Jacobs is unavailable.","delta":-12},
    "Ashton Jeanty": {"tag":"INJURY","note":"Recovering from an ankle injury; Raiders have expressed optimism that his return could come sooner than expected.","delta":8},
    "Mike Washington Jr.": {"tag":"ROLE UP","note":"Could handle a larger early-season workload if Ashton Jeanty is limited or unavailable.","delta":-8},
    "Ja'Marr Chase": {"tag":"MONITOR","note":"Managing a knee issue and has been limited, though Cincinnati has expressed optimism about his Week 1 outlook.","delta":4},
    "Khalil Shakir": {"tag":"MONITOR","note":"Buffalo has expressed optimism for Week 1 after an undisclosed issue kept him out of practice.","delta":4},
    "Rome Odunze": {"tag":"MONITOR","note":"Left practice early after coming up hobbled; status should be monitored into Week 1.","delta":5},
    "D'Andre Swift": {"tag":"MINOR","note":"Left practice with a cramp; current reporting suggests he should be fine for the opener.","delta":1},
    "Alec Pierce": {"tag":"POSITIVE","note":"Returned to full practice after an extended ankle recovery.","delta":-4},
    "George Kittle": {"tag":"MONITOR","note":"Availability for Week 1 remains uncertain while he works back from injury.","delta":5},
    "Jonathon Brooks": {"tag":"INJURY","note":"Still working back from injury; Carolina has remained optimistic but his availability is not fully settled.","delta":7},
    "Jordyn Tyson": {"tag":"INJURY","note":"Hamstring issue is expected to sideline him for an extended period.","delta":18},
    "Alvin Kamara": {"tag":"INJURY","note":"Knee issue adds early-season availability risk.","delta":7},
    "Travis Hunter": {"tag":"ROLE DOWN","note":"Jacksonville has emphasized a defense-first workload, reducing expected offensive snaps.","delta":16},
}


def get(url, timeout=30):
    r = requests.get(url, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def num(s):
    m = re.search(r"\d+(?:\.\d+)?", str(s or ""))
    return float(m.group()) if m else None


def parse_espn():
    soup = BeautifulSoup(get(ESPN_URL).text, "html.parser")
    text = soup.get_text(" ", strip=True)
    if "PPR Top 300" not in text:
        raise RuntimeError("Could not find ESPN PPR Top 300 section")
    text = text.split("PPR Top 300", 1)[1]
    pat = re.compile(r"(?<!\d)(\d{1,3})\.\s+(.+?)\s*,\s*([A-Z]{2,3})\s*--\s*(QB|RB|WR|TE|K|DST)\d+\s*\(Bye:")
    rows = []
    seen = set()
    for m in pat.finditer(text):
        rank = int(m.group(1))
        if not 1 <= rank <= 300 or rank in seen:
            continue
        name, team, pos = m.group(2).strip(), m.group(3), m.group(4)
        if pos == "DST":
            name = TEAM_NAMES.get(team, name.replace(" D/ST", ""))
        rows.append({"rank":rank,"name":name,"team":team,"pos":pos})
        seen.add(rank)
    rows.sort(key=lambda x:x["rank"])
    if len(rows) < 275:
        raise RuntimeError(f"ESPN parser found only {len(rows)} rows")
    return rows


def parse_fantasypros():
    soup = BeautifulSoup(get(FP_URL).text, "html.parser")
    out = {}
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th","td"])]
        if len(cells) < 8 or not cells[0].isdigit():
            continue
        rank = int(cells[0])
        name = cells[1].strip()
        pos = re.sub(r"\d+$", "", cells[2].strip())
        team = cells[3].strip() or "FA"
        ecr = num(cells[5])
        adp = num(cells[7])
        out[norm(name)] = {"rank":rank,"name":name,"team":team,"pos":pos,"ecr":ecr,"adp":adp}
    if len(out) < 250:
        raise RuntimeError(f"FantasyPros parser found only {len(out)} rows")
    return out


def sleeper_statuses():
    data = get(SLEEPER_URL, 45).json()
    out = {}
    for p in data.values():
        name = p.get("full_name") or " ".join(x for x in [p.get("first_name"),p.get("last_name")] if x)
        if not name:
            continue
        out[norm(name)] = {
            "team": p.get("team") or "FA",
            "pos": p.get("position"),
            "injury_status": p.get("injury_status"),
            "injury_body_part": p.get("injury_body_part"),
            "injury_notes": p.get("injury_notes"),
            "depth_chart_order": p.get("depth_chart_order"),
            "active": p.get("active", True),
        }
    return out


def latest_news(player_names):
    # Public FantasyPros news listing. We only retain one headline per ranked player.
    keys = sorted(((norm(n), n) for n in player_names), key=lambda x: len(x[0]), reverse=True)
    found = {}
    for page in range(1, 5):
        try:
            soup = BeautifulSoup(get(FP_NEWS.format(page)).text, "html.parser")
        except Exception as e:
            print("news page failed", page, e)
            continue
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if "/nfl/news/" not in href:
                continue
            title = a.get_text(" ", strip=True)
            if len(title) < 8:
                continue
            nt = norm(title)
            for k, original in keys:
                if original in found:
                    continue
                if k and k in nt:
                    found[original] = title
                    break
        time.sleep(0.4)
    return found


def injury_to_news(st):
    status = str(st.get("injury_status") or "").upper()
    part = st.get("injury_body_part") or ""
    notes = st.get("injury_notes") or ""
    if not status:
        return None
    major = status in {"IR","PUP","NFI","SUSPENDED","SUS","OUT"}
    tag = "MAJOR RISK" if status in {"SUSPENDED","SUS"} else ("INJURY" if major else "MONITOR")
    delta = 18 if major else 6
    detail = " • ".join(x for x in [status, part, notes] if x)
    return {"tag":tag,"note":detail,"delta":delta}


def main():
    espn = parse_espn()
    fp = parse_fantasypros()
    sleeper = sleeper_statuses()
    news = latest_news([x["name"] for x in espn])

    rows = []
    for e in espn:
        k = norm(e["name"])
        f = fp.get(k, {})
        s = sleeper.get(k, {})
        n = dict(CURATED.get(e["name"], {}))
        if not n:
            live_injury = injury_to_news(s)
            if live_injury:
                n.update(live_injury)
        if e["name"] in news:
            headline = news[e["name"]]
            if n.get("note"):
                n["headline"] = headline
            else:
                n = {"tag":"NEWS","note":headline,"headline":headline,"delta":0}
        ecr = f.get("ecr")
        adp = f.get("adp")
        rows.append({
            "name": e["name"],
            "team": s.get("team") if s.get("team") not in (None,"FA") else (f.get("team") or e["team"]),
            "pos": e["pos"],
            "espn": e["rank"],
            "fp": int(ecr) if ecr is not None else None,
            "fpExpert": f.get("rank"),
            "adp": adp,
            "injuryStatus": s.get("injury_status"),
            "injuryBodyPart": s.get("injury_body_part"),
            "depthChartOrder": s.get("depth_chart_order"),
            "newsTag": n.get("tag", ""),
            "newsDelta": n.get("delta", 0),
            "newsNote": n.get("note", ""),
            "newsHeadline": n.get("headline", ""),
        })

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "espn": ESPN_URL,
            "fantasypros": FP_URL,
            "sleeper": SLEEPER_URL,
            "news": "FantasyPros public player-news pages + Sleeper status fields"
        },
        "rankedCount": len(rows),
        "players": rows,
    }
    OUT.write_text("window.LIVE_FANTASY_DATA=" + json.dumps(payload, separators=(",",":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"wrote {len(rows)} ranked players to {OUT}")


if __name__ == "__main__":
    main()
