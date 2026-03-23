# From Paint to Perimeter

An interactive D3.js explorable about how NBA offense shifted toward the
three-point line, and how unevenly teams adopted that change over time.

This project was built as a CSC316 assignment with a deliberately tight scope:
instead of becoming a general basketball dashboard, it focuses on one
historical question and supports it with three coordinated views.

## Project Question

How has offensive strategy changed across modern NBA history, especially with
the rise of three-point shooting, and how differently did teams adopt the
three-point era?

## What the Visualization Includes

1. A league-level timeline that shows how the offensive baseline changes over
   time.
2. A team-level scatterplot for a selected season, showing outliers, early
   adopters, and laggards.
3. A team detail view that compares one franchise against the league average
   across time.

Core interactions:

- Hover tooltips with season and team context
- Team hover highlight coordinated across views
- Click to pin a team
- Season slider plus play/pause
- Metric toggle
- Reset button
- Milestone annotation toggle
- Smooth transitions when season or metric changes

## Data Source

Primary source:

- Kaggle NBA Database by wyattowalsh:
  [https://www.kaggle.com/datasets/wyattowalsh/basketball/data](https://www.kaggle.com/datasets/wyattowalsh/basketball/data)

The frontend does not load the raw Kaggle database directly. Instead, a Python
preprocessing script creates small static files that are safe and fast for a
GitHub Pages deployment.

## Stage 1: Raw Dataset Summary

The Kaggle release used here contains a SQLite database plus CSV mirrors. The
most important source table for this project is `game`, which already stores
full home-team and away-team box-score stats on each row.

Relevant raw fields from `game`:

- `season_id`
- `game_id`
- `season_type`
- `team_id_home`, `team_abbreviation_home`, `team_name_home`, `wl_home`
- `fga_home`, `fg3m_home`, `fg3a_home`, `reb_home`, `ast_home`, `pts_home`
- `team_id_away`, `team_abbreviation_away`, `team_name_away`, `wl_away`
- `fga_away`, `fg3m_away`, `fg3a_away`, `reb_away`, `ast_away`, `pts_away`

Why this matters:

- No heavy join is required for the core analysis.
- Each raw game row can be reshaped into two team-game rows.
- Team-season and league-season summaries can then be aggregated cleanly.

Important data tradeoffs:

- The visualization uses regular season games only, because that keeps season
  comparisons consistent.
- This dataset first has complete team-level `FGA` and `FG3A` coverage from
  `1985-86`, so the explorable begins there instead of at the 1979 three-point
  rule change.
- The published `game` table in this Kaggle version skips the `2012-13`
  regular season, so the output files preserve that gap rather than inventing
  values.

## Derived File Schema

### `data/league_season_summary.csv`

Each row is one season.

Columns:

- `season`
- `season_label`
- `avg_points`
- `avg_fg3a`
- `avg_fg3m`
- `avg_fga`
- `avg_three_point_rate`
- `avg_assists`
- `avg_rebounds`
- `games_count`
- `teams_count`

### `data/team_season_summary.csv`

Each row is one team in one season.

Columns:

- `season`
- `season_label`
- `team_id`
- `team_abbr`
- `team_name`
- `games_played`
- `avg_points`
- `avg_fg3a`
- `avg_fg3m`
- `avg_fga`
- `avg_three_point_rate`
- `avg_assists`
- `avg_rebounds`
- `win_pct`
- `wins`
- `losses`
- `conference`

### `data/annotations.json`

A curated set of milestone seasons used for subtle narrative guidance on the
timeline.

## Stage 2: Preprocessing

The preprocessing script lives at [scripts/preprocess.py](./scripts/preprocess.py).

It will:

- download the public Kaggle dataset with `kagglehub` if no local source is
  provided
- load the `game` table
- reshape home/away box scores into team-game rows
- aggregate season summaries
- write the two CSV files and the annotations JSON

Install dependencies:

```bash
pip install -r requirements.txt
```

Run preprocessing:

```bash
python scripts/preprocess.py
```

Optional: point it to a local dataset copy or SQLite file:

```bash
python scripts/preprocess.py --source path/to/nba.sqlite
python scripts/preprocess.py --source path/to/kaggle/dataset/folder
```

## Stage 3: Website Structure

The site is a plain static D3 project with no build step.

```text
/
  index.html
  /src
    main.js
    state.js
    dataLoader.js
    constants.js
    /views
      timelineView.js
      scatterView.js
      detailView.js
      controls.js
      annotations.js
    /utils
      format.js
      helpers.js
      scales.js
      tooltip.js
  /data
    league_season_summary.csv
    team_season_summary.csv
    annotations.json
  /styles
    main.css
  /scripts
    preprocess.py
```

Key engineering choices:

- Shared state model instead of ad hoc mutation
- Lightweight derived data files for frontend performance
- ES module structure for readability
- Reusable D3 update patterns in each view
- No framework and no charting library beyond D3

## Stage 4: Design Review and Self-Audit

How this project tries to meet the assignment goals:

- Specific question: the visualization is centered on the rise of the
  three-point era, not on general NBA history.
- Effective encodings: line chart for long-run change, scatterplot for
  season-level outliers, and a focused comparison line chart for drill-down.
- Meaningful interaction: hover, pin, season scrub, metric toggle, play/pause,
  and milestone annotations all support analysis rather than decoration.
- Meaningful animation: transitions are used for season updates, metric
  switching, and annotation changes.
- Polished layout: the page is guided, restrained, and intentionally avoids a
  cluttered dashboard structure.

Known constraints:

- Because the source data does not provide complete pre-1985 attempt totals, the
  site cannot honestly visualize three-point rate back to 1979 without mixing
  incomparable data.
- The project uses a dropdown instead of a full searchable combobox to stay
  lightweight and framework-free.

## Stage 5: Local Serving and GitHub Pages Deployment

Serve locally from the project root:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Deploy to GitHub Pages:

1. Commit the repository contents to GitHub.
2. Push the project so that `index.html`, `data/`, `src/`, and `styles/` all
   live at the repository root.
3. In the GitHub repository, open `Settings -> Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select the branch you want to publish, usually `main`, and set the folder to
   `/ (root)`.
6. Save the settings and wait for GitHub Pages to publish the site.

Because the project is fully static, no build pipeline or backend is needed.

## Notes for Modifying the Project

- To change the story emphasis, edit the annotation objects generated by
  `scripts/preprocess.py`.
- To change the available metrics, update [src/constants.js](./src/constants.js).
- To adjust interaction behavior, start with
  [src/views/controls.js](./src/views/controls.js) and
  [src/state.js](./src/state.js).
- To restyle the page, edit [styles/main.css](./styles/main.css).

## Credits

- Data: wyattowalsh's Kaggle NBA Database
- Visualization library: D3.js
- Course context: CSC316 interactive and animated visualization assignment
