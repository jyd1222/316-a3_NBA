const d3 = window.d3;

import { CHART_HEIGHTS, METRICS, TRANSITION_MS } from "../constants.js";
import {
  formatMetricDelta,
  formatMetricValue,
  seasonLabelForRow,
} from "../utils/format.js";
import {
  buildPointSegments,
  getActiveTeamId,
  getTeamRowForSeason,
  observeResize,
} from "../utils/helpers.js";
import { createMetricScale, createSeasonScale } from "../utils/scales.js";
import { renderTimelineAnnotations } from "./annotations.js";

export class TimelineView {
  constructor({ container, summaryEl, noteEl, store, data, tooltip }) {
    this.container = container;
    this.summaryEl = summaryEl;
    this.noteEl = noteEl;
    this.store = store;
    this.data = data;
    this.tooltip = tooltip;

    this.svg = d3.select(container).append("svg");
    this.gridLayer = this.svg.append("g").attr("class", "grid");
    this.axisX = this.svg.append("g").attr("class", "axis");
    this.axisY = this.svg.append("g").attr("class", "axis");
    this.annotationLayer = this.svg.append("g");
    this.guideLayer = this.svg.append("g");
    this.lineLayer = this.svg.append("g");
    this.hitLayer = this.svg.append("g");

    this.unsubscribe = this.store.subscribe((state) => this.render(state));
    this.resizeObserver = observeResize(this.container, () =>
      this.render(this.store.getState())
    );
  }

  render(state) {
    const width = Math.max(this.container.clientWidth, 320);
    const height = CHART_HEIGHTS.timeline;
    const margin = { top: 26, right: 28, bottom: 58, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const metricKey = state.selectedMetric;
    const metricMeta = METRICS[metricKey];
    const activeTeamId = getActiveTeamId(state);
    const teamSeries = activeTeamId
      ? this.data.teamSeriesById.get(activeTeamId) ?? []
      : [];

    const domainValues = [
      ...this.data.league.map((row) => row[metricKey]),
      ...teamSeries.map((row) => row[metricKey]),
    ];

    const xScale = createSeasonScale(this.data.seasons, [
      margin.left,
      width - margin.right,
    ]);
    const yScale = createMetricScale(
      domainValues,
      [height - margin.bottom, margin.top],
      { isRate: metricMeta.isRate }
    );

    const line = d3
      .line()
      .defined((row) => row[metricKey] != null)
      .x((row) => xScale(row.season))
      .y((row) => yScale(row[metricKey]));

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
          .tickValues(
            this.data.seasons.filter(
              (season, index) =>
                index === 0 || index === this.data.seasons.length - 1 || season % 4 === 1
            )
          )
          .tickFormat((season) => {
            const row = this.data.leagueBySeason.get(season);
            return row ? row.season_label.slice(0, 4) : season;
          })
      );

    this.axisY
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((value) => formatMetricValue(metricKey, value))
      );

    this.axisY
      .selectAll(".axis-title")
      .data([metricMeta.longLabel])
      .join("text")
      .attr("class", "axis-title")
      .attr("transform", `translate(18, ${margin.top + innerHeight / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .text((value) => value);

    this.axisX
      .selectAll(".axis-title")
      .data(["Season"])
      .join("text")
      .attr("class", "axis-title")
      .attr("x", width - margin.right)
      .attr("y", 46)
      .attr("text-anchor", "end")
      .text((value) => value);

    this.lineLayer
      .selectAll(".timeline-line")
      .data([this.data.league])
      .join("path")
      .attr("class", "timeline-line")
      .transition()
      .duration(TRANSITION_MS)
      .attr("d", line);

    this.lineLayer
      .selectAll(".timeline-line--team")
      .data(teamSeries.length ? [teamSeries] : [])
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "timeline-line timeline-line--team")
            .attr("opacity", 0),
        (update) => update,
        (exit) => exit.transition().duration(TRANSITION_MS / 2).attr("opacity", 0).remove()
      )
      .classed("is-preview", !state.selectedTeamId && Boolean(state.hoveredTeamId))
      .transition()
      .duration(TRANSITION_MS)
      .attr("opacity", 1)
      .attr("d", line);

    const selectedSeasonRow = this.data.leagueBySeason.get(state.selectedSeason);
    const selectedSeasonX = xScale(state.selectedSeason);

    this.guideLayer
      .selectAll(".timeline-selected-line")
      .data([selectedSeasonRow])
      .join("line")
      .attr("class", "timeline-selected-line")
      .transition()
      .duration(TRANSITION_MS)
      .attr("x1", selectedSeasonX)
      .attr("x2", selectedSeasonX)
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom);

    this.guideLayer
      .selectAll(".timeline-selected-dot")
      .data([selectedSeasonRow])
      .join("circle")
      .attr("class", "timeline-selected-dot")
      .transition()
      .duration(TRANSITION_MS)
      .attr("cx", selectedSeasonX)
      .attr("cy", yScale(selectedSeasonRow[metricKey]))
      .attr("r", 6.5);

    const currentTeamRow = activeTeamId
      ? getTeamRowForSeason(this.data, activeTeamId, state.selectedSeason)
      : null;

    this.guideLayer
      .selectAll(".timeline-selected-dot--team")
      .data(currentTeamRow ? [currentTeamRow] : [])
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "timeline-selected-dot timeline-selected-dot--team")
            .attr("r", 0),
        (update) => update,
        (exit) => exit.transition().duration(TRANSITION_MS / 2).attr("r", 0).remove()
      )
      .transition()
      .duration(TRANSITION_MS)
      .attr("cx", xScale(currentTeamRow?.season))
      .attr("cy", currentTeamRow ? yScale(currentTeamRow[metricKey]) : height - margin.bottom)
      .attr("r", 5.5);

    renderTimelineAnnotations({
      layer: this.annotationLayer,
      annotations: this.data.annotations,
      xScale,
      yScale,
      leagueBySeason: this.data.leagueBySeason,
      metricKey,
      width,
      show: state.showAnnotations,
    });

    const hitSegments = buildPointSegments(
      xScale,
      this.data.seasons,
      margin.left,
      width - margin.right
    );

    this.hitLayer
      .selectAll(".timeline-hit-area")
      .data(hitSegments, (segment) => segment.value)
      .join("rect")
      .attr("class", "timeline-hit-area")
      .attr("x", (segment) => segment.x0)
      .attr("y", margin.top)
      .attr("width", (segment) => segment.width)
      .attr("height", innerHeight)
      .on("mouseenter mousemove", (event, segment) => {
        const leagueRow = this.data.leagueBySeason.get(segment.value);
        const teamRow = activeTeamId
          ? getTeamRowForSeason(this.data, activeTeamId, segment.value)
          : null;
        this.tooltip.show(
          buildTimelineTooltip({ leagueRow, teamRow, metricKey }),
          event
        );
      })
      .on("mousemove", (event) => this.tooltip.move(event))
      .on("mouseleave", () => this.tooltip.hide())
      .on("click", (_, segment) => {
        this.store.setState({
          selectedSeason: segment.value,
          isPlaying: false,
        });
      });

    this.updateSummary({
      state,
      metricKey,
      selectedSeasonRow,
      currentTeamRow,
      activeTeamId,
    });
    this.updateAnnotationNote(state, selectedSeasonRow);
  }

  updateSummary({ state, metricKey, selectedSeasonRow, currentTeamRow, activeTeamId }) {
    const firstSeasonRow = this.data.league[0];
    const narrativeMetric = METRICS[metricKey].shortNarrative;

    if (currentTeamRow && activeTeamId) {
      const intro = state.selectedTeamId
        ? currentTeamRow.team_name
        : `Previewing ${currentTeamRow.team_name}`;
      this.summaryEl.textContent = `${intro}: ${formatMetricValue(
        metricKey,
        currentTeamRow[metricKey]
      )} in ${seasonLabelForRow(currentTeamRow)}, ${formatMetricDelta(
        metricKey,
        currentTeamRow[metricKey],
        selectedSeasonRow[metricKey]
      )}.`;
      return;
    }

    if (state.selectedTeamId && !currentTeamRow) {
      const teamMeta = this.data.teamLookup.find(
        (team) => team.team_id === state.selectedTeamId
      );
      this.summaryEl.textContent = `${teamMeta?.team_name ?? "The selected team"} has no row in ${
        selectedSeasonRow.season_label
      }, so the league line remains the active guide for this season.`;
      return;
    }

    this.summaryEl.textContent = `By ${selectedSeasonRow.season_label}, league ${narrativeMetric} reached ${formatMetricValue(
      metricKey,
      selectedSeasonRow[metricKey]
    )}, up from ${formatMetricValue(
      metricKey,
      firstSeasonRow[metricKey]
    )} in ${firstSeasonRow.season_label}.`;
  }

  updateAnnotationNote(state, selectedSeasonRow) {
    if (!state.showAnnotations) {
      this.noteEl.innerHTML =
        "<strong>Milestones hidden.</strong> Re-enable the milestone toggle to show the guided story callouts on the league timeline.";
      return;
    }

    const annotation = this.data.annotationBySeason.get(selectedSeasonRow.season);
    if (annotation) {
      this.noteEl.innerHTML = `<strong>${annotation.title}</strong>${annotation.text}`;
      return;
    }

    this.noteEl.innerHTML = `<strong>${selectedSeasonRow.season_label}</strong>This season is not one of the highlighted milestones, so use it as a comparison anchor while exploring how individual teams diverged from the league norm.`;
  }
}

function buildTimelineTooltip({ leagueRow, teamRow, metricKey }) {
  const teamNote = teamRow
    ? `<div class="tooltip__note">${teamRow.team_name}: ${formatMetricValue(
        metricKey,
        teamRow[metricKey]
      )} (${formatMetricDelta(metricKey, teamRow[metricKey], leagueRow[metricKey])})</div>`
    : "";

  return `
    <div class="tooltip__eyebrow">${leagueRow.season_label}</div>
    <div class="tooltip__title">League trend</div>
    <div class="tooltip__grid">
      <span>${METRICS[metricKey].tooltipLabel}</span><strong>${formatMetricValue(metricKey, leagueRow[metricKey])}</strong>
      <span>3PA per game</span><strong>${formatMetricValue("avg_fg3a", leagueRow.avg_fg3a)}</strong>
      <span>Points per game</span><strong>${formatMetricValue("avg_points", leagueRow.avg_points)}</strong>
    </div>
    ${teamNote}
  `;
}
