#!/usr/bin/env python3
"""Validate the spawtz-sync parser logic against downloaded sample pages.

Mirrors the selectors/logic in supabase/functions/spawtz-sync/index.ts using
BeautifulSoup so we can prove the DOM scraping works before deploying.
"""
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

SAMPLES = Path(__file__).parent / "samples"


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def parse_fixture_tables(html: str):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for table in soup.select("table.FTable"):
        current_date = ""
        for tr in table.select("tr"):
            if "FHeader" in tr.get("class", []):
                current_date = norm(tr.get_text())
                continue
            time_td = tr.select_one("td.FDate")
            home_a = tr.select_one("td.FHomeTeam a")
            away_a = tr.select_one("td.FAwayTeam a")
            if not time_td or not home_a or not away_a or not current_date:
                continue
            venue = norm(tr.select_one("td.FPlayingArea").get_text()) if tr.select_one("td.FPlayingArea") else ""
            score_text = norm(tr.select_one("td.FScore").get_text()) if tr.select_one("td.FScore") else ""
            m = re.match(r"^(\d+)\s*-\s*(\d+)$", score_text)
            fx = tr.select_one("[data-fixture-id]")
            out.append({
                "external_id": int(fx["data-fixture-id"]) if fx and fx.get("data-fixture-id") else None,
                "date": current_date,
                "time": time_td.get_text().strip(),
                "venue": venue,
                "home": norm(home_a.get_text()),
                "away": norm(away_a.get_text()),
                "score": f"{m.group(1)}-{m.group(2)}" if m else None,
            })
    return out


def parse_pom_table(html: str):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for tr in soup.select("table.STPOMTable tr"):
        if "STHeaderRow" in tr.get("class", []):
            continue
        tds = tr.select("td")
        if len(tds) < 3:
            continue
        try:
            awards = int(tds[2].get_text().strip())
        except ValueError:
            continue
        out.append((norm(tds[0].get_text()), norm(tds[1].get_text()), awards))
    return out


def main():
    fixtures_html = (SAMPLES / "fixtures_8811.html").read_text(encoding="utf-8", errors="replace")
    standings_html = (SAMPLES / "standings_8811.html").read_text(encoding="utf-8", errors="replace")
    stats_html = (SAMPLES / "stats_8811.html").read_text(encoding="utf-8", errors="replace")

    upcoming = parse_fixture_tables(fixtures_html)
    results = parse_fixture_tables(standings_html)
    pom = parse_pom_table(stats_html)

    # Dedupe like the edge function
    seen = {}
    for f in upcoming + results:
        key = f"id:{f['external_id']}" if f["external_id"] else f"{f['date']}|{f['time']}|{f['home']}|{f['away']}"
        seen[key] = f

    failures = []

    # Fixtures page: 3 scheduled playoff matches
    if len(upcoming) != 3:
        failures.append(f"fixtures page: expected 3 scheduled, got {len(upcoming)}")
    if not all(f["score"] is None for f in upcoming):
        failures.append("fixtures page: playoff matches should have no score")

    # Standings page: all finished division-8811 results (incl. cross-division)
    if len(results) < 20:
        failures.append(f"standings results: expected >=20 finished, got {len(results)}")
    if not all(f["score"] for f in results):
        failures.append("standings results: every row should have a score")

    # POTM table: 21 rows for division 8811, Ethan Duddridge top with 3
    if len(pom) != 21:
        failures.append(f"pom rows: expected 21, got {len(pom)}")
    if not pom or pom[0] != ("Ethan Duddridge", "Mull of Kintag", 3):
        failures.append(f"pom top row wrong: {pom[0] if pom else None}")

    print(f"upcoming fixtures : {len(upcoming)}")
    for f in upcoming:
        print(f"  {f['date']} {f['time']} {f['venue']:8s} {f['home']} vs {f['away']} (id={f['external_id']})")
    print(f"finished results  : {len(results)}")
    print(f"deduped total     : {len(seen)}")
    print(f"pom rows          : {len(pom)}")
    print("  top 5:", ", ".join(f"{p} ({t}, {a})" for p, t, a in pom[:5]))

    if failures:
        print("\nFAILURES:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("\nAll parser checks passed.")


if __name__ == "__main__":
    main()
