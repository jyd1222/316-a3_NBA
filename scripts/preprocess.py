#!/usr/bin/env python3
"""Build lightweight season summaries for the D3 frontend.

The Kaggle NBA Database exposes game-level box scores in a single table with
home and away team stats on each row. For this project we reshape each game
into two team-game rows, then aggregate to:

1. League season summaries
2. Team season summaries
3. A small annotations file for storytelling cues

The website only loads these derived files, keeping the static frontend fast.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Iterable

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data"

GAME_COLUMNS = [
    "season_id",
    "game_id",
    "game_date",
    "season_type",
    "team_id_home",
    "team_abbreviation_home",
    "team_name_home",
    "wl_home",
    "fga_home",
    "fg3m_home",
    "fg3a_home",
    "reb_home",
    "ast_home",
    "pts_home",
    "team_id_away",
    "team_abbreviation_away",
    "team_name_away",
    "wl_away",
    "fga_away",
    "fg3m_away",
    "fg3a_away",
    "reb_away",
    "ast_away",
    "pts_away",
]


CURRENT_CONFERENCES = {
    1610612737: "East",  # ATL
    1610612738: "East",  # BOS
    1610612739: "East",  # CLE
    1610612740: "West",  # NOP / NOH
    1610612741: "East",  # CHI
    1610612742: "West",  # DAL
    1610612743: "West",  # DEN
    1610612744: "West",  # GSW
    1610612745: "West",  # HOU
    1610612746: "West",  # LAC
    1610612747: "West",  # LAL
    1610612748: "East",  # MIA
    1610612749: "East",  # MIL
    1610612750: "West",  # MIN
    1610612751: "East",  # BKN / NJN
    1610612752: "East",  # NYK
    1610612753: "East",  # ORL
    1610612754: "East",  # IND
    1610612755: "East",  # PHI
    1610612756: "West",  # PHX
    1610612757: "West",  # POR
    1610612758: "West",  # SAC / KCK
    1610612759: "West",  # SAS
    1610612760: "West",  # OKC / SEA
    1610612761: "East",  # TOR
    1610612762: "West",  # UTA
    1610612763: "West",  # MEM / VAN
    1610612764: "East",  # WAS
    1610612765: "East",  # DET
    1610612766: "East",  # CHA / CHH
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create frontend-ready NBA season summary files."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help=(
            "Optional path to nba.sqlite, the Kaggle dataset root, the csv folder, "
            "or game.csv. If omitted, the script attempts a KaggleHub download."
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory where derived files will be written. Default: {DEFAULT_OUTPUT_DIR}",
    )
    parser.add_argument(
        "--season-start",
        type=int,
        default=1985,
        help=(
            "First season start year to keep. Default 1985 because 1985-86 is the "
            "first season with complete FGA and 3PA coverage in this dataset."
        ),
    )
    parser.add_argument(
        "--season-end",
        type=int,
        default=None,
        help="Optional last season start year to keep.",
    )
    return parser.parse_args()


def season_label(season_start: int) -> str:
    return f"{season_start}-{(season_start + 1) % 100:02d}"


def dominant_value(values: pd.Series) -> str | int | None:
    clean = values.dropna()
    if clean.empty:
        return None
    counts = clean.value_counts()
    return counts.index[0]


def infer_conference(team_id: int, season_start: int) -> str:
    # New Orleans joined the East for two seasons before moving West.
    if team_id == 1610612740 and season_start in {2002, 2003}:
        return "East"
    return CURRENT_CONFERENCES.get(team_id, "Unknown")


def resolve_source_path(explicit_source: Path | None) -> Path:
    if explicit_source is not None:
        return explicit_source.expanduser().resolve()

    try:
        import kagglehub  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "No source was provided and kagglehub is not installed. "
            "Install it or pass --source to a local dataset copy."
        ) from exc

    dataset_dir = Path(kagglehub.dataset_download("wyattowalsh/basketball"))
    return dataset_dir


def locate_game_source(source: Path) -> tuple[str, Path]:
    if source.is_file() and source.suffix == ".sqlite":
        return "sqlite", source

    if source.is_file() and source.name.lower() == "game.csv":
        return "csv-file", source

    if source.is_dir():
        sqlite_path = source / "nba.sqlite"
        if sqlite_path.exists():
            return "sqlite", sqlite_path

        csv_path = source / "csv" / "game.csv"
        if csv_path.exists():
            return "csv-file", csv_path

        direct_csv = source / "game.csv"
        if direct_csv.exists():
            return "csv-file", direct_csv

    raise SystemExit(
        f"Could not locate nba.sqlite or game.csv under source path: {source}"
    )


def load_games_from_sqlite(sqlite_path: Path, season_start: int) -> pd.DataFrame:
    query = f"""
        SELECT {", ".join(GAME_COLUMNS)}
        FROM game
        WHERE season_type = 'Regular Season'
          AND CAST(substr(season_id, 2) AS INT) >= ?
    """
    with sqlite3.connect(sqlite_path) as con:
        return pd.read_sql_query(query, con, params=[season_start])


def load_games_from_csv(csv_path: Path, season_start: int) -> pd.DataFrame:
    games = pd.read_csv(csv_path, usecols=GAME_COLUMNS)
    seasons = pd.to_numeric(games["season_id"].astype(str).str[1:], errors="coerce")
    return games.loc[
        (games["season_type"] == "Regular Season") & (seasons >= season_start)
    ].copy()


def load_games_frame(source: Path, season_start: int) -> pd.DataFrame:
    source_type, resolved_path = locate_game_source(source)

    if source_type == "sqlite":
        games = load_games_from_sqlite(resolved_path, season_start)
    else:
        games = load_games_from_csv(resolved_path, season_start)

    games["season"] = pd.to_numeric(
        games["season_id"].astype(str).str[1:], errors="coerce"
    )
    games["game_date"] = pd.to_datetime(games["game_date"], errors="coerce")

    numeric_columns = [
        "fga_home",
        "fg3m_home",
        "fg3a_home",
        "reb_home",
        "ast_home",
        "pts_home",
        "fga_away",
        "fg3m_away",
        "fg3a_away",
        "reb_away",
        "ast_away",
        "pts_away",
    ]
    for column in numeric_columns:
        games[column] = pd.to_numeric(games[column], errors="coerce")

    return games


def build_team_games(games: pd.DataFrame) -> pd.DataFrame:
    home = pd.DataFrame(
        {
            "season": games["season"],
            "game_id": games["game_id"],
            "game_date": games["game_date"],
            "team_id": pd.to_numeric(games["team_id_home"], errors="coerce").astype(
                "Int64"
            ),
            "team_abbr": games["team_abbreviation_home"],
            "team_name": games["team_name_home"],
            "result": games["wl_home"],
            "fga": games["fga_home"],
            "fg3m": games["fg3m_home"],
            "fg3a": games["fg3a_home"],
            "rebounds": games["reb_home"],
            "assists": games["ast_home"],
            "points": games["pts_home"],
        }
    )

    away = pd.DataFrame(
        {
            "season": games["season"],
            "game_id": games["game_id"],
            "game_date": games["game_date"],
            "team_id": pd.to_numeric(games["team_id_away"], errors="coerce").astype(
                "Int64"
            ),
            "team_abbr": games["team_abbreviation_away"],
            "team_name": games["team_name_away"],
            "result": games["wl_away"],
            "fga": games["fga_away"],
            "fg3m": games["fg3m_away"],
            "fg3a": games["fg3a_away"],
            "rebounds": games["reb_away"],
            "assists": games["ast_away"],
            "points": games["pts_away"],
        }
    )

    team_games = pd.concat([home, away], ignore_index=True)
    team_games["season_label"] = team_games["season"].map(season_label)
    team_games["win"] = (team_games["result"] == "W").astype(int)
    team_games["loss"] = (team_games["result"] == "L").astype(int)
    team_games["team_id"] = team_games["team_id"].astype(int)
    return team_games


def build_league_summary(games: pd.DataFrame, team_games: pd.DataFrame) -> pd.DataFrame:
    season_totals = (
        team_games.groupby("season", as_index=False)
        .agg(
            season_label=("season_label", "first"),
            avg_points=("points", "mean"),
            avg_fg3a=("fg3a", "mean"),
            avg_fg3m=("fg3m", "mean"),
            avg_fga=("fga", "mean"),
            avg_assists=("assists", "mean"),
            avg_rebounds=("rebounds", "mean"),
            total_fg3a=("fg3a", "sum"),
            total_fga=("fga", "sum"),
            teams_count=("team_id", "nunique"),
        )
        .sort_values("season")
    )

    games_count = (
        games.groupby("season", as_index=False)
        .agg(games_count=("game_id", "nunique"))
        .sort_values("season")
    )

    league = season_totals.merge(games_count, on="season", how="left")
    league["avg_three_point_rate"] = league["total_fg3a"] / league["total_fga"]

    ordered_columns = [
        "season",
        "season_label",
        "avg_points",
        "avg_fg3a",
        "avg_fg3m",
        "avg_fga",
        "avg_three_point_rate",
        "avg_assists",
        "avg_rebounds",
        "games_count",
        "teams_count",
    ]
    league = league[ordered_columns]

    numeric_columns = [
        "avg_points",
        "avg_fg3a",
        "avg_fg3m",
        "avg_fga",
        "avg_three_point_rate",
        "avg_assists",
        "avg_rebounds",
    ]
    league[numeric_columns] = league[numeric_columns].round(3)
    return league


def build_team_summary(team_games: pd.DataFrame) -> pd.DataFrame:
    team_summary = (
        team_games.groupby(["season", "team_id"], as_index=False)
        .agg(
            season_label=("season_label", "first"),
            team_abbr=("team_abbr", dominant_value),
            team_name=("team_name", dominant_value),
            games_played=("game_id", "nunique"),
            avg_points=("points", "mean"),
            avg_fg3a=("fg3a", "mean"),
            avg_fg3m=("fg3m", "mean"),
            avg_fga=("fga", "mean"),
            total_fg3a=("fg3a", "sum"),
            total_fga=("fga", "sum"),
            avg_assists=("assists", "mean"),
            avg_rebounds=("rebounds", "mean"),
            wins=("win", "sum"),
            losses=("loss", "sum"),
        )
        .sort_values(["season", "team_name"])
    )

    team_summary["avg_three_point_rate"] = (
        team_summary["total_fg3a"] / team_summary["total_fga"]
    )
    team_summary["win_pct"] = team_summary["wins"] / team_summary["games_played"]
    team_summary["conference"] = team_summary.apply(
        lambda row: infer_conference(int(row["team_id"]), int(row["season"])), axis=1
    )

    ordered_columns = [
        "season",
        "season_label",
        "team_id",
        "team_abbr",
        "team_name",
        "games_played",
        "avg_points",
        "avg_fg3a",
        "avg_fg3m",
        "avg_fga",
        "avg_three_point_rate",
        "avg_assists",
        "avg_rebounds",
        "win_pct",
        "wins",
        "losses",
        "conference",
    ]
    team_summary = team_summary[ordered_columns]

    numeric_columns = [
        "avg_points",
        "avg_fg3a",
        "avg_fg3m",
        "avg_fga",
        "avg_three_point_rate",
        "avg_assists",
        "avg_rebounds",
        "win_pct",
    ]
    team_summary[numeric_columns] = team_summary[numeric_columns].round(3)
    return team_summary


def build_annotations(available_seasons: Iterable[int]) -> list[dict]:
    seasons = set(available_seasons)
    base_annotations = [
        {
            "season": 1985,
            "title": "Complete tracking begins",
            "text": (
                "This is the first season where leaguewide 3PA share can be compared "
                "cleanly, because both FGA and 3PA coverage become complete here."
            ),
            "placement": "top",
        },
        {
            "season": 1994,
            "title": "Shorter line, sudden bump",
            "text": (
                "The shorter line briefly made perimeter volume easier for almost "
                "everyone, so part of this spike reflects rule design, not just strategy."
            ),
            "placement": "bottom",
        },
        {
            "season": 1997,
            "title": "Arc restored",
            "text": (
                "When the line moved back, some of the jump faded, which helps separate "
                "a temporary rule effect from the deeper long-run strategic shift."
            ),
            "placement": "top",
        },
        {
            "season": 2005,
            "title": "Pace-and-space preview",
            "text": (
                "Spacing-first offenses showed that faster decisions and more perimeter "
                "threats could bend a defense before the whole league copied the idea."
            ),
            "placement": "bottom",
        },
        {
            "season": 2013,
            "title": "Analytics era accelerates",
            "text": (
                "By this point, teams were more deliberately replacing long twos with "
                "threes, and the gap between adopters and holdouts was widening."
            ),
            "placement": "top",
        },
        {
            "season": 2015,
            "title": "Championship proof of concept",
            "text": (
                "A title team built around extreme shooting made high-volume three-point "
                "offense feel repeatable, not experimental."
            ),
            "placement": "bottom",
        },
        {
            "season": 2018,
            "title": "The volume race",
            "text": (
                "Contenders were no longer debating whether to shoot more threes, but "
                "how aggressively they could push volume without losing balance."
            ),
            "placement": "top",
        },
    ]

    annotations = []
    for annotation in base_annotations:
        if annotation["season"] not in seasons:
            continue
        annotations.append(
            {
                **annotation,
                "season_label": season_label(annotation["season"]),
            }
        )
    return annotations


def write_outputs(
    output_dir: Path,
    league_summary: pd.DataFrame,
    team_summary: pd.DataFrame,
    annotations: list[dict],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    league_path = output_dir / "league_season_summary.csv"
    team_path = output_dir / "team_season_summary.csv"
    annotations_path = output_dir / "annotations.json"

    league_summary.to_csv(league_path, index=False)
    team_summary.to_csv(team_path, index=False)
    annotations_path.write_text(json.dumps(annotations, indent=2), encoding="utf-8")

    print(f"Wrote {league_path}")
    print(f"Wrote {team_path}")
    print(f"Wrote {annotations_path}")


def main() -> None:
    args = parse_args()
    source_root = resolve_source_path(args.source)
    games = load_games_frame(source_root, args.season_start)

    if args.season_end is not None:
        games = games.loc[games["season"] <= args.season_end].copy()

    if games.empty:
        raise SystemExit("No regular season games matched the requested season range.")

    team_games = build_team_games(games)
    league_summary = build_league_summary(games, team_games)
    team_summary = build_team_summary(team_games)
    annotations = build_annotations(league_summary["season"].tolist())

    write_outputs(args.output_dir, league_summary, team_summary, annotations)

    print()
    print(
        "Generated "
        f"{len(league_summary)} league rows and {len(team_summary)} team-season rows "
        f"for seasons {league_summary['season'].min()} to {league_summary['season'].max()}."
    )


if __name__ == "__main__":
    main()
