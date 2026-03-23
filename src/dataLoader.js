const d3 = window.d3;

const DATA_VERSION = "20260323d";

export async function loadData() {
  const [leagueRows, teamRows, annotations] = await Promise.all([
    d3.csv(`./data/league_season_summary.csv?v=${DATA_VERSION}`, parseLeagueRow),
    d3.csv(`./data/team_season_summary.csv?v=${DATA_VERSION}`, parseTeamRow),
    d3.json(`./data/annotations.json?v=${DATA_VERSION}`),
  ]);

  const league = leagueRows.sort((a, b) => d3.ascending(a.season, b.season));
  const teams = teamRows.sort((a, b) =>
    d3.ascending(a.season, b.season) || d3.ascending(a.team_name, b.team_name)
  );
  const seasons = league.map((row) => row.season);
  const allSeasons = buildAllSeasons(seasons[0], seasons.at(-1));
  const seasonIndex = new Map(seasons.map((season, index) => [season, index]));
  const missingSeasons = allSeasons.filter((season) => !seasonIndex.has(season));

  const leagueBySeason = new Map(league.map((row) => [row.season, row]));
  const teamsBySeason = d3.group(teams, (row) => row.season);
  const teamSeriesById = d3.group(teams, (row) => row.team_id);
  const annotationBySeason = new Map(
    annotations.map((annotation) => [annotation.season, annotation])
  );

  const teamLookup = Array.from(
    d3.rollup(
      teams,
      (rows) => {
        const latest = rows
          .slice()
          .sort((a, b) => d3.descending(a.season, b.season))[0];
        return {
          team_id: latest.team_id,
          team_name: latest.team_name,
          team_abbr: latest.team_abbr,
          conference: latest.conference,
        };
      },
      (row) => row.team_id
    ).values()
  ).sort((a, b) => d3.ascending(a.team_name, b.team_name));

  return {
    league,
    teams,
    annotations,
    seasons,
    allSeasons,
    missingSeasons,
    seasonIndex,
    latestSeason: seasons.at(-1),
    leagueBySeason,
    teamsBySeason,
    teamSeriesById,
    annotationBySeason,
    teamLookup,
  };
}

function buildAllSeasons(startSeason, endSeason) {
  const seasons = [];
  for (let season = startSeason; season <= endSeason; season += 1) {
    seasons.push(season);
  }
  return seasons;
}

function parseLeagueRow(row) {
  return {
    season: +row.season,
    season_label: row.season_label,
    avg_points: +row.avg_points,
    avg_fg3a: +row.avg_fg3a,
    avg_fg3m: +row.avg_fg3m,
    avg_fga: +row.avg_fga,
    avg_three_point_rate: +row.avg_three_point_rate,
    avg_assists: +row.avg_assists,
    avg_rebounds: +row.avg_rebounds,
    games_count: +row.games_count,
    teams_count: +row.teams_count,
  };
}

function parseTeamRow(row) {
  return {
    season: +row.season,
    season_label: row.season_label,
    team_id: +row.team_id,
    team_abbr: row.team_abbr,
    team_name: row.team_name,
    games_played: +row.games_played,
    avg_points: +row.avg_points,
    avg_fg3a: +row.avg_fg3a,
    avg_fg3m: +row.avg_fg3m,
    avg_fga: +row.avg_fga,
    avg_three_point_rate: +row.avg_three_point_rate,
    avg_assists: +row.avg_assists,
    avg_rebounds: +row.avg_rebounds,
    win_pct: +row.win_pct,
    wins: +row.wins,
    losses: +row.losses,
    conference: row.conference,
  };
}
