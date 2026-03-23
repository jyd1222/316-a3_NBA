const d3 = window.d3;

import {
  CHART_HEIGHTS,
  SCATTER_METRICS,
  TRANSITION_MS,
} from "../constants.js";
import {
  formatMetricDelta,
  formatMetricValue,
  formatRecord,
  formatWinPct,
} from "../utils/format.js";
import {
  getActiveTeamId,
  getTeamRowForSeason,
  observeResize,
} from "../utils/helpers.js";
import { createMetricScale, createRadiusScale } from "../utils/scales.js";

export class ScatterView {
  constructor({ container, summaryEl, store, data, tooltip }) {
    this.container = container;
    this.summaryEl = summaryEl;
    this.store = store;
    this.data = data;
    this.tooltip = tooltip;

    this.xDomainValues = this.data.teams.map((row) => row[SCATTER_METRICS.x]);
    this.yDomainValues = this.data.teams.map((row) => row[SCATTER_METRICS.y]);
    this.radiusValues = this.data.teams.map((row) => row[SCATTER_METRICS.size]);

    this.svg = d3.select(container).append("svg");
    this.gridLayer = this.svg.append("g").attr("class", "grid");
    this.axisX = this.svg.append("g").attr("class", "axis");
    this.axisY = this.svg.append("g").attr("class", "axis");
    this.avgLayer = this.svg.append("g");
    this.pointLayer = this.svg.append("g");
    this.labelLayer = this.svg.append("g");

    this.unsubscribe = this.store.subscribe((state) => this.render(state));
    this.resizeObserver = observeResize(this.container, () =>
      this.render(this.store.getState())
    );
  }

  render(state) {
    const seasonRows = this.data.teamsBySeason.get(state.selectedSeason) ?? [];
    const leagueRow = this.data.leagueBySeason.get(state.selectedSeason);
    const activeTeamId = getActiveTeamId(state);
    const activeSeasonRow = activeTeamId
      ? getTeamRowForSeason(this.data, activeTeamId, state.selectedSeason)
      : null;

    const width = Math.max(this.container.clientWidth, 320);
    const height = CHART_HEIGHTS.scatter;
    const margin = { top: 18, right: 24, bottom: 66, left: 72 };
    const innerWidth = width - margin.left - margin.right;

    const xScale = createMetricScale(
      this.xDomainValues,
      [margin.left, width - margin.right],
      { isRate: true }
    );
    const yScale = createMetricScale(this.yDomainValues, [
      height - margin.bottom,
      margin.top,
    ]);
    const radiusScale = createRadiusScale(this.radiusValues, [5.5, 13.5]);

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);

    this.gridLayer
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat("")
      );

    this.axisX
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(6)
          .tickFormat((value) => formatMetricValue(SCATTER_METRICS.x, value))
      );

    this.axisY
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((value) => formatMetricValue(SCATTER_METRICS.y, value))
      );

    this.axisX
      .selectAll(".axis-title")
      .data(["Three-point shot share"])
      .join("text")
      .attr("class", "axis-title")
      .attr("x", width - margin.right)
      .attr("y", 48)
      .attr("text-anchor", "end")
      .text((value) => value);

    this.axisY
      .selectAll(".axis-title")
      .data(["Points per game"])
      .join("text")
      .attr("class", "axis-title")
      .attr("transform", `translate(18, ${height / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .text((value) => value);

    const avgLines = [
      {
        key: "x",
        x1: xScale(leagueRow.avg_three_point_rate),
        x2: xScale(leagueRow.avg_three_point_rate),
        y1: margin.top,
        y2: height - margin.bottom,
        labelX: xScale(leagueRow.avg_three_point_rate) + 8,
        labelY: margin.top + 14,
        label: "League 3PA share",
      },
      {
        key: "y",
        x1: margin.left,
        x2: width - margin.right,
        y1: yScale(leagueRow.avg_points),
        y2: yScale(leagueRow.avg_points),
        labelX: width - margin.right - 4,
        labelY: yScale(leagueRow.avg_points) - 8,
        label: "League scoring",
      },
    ];

    this.avgLayer
      .selectAll(".avg-line")
      .data(avgLines, (line) => line.key)
      .join("line")
      .attr("class", "avg-line")
      .transition()
      .duration(TRANSITION_MS)
      .attr("x1", (line) => line.x1)
      .attr("x2", (line) => line.x2)
      .attr("y1", (line) => line.y1)
      .attr("y2", (line) => line.y2);

    this.avgLayer
      .selectAll(".avg-label")
      .data(avgLines, (line) => `${line.key}-label`)
      .join("text")
      .attr("class", "avg-label")
      .attr("text-anchor", (line) => (line.key === "y" ? "end" : "start"))
      .transition()
      .duration(TRANSITION_MS)
      .attr("x", (line) => line.labelX)
      .attr("y", (line) => line.labelY)
      .text((line) => line.label);

    this.pointLayer
      .selectAll(".scatter-point")
      .data(seasonRows, (row) => row.team_id)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "scatter-point")
            .attr("cx", xScale(leagueRow.avg_three_point_rate))
            .attr("cy", yScale(leagueRow.avg_points))
            .attr("r", 0),
        (update) => update,
        (exit) =>
          exit
            .transition()
            .duration(TRANSITION_MS / 2)
            .attr("r", 0)
            .style("opacity", 0)
            .remove()
      )
      .classed("is-selected", (row) => row.team_id === state.selectedTeamId)
      .classed(
        "is-hovered",
        (row) => row.team_id === state.hoveredTeamId && row.team_id !== state.selectedTeamId
      )
      .classed(
        "is-dimmed",
        (row) =>
          activeTeamId != null &&
          row.team_id !== activeTeamId &&
          row.team_id !== state.hoveredTeamId
      )
      .on("mouseenter", (_, row) => {
        this.store.setState({ hoveredTeamId: row.team_id });
      })
      .on("mousemove", (event, row) => {
        this.tooltip.show(buildScatterTooltip({ row, leagueRow }), event);
      })
      .on("mouseleave", () => {
        this.tooltip.hide();
        this.store.setState({ hoveredTeamId: null });
      })
      .on("click", (_, row) => {
        this.store.setState({
          selectedTeamId:
            this.store.getState().selectedTeamId === row.team_id ? null : row.team_id,
          hoveredTeamId: null,
          isPlaying: false,
        });
      })
      .transition()
      .duration(TRANSITION_MS)
      .attr("cx", (row) => xScale(row.avg_three_point_rate))
      .attr("cy", (row) => yScale(row.avg_points))
      .attr("r", (row) => radiusScale(row.win_pct));

    const labeledTeams = seasonRows.filter(
      (row) => row.team_id === state.selectedTeamId || row.team_id === state.hoveredTeamId
    );

    this.labelLayer
      .selectAll(".scatter-label")
      .data(labeledTeams, (row) => row.team_id)
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "scatter-label")
            .attr("opacity", 0),
        (update) => update,
        (exit) => exit.transition().duration(TRANSITION_MS / 2).attr("opacity", 0).remove()
      )
      .transition()
      .duration(TRANSITION_MS)
      .attr("opacity", 1)
      .attr("x", (row) => xScale(row.avg_three_point_rate) + radiusScale(row.win_pct) + 6)
      .attr("y", (row) => yScale(row.avg_points) - radiusScale(row.win_pct) - 6)
      .text((row) => row.team_abbr);

    this.updateSummary({ state, seasonRows, leagueRow, activeSeasonRow });
  }

  updateSummary({ state, seasonRows, leagueRow, activeSeasonRow }) {
    if (activeSeasonRow) {
      const prefix = state.selectedTeamId
        ? activeSeasonRow.team_name
        : `Previewing ${activeSeasonRow.team_name}`;
      this.summaryEl.textContent = `${prefix} scored ${formatMetricValue(
        "avg_points",
        activeSeasonRow.avg_points
      )} in ${activeSeasonRow.season_label} while taking ${formatMetricValue(
        "avg_three_point_rate",
        activeSeasonRow.avg_three_point_rate
      )} of its shots from three, ${formatMetricDelta(
        "avg_three_point_rate",
        activeSeasonRow.avg_three_point_rate,
        leagueRow.avg_three_point_rate
      )}.`;
      return;
    }

    if (state.selectedTeamId && !activeSeasonRow) {
      const teamMeta = this.data.teamLookup.find(
        (team) => team.team_id === state.selectedTeamId
      );
      this.summaryEl.textContent = `${teamMeta?.team_name ?? "The selected team"} is not present in ${leagueRow.season_label}, so the scatterplot falls back to league-wide outliers for that season.`;
      return;
    }

    const mostThrees = seasonRows
      .slice()
      .sort((a, b) => d3.descending(a.avg_three_point_rate, b.avg_three_point_rate))[0];
    const fewestThrees = seasonRows
      .slice()
      .sort((a, b) => d3.ascending(a.avg_three_point_rate, b.avg_three_point_rate))[0];

    this.summaryEl.textContent = `In ${leagueRow.season_label}, ${mostThrees.team_name} leaned furthest toward the arc at ${formatMetricValue(
      "avg_three_point_rate",
      mostThrees.avg_three_point_rate
    )}, while ${fewestThrees.team_name} remained most resistant at ${formatMetricValue(
      "avg_three_point_rate",
      fewestThrees.avg_three_point_rate
    )}.`;
  }
}

function buildScatterTooltip({ row, leagueRow }) {
  return `
    <div class="tooltip__eyebrow">${row.season_label}</div>
    <div class="tooltip__title">${row.team_name} (${row.team_abbr})</div>
    <div class="tooltip__grid">
      <span>Points per game</span><strong>${formatMetricValue("avg_points", row.avg_points)}</strong>
      <span>3PA per game</span><strong>${formatMetricValue("avg_fg3a", row.avg_fg3a)}</strong>
      <span>3-point rate</span><strong>${formatMetricValue("avg_three_point_rate", row.avg_three_point_rate)}</strong>
      <span>Win percentage</span><strong>${formatWinPct(row.win_pct)} (${formatRecord(row.wins, row.losses)})</strong>
    </div>
    <div class="tooltip__note">${formatMetricDelta(
      "avg_three_point_rate",
      row.avg_three_point_rate,
      leagueRow.avg_three_point_rate
    )}; scoring ${formatMetricDelta("avg_points", row.avg_points, leagueRow.avg_points)}.</div>
  `;
}
