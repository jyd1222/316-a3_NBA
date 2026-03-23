const d3 = window.d3;

import { CHART_HEIGHTS, METRICS, TRANSITION_MS } from "../constants.js";
import { formatMetricValue, seasonLabelForRow } from "../utils/format.js";
import {
  buildPointSegments,
  buildSeasonSeriesWithGaps,
  formatFallbackSeasonLabel,
  getActiveTeamId,
  getTeamRowForSeason,
  isSeasonInRange,
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
    this.contextLayer = this.svg.append("g");
    this.gapLayer = this.svg.append("g");
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
    const margin = { top: 18, right: 28, bottom: 52, left: 64 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const seasonDomain = this.data.seasons;
    const tickStep = width >= 1100 ? 5 : width >= 860 ? 6 : 8;
    const detailTicks = buildDetailTicks(seasonDomain, tickStep);

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (!activeTeamId) {
      this.renderEmptyState({ width, height });
      this.summaryEl.textContent =
        "Hover a team to preview it, click to pin it, or drag an era on the timeline before drilling into one franchise.";
      return;
    }

    this.emptyLayer.selectAll("*").remove();

    const leagueSeries = this.data.league;
    const teamSeries = this.data.teamSeriesById.get(activeTeamId) ?? [];
    const teamSeriesBySeason = new Map(teamSeries.map((row) => [row.season, row]));
    const selectedTeamRow = teamSeries.at(-1);
    const currentSeasonTeamRow = getTeamRowForSeason(
      this.data,
      activeTeamId,
      state.selectedSeason
    );
    const leagueSeriesWithGaps = this.data.league;
    const teamSeriesWithGaps = buildSeasonSeriesWithGaps(
      seasonDomain,
      teamSeriesBySeason
    );
    const values = [
      ...leagueSeries.map((row) => row[metricKey]),
      ...teamSeries.map((row) => row[metricKey]),
    ];

    const xScale = createSeasonScale(seasonDomain, [
      margin.left,
      width - margin.right,
    ]);
    const yScale = createMetricScale(values, [height - margin.bottom, margin.top], {
      isRate: metricMeta.isRate,
    });
    const allSegments = buildPointSegments(
      xScale,
      seasonDomain,
      margin.left,
      width - margin.right
    );

    const line = d3
      .line()
      .defined((row) => row[metricKey] != null && !row.isGap)
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

    this.renderRangeContext({
      state,
      margin,
      innerHeight,
      allSegments,
    });

    this.renderMissingSeasonMarkers({
      height,
      margin,
      innerHeight,
      allSegments,
    });

    this.axisX
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickValues(detailTicks)
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
      .data([metricMeta.axisLabel ?? metricMeta.longLabel])
      .join("text")
      .attr("class", "axis-title")
      .attr("transform", "rotate(-90)")
      .attr("x", -(height / 2))
      .attr("y", -54)
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
      .data([leagueSeriesWithGaps])
      .join("path")
      .attr("class", "detail-line detail-line--league")
      .transition()
      .duration(TRANSITION_MS)
      .attr("d", line);

    this.lineLayer
      .selectAll(".detail-line--team")
      .data([teamSeriesWithGaps])
      .join("path")
      .attr("class", "detail-line detail-line--team")
      .classed("is-selected", Boolean(state.selectedTeamId))
      .classed("is-preview", !state.selectedTeamId && Boolean(state.hoveredTeamId))
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

    const teamLabelText = state.selectedTeamId
      ? `Pinned: ${selectedTeamRow.team_abbr}`
      : `Preview: ${selectedTeamRow.team_abbr}`;
    const endLabels = [
      {
        key: "league-label",
        text: "League average",
        row: leagueSeries.at(-1),
        className: "detail-end-label",
      },
      {
        key: "team-label",
        text: teamLabelText,
        row: teamSeries.at(-1),
        className: `detail-end-label ${
          state.selectedTeamId
            ? "detail-end-label--selected"
            : "detail-end-label--preview"
        }`,
      },
    ];

    const labelPositions = endLabels.map((entry, index) =>
      buildDetailLabelPosition({
        entry,
        index,
        xScale,
        yScale,
        metricKey,
        width,
        margin,
      })
    );

    this.labelLayer
      .selectAll(".detail-end-label")
      .data(labelPositions, (entry) => entry.key)
      .join("text")
      .attr("class", (entry) => entry.className)
      .transition()
      .duration(TRANSITION_MS)
      .attr("x", (entry) => entry.labelX)
      .attr("y", (entry) => entry.labelY)
      .attr("text-anchor", (entry) => entry.textAnchor)
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

  renderRangeContext({ state, margin, innerHeight, allSegments }) {
    const rangeData = state.selectedRange ? [this.getRangeBand(state.selectedRange, allSegments)] : [];
    const contextShades = state.selectedRange
      ? this.getOutsideShades(state.selectedRange, allSegments)
      : [];

    this.contextLayer
      .selectAll(".detail-context-shade")
      .data(contextShades, (_, index) => `shade-${index}`)
      .join("rect")
      .attr("class", "detail-context-shade")
      .attr("x", (shade) => shade.x)
      .attr("y", margin.top)
      .attr("width", (shade) => shade.width)
      .attr("height", innerHeight);

    this.contextLayer
      .selectAll(".detail-range-band")
      .data(rangeData, () => "range")
      .join("rect")
      .attr("class", "detail-range-band")
      .attr("rx", 12)
      .attr("x", (band) => band.x)
      .attr("y", margin.top)
      .attr("width", (band) => band.width)
      .attr("height", innerHeight);
  }

  renderMissingSeasonMarkers() {
    this.gapLayer.selectAll("*").remove();
  }

  renderEmptyState({ width, height }) {
    this.gridLayer.selectAll("*").remove();
    this.contextLayer.selectAll("*").remove();
    this.gapLayer.selectAll("*").remove();
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
        "<tspan x='50%' dy='0'>Select a team to compare it with the league.</tspan><tspan x='50%' dy='1.6em'>Hover previews, click pins, and era focus keeps the detail chart compact.</tspan>"
      );
  }

  updateSummary({ state, metricKey, teamSeries, currentSeasonTeamRow, selectedTeamRow }) {
    if (!state.selectedTeamId && state.hoveredTeamId && selectedTeamRow) {
      const previewLead = currentSeasonTeamRow
        ? `${selectedTeamRow.team_abbr} is previewed at ${formatMetricValue(
            metricKey,
            currentSeasonTeamRow[metricKey]
          )} in ${seasonLabelForRow(currentSeasonTeamRow)}.`
        : `${selectedTeamRow.team_abbr} is previewed against the league history view.`;
      this.summaryEl.innerHTML = `<span class="state-chip state-chip--preview">Preview</span>${previewLead}`;
      return;
    }

    const relevantSeries = state.selectedRange
      ? teamSeries.filter((row) => isSeasonInRange(row.season, state.selectedRange))
      : teamSeries;
    const chip = state.selectedTeamId
      ? '<span class="state-chip state-chip--selected">Pinned team</span>'
      : '<span class="state-chip state-chip--preview">Preview</span>';
    const rangeLead = state.selectedRange
      ? `Within ${this.formatRange(state.selectedRange)}, `
      : "";

    if (relevantSeries.length === 0) {
      this.summaryEl.innerHTML = `${chip}${selectedTeamRow.team_name} has no seasons inside the focused era, so the chart shows its nearest available history against the league baseline instead.`;
      return;
    }

    const seasonsAboveLeague = relevantSeries.filter((row) => {
      const leagueRow = this.data.leagueBySeason.get(row.season);
      return row[metricKey] > leagueRow[metricKey];
    }).length;

    if (currentSeasonTeamRow) {
      const trailingLine = state.selectedRange
        ? `The current season marker stays on ${seasonLabelForRow(
            currentSeasonTeamRow
          )} at ${formatMetricValue(metricKey, currentSeasonTeamRow[metricKey])}.`
        : `In ${seasonLabelForRow(currentSeasonTeamRow)}, it sat at ${formatMetricValue(
            metricKey,
            currentSeasonTeamRow[metricKey]
          )}.`;

      this.summaryEl.innerHTML = `${chip}${selectedTeamRow.team_name}: ${rangeLead}${seasonsAboveLeague} of ${
        relevantSeries.length
      } available seasons sat above league average for ${
        METRICS[metricKey].shortNarrative
      }. ${trailingLine}`;
      return;
    }

    this.summaryEl.innerHTML = `${chip}${selectedTeamRow.team_name} has no row in ${
      this.data.leagueBySeason.get(state.selectedSeason)?.season_label ??
      formatFallbackSeasonLabel(state.selectedSeason)
    } because the franchise had not entered the league yet or was absent from that season's source data. Its longer trend still appears against league context.`;
  }

  getRangeBand(range, allSegments) {
    const startSegment = allSegments.find((segment) => segment.value === range.start);
    const endSegment = allSegments.find((segment) => segment.value === range.end);
    return {
      x: startSegment.x0,
      width: endSegment.x1 - startSegment.x0,
    };
  }

  getOutsideShades(range, allSegments) {
    const startSegment = allSegments.find((segment) => segment.value === range.start);
    const endSegment = allSegments.find((segment) => segment.value === range.end);
    const firstSegment = allSegments[0];
    const lastSegment = allSegments.at(-1);
    const shades = [];

    if (startSegment.x0 > firstSegment.x0) {
      shades.push({
        x: firstSegment.x0,
        width: startSegment.x0 - firstSegment.x0,
      });
    }

    if (endSegment.x1 < lastSegment.x1) {
      shades.push({
        x: endSegment.x1,
        width: lastSegment.x1 - endSegment.x1,
      });
    }

    return shades;
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

function buildDetailTicks(seasonDomain, tickStep) {
  const ticks = seasonDomain.filter(
    (_, index) =>
      index === 0 ||
      index === seasonDomain.length - 1 ||
      index % tickStep === 0
  );

  while (ticks.length >= 2) {
    const lastSeason = ticks.at(-1);
    const previousSeason = ticks.at(-2);
    const lastIndex = seasonDomain.indexOf(lastSeason);
    const previousIndex = seasonDomain.indexOf(previousSeason);

    if (lastIndex - previousIndex >= 3) {
      break;
    }

    ticks.splice(-2, 1);
  }

  return ticks;
}

function buildDetailLabelPosition({
  entry,
  index,
  xScale,
  yScale,
  metricKey,
  width,
  margin,
}) {
  const pointX = xScale(entry.row.season);
  const pointY = yScale(entry.row[metricKey]);
  const estimatedWidth = entry.text.length * 5.8;
  const rightLimit = width - margin.right - 6;
  const hasRoomOnRight = pointX + 12 + estimatedWidth <= rightLimit;

  return {
    ...entry,
    labelX: hasRoomOnRight ? pointX + 8 : pointX - 8,
    labelY: pointY + (index === 0 ? -8 : 12),
    textAnchor: hasRoomOnRight ? "start" : "end",
  };
}
