const d3 = window.d3;

import { CHART_HEIGHTS, METRICS, TRANSITION_MS } from "../constants.js";
import { formatMetricValue, seasonLabelForRow } from "../utils/format.js";
import {
  getActiveTeamId,
  getTeamRowForSeason,
  observeResize,
} from "../utils/helpers.js";
import { createMetricScale, createSeasonScale } from "../utils/scales.js";

export class DetailView {
  constructor({ container, summaryEl, store, data, tooltip }) {
    this.container = container;
    this.summaryEl = summaryEl;
    this.store = store;
    this.data = data;
    this.tooltip = tooltip;

    this.svg = d3.select(container).append("svg");
    this.gridLayer = this.svg.append("g").attr("class", "grid");
    this.axisX = this.svg.append("g").attr("class", "axis");
    this.axisY = this.svg.append("g").attr("class", "axis");
    this.guideLayer = this.svg.append("g");
    this.lineLayer = this.svg.append("g");
    this.pointLayer = this.svg.append("g");
    this.labelLayer = this.svg.append("g");
    this.emptyLayer = this.svg.append("g");

    this.unsubscribe = this.store.subscribe((state) => this.render(state));
    this.resizeObserver = observeResize(this.container, () =>
      this.render(this.store.getState())
    );
  }

  render(state) {
    const activeTeamId = getActiveTeamId(state);
    const metricKey = state.selectedMetric;
    const metricMeta = METRICS[metricKey];
    const width = Math.max(this.container.clientWidth, 320);
    const height = CHART_HEIGHTS.detail;
    const margin = { top: 18, right: 38, bottom: 60, left: 72 };
    const innerWidth = width - margin.left - margin.right;

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (!activeTeamId) {
      this.renderEmptyState({ width, height });
      this.summaryEl.textContent =
        "Choose a team from the scatterplot or dropdown to compare its long-run trend against the league average.";
      return;
    }

    this.emptyLayer.selectAll("*").remove();

    const leagueSeries = this.data.league;
    const teamSeries = this.data.teamSeriesById.get(activeTeamId) ?? [];
    const selectedTeamRow = teamSeries.at(-1);
    const currentSeasonTeamRow = getTeamRowForSeason(
      this.data,
      activeTeamId,
      state.selectedSeason
    );
    const values = [
      ...leagueSeries.map((row) => row[metricKey]),
      ...teamSeries.map((row) => row[metricKey]),
    ];

    const xScale = createSeasonScale(this.data.seasons, [
      margin.left,
      width - margin.right,
    ]);
    const yScale = createMetricScale(values, [height - margin.bottom, margin.top], {
      isRate: metricMeta.isRate,
    });

    const line = d3
      .line()
      .defined((row) => row[metricKey] != null)
      .x((row) => xScale(row.season))
      .y((row) => yScale(row[metricKey]));

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
          .tickValues(
            this.data.seasons.filter(
              (season, index) =>
                index === 0 || index === this.data.seasons.length - 1 || season % 4 === 1
            )
          )
          .tickFormat((season) => this.data.leagueBySeason.get(season)?.season_label.slice(0, 4))
      );

    this.axisY
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((value) => formatMetricValue(metricKey, value))
      );

    this.axisX
      .selectAll(".axis-title")
      .data(["Season"])
      .join("text")
      .attr("class", "axis-title")
      .attr("x", width - margin.right)
      .attr("y", 48)
      .attr("text-anchor", "end")
      .text((value) => value);

    this.axisY
      .selectAll(".axis-title")
      .data([metricMeta.longLabel])
      .join("text")
      .attr("class", "axis-title")
      .attr("transform", `translate(18, ${height / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .text((value) => value);

    const selectedSeasonX = xScale(state.selectedSeason);
    this.guideLayer
      .selectAll(".timeline-selected-line")
      .data([state.selectedSeason])
      .join("line")
      .attr("class", "timeline-selected-line")
      .transition()
      .duration(TRANSITION_MS)
      .attr("x1", selectedSeasonX)
      .attr("x2", selectedSeasonX)
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom);

    this.lineLayer
      .selectAll(".detail-line--league")
      .data([leagueSeries])
      .join("path")
      .attr("class", "detail-line detail-line--league")
      .transition()
      .duration(TRANSITION_MS)
      .attr("d", line);

    this.lineLayer
      .selectAll(".detail-line--team")
      .data([teamSeries])
      .join("path")
      .attr("class", "detail-line detail-line--team")
      .transition()
      .duration(TRANSITION_MS)
      .attr("d", line);

    const markerData = [
      {
        key: "league",
        row: this.data.leagueBySeason.get(state.selectedSeason),
        className: "detail-point detail-point--league",
      },
    ];

    if (currentSeasonTeamRow) {
      markerData.push({
        key: "team",
        row: currentSeasonTeamRow,
        className: "detail-point detail-point--team",
      });
    }

    this.pointLayer
      .selectAll(".detail-point")
      .data(markerData, (entry) => entry.key)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", (entry) => entry.className)
            .attr("r", 0),
        (update) => update,
        (exit) => exit.transition().duration(TRANSITION_MS / 2).attr("r", 0).remove()
      )
      .transition()
      .duration(TRANSITION_MS)
      .attr("cx", (entry) => xScale(entry.row.season))
      .attr("cy", (entry) => yScale(entry.row[metricKey]))
      .attr("r", 5.5);

    const endLabels = [
      {
        key: "league-label",
        text: "League average",
        row: leagueSeries.at(-1),
      },
      {
        key: "team-label",
        text: selectedTeamRow.team_name,
        row: teamSeries.at(-1),
      },
    ];

    this.labelLayer
      .selectAll(".detail-end-label")
      .data(endLabels, (entry) => entry.key)
      .join("text")
      .attr("class", "detail-end-label")
      .transition()
      .duration(TRANSITION_MS)
      .attr("x", (entry) => xScale(entry.row.season) + 8)
      .attr("y", (entry) => yScale(entry.row[metricKey]) + 4)
      .text((entry) => entry.text);

    this.pointLayer
      .selectAll(".detail-hit-point")
      .data(teamSeries, (row) => row.season)
      .join("circle")
      .attr("class", "timeline-hit-area detail-hit-point")
      .attr("cx", (row) => xScale(row.season))
      .attr("cy", (row) => yScale(row[metricKey]))
      .attr("r", 14)
      .on("mouseenter mousemove", (event, row) => {
        const leagueRow = this.data.leagueBySeason.get(row.season);
        this.tooltip.show(buildDetailTooltip({ row, leagueRow, metricKey }), event);
      })
      .on("mousemove", (event) => this.tooltip.move(event))
      .on("mouseleave", () => this.tooltip.hide());

    this.updateSummary({
      state,
      metricKey,
      teamSeries,
      currentSeasonTeamRow,
      selectedTeamRow,
    });
  }

  renderEmptyState({ width, height }) {
    this.gridLayer.selectAll("*").remove();
    this.axisX.selectAll("*").remove();
    this.axisY.selectAll("*").remove();
    this.guideLayer.selectAll("*").remove();
    this.lineLayer.selectAll("*").remove();
    this.pointLayer.selectAll("*").remove();
    this.labelLayer.selectAll("*").remove();

    this.emptyLayer.selectAll("*").remove();
    this.emptyLayer
      .append("text")
      .attr("class", "detail-empty")
      .attr("x", width / 2)
      .attr("y", height / 2 - 10)
      .attr("text-anchor", "middle")
      .html(
        "<tspan x='50%' dy='0'>Select a team to compare it with the league.</tspan><tspan x='50%' dy='1.7em'>Hover previews the trend; clicking pins it for deeper exploration.</tspan>"
      );
  }

  updateSummary({ state, metricKey, teamSeries, currentSeasonTeamRow, selectedTeamRow }) {
    const seasonsAboveLeague = teamSeries.filter((row) => {
      const leagueRow = this.data.leagueBySeason.get(row.season);
      return row[metricKey] > leagueRow[metricKey];
    }).length;

    if (currentSeasonTeamRow) {
      const prefix = state.selectedTeamId
        ? selectedTeamRow.team_name
        : `Previewing ${selectedTeamRow.team_name}`;
      this.summaryEl.textContent = `${prefix} finished ${seasonsAboveLeague} of ${teamSeries.length} available seasons above league average for ${
        METRICS[metricKey].shortNarrative
      }. In ${seasonLabelForRow(currentSeasonTeamRow)}, it sat at ${formatMetricValue(
        metricKey,
        currentSeasonTeamRow[metricKey]
      )}.`;
      return;
    }

    this.summaryEl.textContent = `${selectedTeamRow.team_name} has no row in ${state.selectedSeason} because the franchise had not entered the league yet or was missing from that season's source data. Its historical trend still appears against league context.`;
  }
}

function buildDetailTooltip({ row, leagueRow, metricKey }) {
  return `
    <div class="tooltip__eyebrow">${row.season_label}</div>
    <div class="tooltip__title">${row.team_name}</div>
    <div class="tooltip__grid">
      <span>${METRICS[metricKey].tooltipLabel}</span><strong>${formatMetricValue(metricKey, row[metricKey])}</strong>
      <span>League average</span><strong>${formatMetricValue(metricKey, leagueRow[metricKey])}</strong>
      <span>Points per game</span><strong>${formatMetricValue("avg_points", row.avg_points)}</strong>
      <span>3PA per game</span><strong>${formatMetricValue("avg_fg3a", row.avg_fg3a)}</strong>
    </div>
  `;
}
