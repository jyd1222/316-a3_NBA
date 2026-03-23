const d3 = window.d3;

import { CHART_HEIGHTS, METRICS, TRANSITION_MS } from "../constants.js";
import {
  formatMetricDelta,
  formatMetricValue,
  seasonLabelForRow,
} from "../utils/format.js";
import {
  buildPointSegments,
  buildSeasonSeriesWithGaps,
  clamp,
  formatFallbackSeasonLabel,
  getActiveTeamId,
  getTeamRowForSeason,
  normalizeSeasonRange,
  observeResize,
} from "../utils/helpers.js";
import { createMetricScale, createSeasonScale } from "../utils/scales.js";
import { renderTimelineAnnotations } from "./annotations.js";

export class TimelineView {
  constructor({ container, summaryEl, noteEl, rangeEl, store, data, tooltip }) {
    this.container = container;
    this.summaryEl = summaryEl;
    this.noteEl = noteEl;
    this.rangeEl = rangeEl;
    this.store = store;
    this.data = data;
    this.tooltip = tooltip;
    this.dragRange = null;

    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleRangeNoteClick = this.handleRangeNoteClick.bind(this);
    this.handleGlobalMouseup = this.handleGlobalMouseup.bind(this);

    this.svg = d3.select(container).append("svg");
    this.gridLayer = this.svg.append("g").attr("class", "grid");
    this.scopeLayer = this.svg.append("g");
    this.gapLayer = this.svg.append("g");
    this.rangeLayer = this.svg.append("g");
    this.axisX = this.svg.append("g").attr("class", "axis");
    this.axisY = this.svg.append("g").attr("class", "axis");
    this.annotationLayer = this.svg.append("g");
    this.guideLayer = this.svg.append("g");
    this.lineLayer = this.svg.append("g");
    this.hitLayer = this.svg.append("g");

    this.container.addEventListener("keydown", this.handleKeydown);
    this.rangeEl.addEventListener("click", this.handleRangeNoteClick);
    window.addEventListener?.("mouseup", this.handleGlobalMouseup);

    this.unsubscribe = this.store.subscribe((state) => this.render(state));
    this.resizeObserver = observeResize(this.container, () =>
      this.render(this.store.getState())
    );
  }

  render(state) {
    const width = Math.max(this.container.clientWidth, 320);
    const height = CHART_HEIGHTS.timeline;
    const margin = { top: 22, right: 22, bottom: 52, left: 70 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const seasonDomain = this.data.seasons;
    const metricKey = state.selectedMetric;
    const metricMeta = METRICS[metricKey];
    const activeTeamId = getActiveTeamId(state);
    const teamSeries = activeTeamId
      ? this.data.teamSeriesById.get(activeTeamId) ?? []
      : [];
    const teamSeriesBySeason = new Map(teamSeries.map((row) => [row.season, row]));
    const leagueSeries = this.data.league;
    const teamSeriesWithGaps = buildSeasonSeriesWithGaps(
      seasonDomain,
      teamSeriesBySeason
    );
    const activeRange = this.getDisplayedRange(state);

    const domainValues = [
      ...this.data.league.map((row) => row[metricKey]),
      ...teamSeries.map((row) => row[metricKey]),
    ];

    const xScale = createSeasonScale(seasonDomain, [
      margin.left,
      width - margin.right,
    ]);
    const yScale = createMetricScale(
      domainValues,
      [height - margin.bottom, margin.top],
      { isRate: metricMeta.isRate }
    );
    const allSegments = buildPointSegments(
      xScale,
      seasonDomain,
      margin.left,
      width - margin.right
    );
    const selectableSegments = buildPointSegments(
      xScale,
      seasonDomain,
      margin.left,
      width - margin.right
    );
    const tickStep = width >= 1160 ? 5 : width >= 920 ? 6 : 8;
    const timelineTicks = seasonDomain.filter(
      (_, index) =>
        index === 0 ||
        index === seasonDomain.length - 1 ||
        index % tickStep === 0
    );

    const line = d3
      .line()
      .defined((row) => row[metricKey] != null && !row.isGap)
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

    this.renderScopeMarkers({
      state,
      width,
      height,
      margin,
      innerHeight,
      xScale,
      allSegments,
    });

    this.renderRangeBand({
      activeRange,
      margin,
      innerHeight,
      allSegments,
    });

    this.axisX
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickValues(timelineTicks)
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
      .selectAll(".axis-title--timeline-y")
      .data([metricMeta.axisLabel ?? metricMeta.longLabel])
      .join("text")
      .attr("class", "axis-title axis-title--timeline-y")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + innerHeight / 2))
      .attr("y", -58)
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
      .data([leagueSeries])
      .join("path")
      .attr("class", "timeline-line")
      .transition()
      .duration(TRANSITION_MS)
      .attr("d", line);

    this.lineLayer
      .selectAll(".timeline-line--team")
      .data(teamSeries.length ? [teamSeriesWithGaps] : [])
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", "timeline-line timeline-line--team")
            .attr("opacity", 0),
        (update) => update,
        (exit) => exit.transition().duration(TRANSITION_MS / 2).attr("opacity", 0).remove()
      )
      .classed("is-selected", Boolean(state.selectedTeamId))
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
      .classed("is-selected", Boolean(state.selectedTeamId))
      .classed("is-preview", !state.selectedTeamId && Boolean(state.hoveredTeamId))
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
      height,
      margin,
      show: state.showAnnotations,
    });
    this.annotationLayer.raise();

    this.hitLayer
      .selectAll(".timeline-hit-area")
      .data(selectableSegments, (segment) => segment.value)
      .join("rect")
      .attr("class", "timeline-hit-area")
      .attr("x", (segment) => segment.x0)
      .attr("y", margin.top)
      .attr("width", (segment) => segment.width)
      .attr("height", innerHeight)
      .on("mouseenter", (event, segment) => {
        if (this.dragRange && event.buttons === 1) {
          this.updateRangeDrag(segment.value);
          return;
        }

        const leagueRow = this.data.leagueBySeason.get(segment.value);
        const teamRow = activeTeamId
          ? getTeamRowForSeason(this.data, activeTeamId, segment.value)
          : null;
        this.tooltip.show(
          buildTimelineTooltip({ leagueRow, teamRow, metricKey }),
          event
        );
      })
      .on("mousemove", (event, segment) => {
        if (this.dragRange && event.buttons === 1) {
          this.updateRangeDrag(segment.value);
          return;
        }

        this.tooltip.move(event);
      })
      .on("mouseleave", () => {
        if (!this.dragRange) {
          this.tooltip.hide();
        }
      })
      .on("mousedown", (event, segment) => {
        event.preventDefault();
        this.tooltip.hide();
        this.container.focus?.();
        this.startRangeDrag(segment.value);
      })
      .on("mouseup", (_, segment) => {
        if (this.dragRange) {
          this.commitRange(segment.value);
        }
      })
      .on("dblclick", (event) => {
        event.preventDefault();
        this.dragRange = null;
        this.store.setState({
          selectedRange: null,
          isPlaying: false,
        });
      });

    this.updateSummary({
      state,
      metricKey,
      selectedSeasonRow,
      currentTeamRow,
      activeTeamId,
      activeRange,
    });
    this.updateRangeNote(state, activeRange);
    this.updateAnnotationNote(state, selectedSeasonRow);
  }

  renderScopeMarkers({ width, height, margin, xScale }) {
    const scopeSeason = this.data.seasons[0];
    const scopeX = xScale(scopeSeason);
    const scopeLabel = "Reliable tracking begins";

    this.scopeLayer
      .selectAll(".timeline-scope-line")
      .data([scopeSeason])
      .join("line")
      .attr("class", "timeline-scope-line")
      .attr("x1", scopeX)
      .attr("x2", scopeX)
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom);

    this.scopeLayer
      .selectAll(".timeline-scope-label")
      .data([scopeSeason])
      .join("text")
      .attr("class", "timeline-scope-label")
      .attr("x", Math.min(scopeX + 8, width - margin.right - 160))
      .attr("y", margin.top + 12)
      .text(scopeLabel);
    this.gapLayer.selectAll("*").remove();
  }

  renderRangeBand({ activeRange, margin, innerHeight, allSegments }) {
    const rangeData = activeRange ? [this.getRangeBand(activeRange, allSegments)] : [];

    this.rangeLayer
      .selectAll(".timeline-range-band")
      .data(rangeData, () => "range")
      .join("rect")
      .attr("class", "timeline-range-band")
      .attr("rx", 12)
      .attr("x", (band) => band.x)
      .attr("y", margin.top)
      .attr("width", (band) => band.width)
      .attr("height", innerHeight);

    this.rangeLayer
      .selectAll(".timeline-range-outline")
      .data(rangeData, () => "outline")
      .join("rect")
      .attr("class", "timeline-range-outline")
      .attr("rx", 12)
      .attr("x", (band) => band.x)
      .attr("y", margin.top)
      .attr("width", (band) => band.width)
      .attr("height", innerHeight);
  }

  updateSummary({
    state,
    metricKey,
    selectedSeasonRow,
    currentTeamRow,
    activeTeamId,
    activeRange,
  }) {
    const firstSeasonRow = this.data.league[0];
    const narrativeMetric = METRICS[metricKey].shortNarrative;

    if (currentTeamRow && state.selectedTeamId) {
      const chip = state.selectedTeamId
        ? '<span class="state-chip state-chip--selected">Pinned team</span>'
        : '<span class="state-chip state-chip--preview">Preview</span>';
      this.summaryEl.innerHTML = `${chip}${currentTeamRow.team_name}: ${formatMetricValue(
        metricKey,
        currentTeamRow[metricKey]
      )} in ${seasonLabelForRow(currentTeamRow)}, ${formatMetricDelta(
        metricKey,
        currentTeamRow[metricKey],
        selectedSeasonRow[metricKey]
      )}${activeRange ? `, while the detail view emphasizes ${this.formatRange(activeRange)}.` : "."}`;
      return;
    }

    if (currentTeamRow && state.hoveredTeamId) {
      this.summaryEl.innerHTML = `<span class="state-chip state-chip--preview">Preview</span>${currentTeamRow.team_abbr} is overlaid on the league trend for ${selectedSeasonRow.season_label}.`;
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

  updateRangeNote(state, activeRange) {
    if (!activeRange) {
      this.rangeEl.innerHTML =
        "<strong>Era focus.</strong> The solid guide marks the selected season. Drag across the trend to emphasize an era in the team history view, and use arrow keys here to step through seasons.";
      return;
    }

    const prefix = this.dragRange ? "Dragging era focus" : "Era focus";
    const suffix = state.selectedRange
      ? ' <button type="button" class="text-button" data-clear-range>Clear era focus</button>'
      : "";
    this.rangeEl.innerHTML = `<strong>${prefix}: ${this.formatRange(
      activeRange
    )}</strong>The detail view now emphasizes this span without changing the scatterplot comparison frame.${suffix}`;
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

    this.noteEl.innerHTML = `<strong>${selectedSeasonRow.season_label}</strong>This season is not one of the highlighted milestones, so use it as a neutral comparison anchor while you inspect team-level spread below.`;
  }

  handleKeydown(event) {
    const { selectedSeason, selectedRange } = this.store.getState();
    const currentIndex = this.data.seasonIndex.get(selectedSeason);

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = clamp(currentIndex + delta, 0, this.data.seasons.length - 1);
      this.store.setState({
        selectedSeason: this.data.seasons[nextIndex],
        isPlaying: false,
      });
      return;
    }

    if (event.key === "Escape" && selectedRange) {
      event.preventDefault();
      this.store.setState({
        selectedRange: null,
      });
    }
  }

  handleRangeNoteClick(event) {
    if (!event.target.closest("[data-clear-range]")) {
      return;
    }

    this.store.setState({
      selectedRange: null,
    });
    this.container.focus?.();
  }

  handleGlobalMouseup() {
    if (!this.dragRange) {
      return;
    }

    this.commitRange(this.dragRange.end);
  }

  startRangeDrag(season) {
    this.dragRange = { start: season, end: season };
    this.store.setState({
      selectedSeason: season,
      isPlaying: false,
    });
  }

  updateRangeDrag(season) {
    if (!this.dragRange) {
      return;
    }

    this.dragRange.end = season;
    this.render(this.store.getState());
  }

  commitRange(endSeason) {
    if (!this.dragRange) {
      return;
    }

    const { start } = this.dragRange;
    this.dragRange.end = endSeason;
    const committedRange =
      start === endSeason ? null : normalizeSeasonRange(start, endSeason);

    this.dragRange = null;
    this.store.setState({
      selectedSeason: endSeason,
      selectedRange: committedRange,
      isPlaying: false,
    });
  }

  getDisplayedRange(state) {
    if (this.dragRange) {
      return normalizeSeasonRange(this.dragRange.start, this.dragRange.end);
    }

    return state.selectedRange;
  }

  getRangeBand(range, allSegments) {
    const startSegment = allSegments.find((segment) => segment.value === range.start);
    const endSegment = allSegments.find((segment) => segment.value === range.end);
    return {
      x: startSegment.x0,
      width: endSegment.x1 - startSegment.x0,
    };
  }

  formatRange(range) {
    const startLabel =
      this.data.leagueBySeason.get(range.start)?.season_label ??
      formatFallbackSeasonLabel(range.start);
    const endLabel =
      this.data.leagueBySeason.get(range.end)?.season_label ??
      formatFallbackSeasonLabel(range.end);
    return `${startLabel} to ${endLabel}`;
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
