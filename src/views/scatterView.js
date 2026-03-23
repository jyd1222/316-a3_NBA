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
import { createRadiusScale } from "../utils/scales.js";

export class ScatterView {
  constructor({ container, summaryEl, store, data, tooltip }) {
    this.container = container;
    this.summaryEl = summaryEl;
    this.store = store;
    this.data = data;
    this.tooltip = tooltip;

    this.fixedXDomain = buildFixedDomain(
      this.data.teams.map((row) => row[SCATTER_METRICS.x]),
      { floor: 0, step: 0.05, padding: 0.01 }
    );
    this.fixedYDomain = buildFixedDomain(
      this.data.teams.map((row) => row[SCATTER_METRICS.y]),
      { floor: 80, step: 5, padding: 2 }
    );
    this.radiusValues = this.data.teams.map((row) => row[SCATTER_METRICS.size]);

    this.svg = d3.select(container).append("svg");
    this.gridLayer = this.svg.append("g").attr("class", "grid");
    this.axisX = this.svg.append("g").attr("class", "axis");
    this.axisY = this.svg.append("g").attr("class", "axis");
    this.avgLayer = this.svg.append("g");
    this.pointLayer = this.svg.append("g");
    this.annotationLayer = this.svg.append("g");
    this.labelLayer = this.svg.append("g");
    this.legendLayer = this.svg.append("g");

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
    const margin = { top: 18, right: 22, bottom: 58, left: 64 };
    const innerWidth = width - margin.left - margin.right;
    const labelRows = seasonRows.filter(
      (row) => row.team_id === state.selectedTeamId || row.team_id === state.hoveredTeamId
    );
    const labeledTeamIds = new Set(labelRows.map((row) => row.team_id));
    const pointRows = seasonRows
      .slice()
      .sort((a, b) =>
        d3.ascending(
          getPointPriority(a, state, labeledTeamIds),
          getPointPriority(b, state, labeledTeamIds)
        )
      );
    const xScale = d3
      .scaleLinear()
      .domain(this.fixedXDomain)
      .range([margin.left, width - margin.right]);
    const yScale = d3
      .scaleLinear()
      .domain(this.fixedYDomain)
      .range([height - margin.bottom, margin.top]);
    const radiusScale = createRadiusScale(this.radiusValues, [4.25, 9.25]);
    const anchorRows = buildScatterAnchors(seasonRows);

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
      .attr("x", margin.left + innerWidth / 2)
      .attr("y", 48)
      .attr("text-anchor", "middle")
      .text((value) => value);

    this.axisY
      .selectAll(".axis-title")
      .data(["Points per game"])
      .join("text")
      .attr("class", "axis-title")
      .attr("transform", "rotate(-90)")
      .attr("x", -(height / 2))
      .attr("y", -52)
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
        label: "League avg shot mix",
      },
      {
        key: "y",
        x1: margin.left,
        x2: width - margin.right,
        y1: yScale(leagueRow.avg_points),
        y2: yScale(leagueRow.avg_points),
        labelX: width - margin.right - 4,
        labelY: yScale(leagueRow.avg_points) - 8,
        label: "League avg scoring",
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
      .data([], (line) => `${line.key}-label`)
      .join("text")
      .remove();

    this.pointLayer
      .selectAll(".scatter-point")
      .data(pointRows, (row) => row.team_id)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", (row) => `scatter-point ${conferencePointClass(row)}`)
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
      .attr("class", (row) => `scatter-point ${conferencePointClass(row)}`)
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

    this.renderAnchorAnnotations({
      anchorRows,
      xScale,
      yScale,
      radiusScale,
      width,
      height,
      margin,
    });

    this.labelLayer
      .selectAll(".scatter-label")
      .data(labelRows, (row) => row.team_id)
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("opacity", 0),
        (update) => update,
        (exit) => exit.transition().duration(TRANSITION_MS / 2).attr("opacity", 0).remove()
      )
      .attr("class", (row) =>
        `scatter-label ${
          row.team_id === state.selectedTeamId
            ? "scatter-label--selected"
            : row.team_id === state.hoveredTeamId
              ? "scatter-label--preview"
              : "scatter-label--outlier"
        }`
      )
      .transition()
      .duration(TRANSITION_MS)
      .attr("opacity", 1)
      .attr("x", (row) => xScale(row.avg_three_point_rate) + radiusScale(row.win_pct) + 6)
      .attr("y", (row) => yScale(row.avg_points) - radiusScale(row.win_pct) - 6)
      .text((row) => row.team_abbr);

    this.renderSizeLegend({ width, height, margin });
    this.updateSummary({
      state,
      seasonRows,
      leagueRow,
      activeSeasonRow,
      anchorRows,
    });
  }

  renderSizeLegend({ width, height, margin }) {
    const legendX = width - margin.right - 8;
    const legendY = height - margin.bottom - 18;

    this.legendLayer.attr("class", "scatter-size-legend").attr(
      "transform",
      `translate(${legendX}, ${legendY})`
    );
    this.legendLayer
      .selectAll(
        ".scatter-size-legend__circle, .scatter-size-legend__guide, .scatter-size-legend__label, .scatter-size-legend__title, .scatter-size-legend__key-title, .scatter-size-legend__swatch"
      )
      .remove();

    this.legendLayer
      .selectAll(".scatter-size-legend__line--size")
      .data(["Size: larger points = higher win%"])
      .join("text")
      .attr("class", "scatter-size-legend__line scatter-size-legend__line--size")
      .attr("x", 0)
      .attr("y", 0)
      .attr("text-anchor", "end")
      .text((value) => value);

    this.legendLayer
      .selectAll(".scatter-size-legend__line--conference")
      .data([null])
      .join("text")
      .attr(
        "class",
        "scatter-size-legend__line scatter-size-legend__line--conference"
      )
      .attr("x", 0)
      .attr("y", 14)
      .attr("text-anchor", "end")
      .each(function renderConferenceLegend() {
        const text = d3.select(this);
        text.selectAll("*").remove();
        text.append("tspan").text("Color: ");
        text
          .append("tspan")
          .attr("class", "scatter-size-legend__word scatter-size-legend__word--east")
          .text("East");
        text.append("tspan").text(" / ");
        text
          .append("tspan")
          .attr("class", "scatter-size-legend__word scatter-size-legend__word--west")
          .text("West");
      });
  }

  renderAnchorAnnotations({
    anchorRows,
    xScale,
    yScale,
    radiusScale,
    width,
    height,
    margin,
  }) {
    const annotationData = anchorRows.map((entry) => {
      const x = xScale(entry.row.avg_three_point_rate);
      const y = yScale(entry.row.avg_points);
      const dx = entry.key === "top-right" ? -22 : -22;
      const dy = entry.key === "top-right" ? -18 : 18;
      const labelX = Math.max(margin.left + 56, Math.min(width - margin.right - 10, x + dx));
      const labelY = Math.max(
        margin.top + 16,
        Math.min(height - margin.bottom - 14, y + dy)
      );

      return {
        ...entry,
        x,
        y,
        r: radiusScale(entry.row.win_pct),
        lineX2: labelX - 8,
        lineY2: entry.key === "top-right" ? labelY + 6 : labelY - 6,
        labelX,
        labelY,
      };
    });

    this.annotationLayer
      .selectAll(".scatter-anchor-ring")
      .data(annotationData, (entry) => entry.key)
      .join("circle")
      .attr("class", "scatter-anchor-ring")
      .attr("cx", (entry) => entry.x)
      .attr("cy", (entry) => entry.y)
      .attr("r", (entry) => entry.r + 2.4);

    const labels = this.annotationLayer
      .selectAll(".scatter-anchor")
      .data(annotationData, (entry) => entry.key)
      .join("g")
      .attr("class", "scatter-anchor");

    labels
      .selectAll(".scatter-anchor__line")
      .data((entry) => [entry])
      .join("line")
      .attr("class", "scatter-anchor__line")
      .attr("x1", (entry) => entry.x)
      .attr("y1", (entry) => entry.y)
      .attr("x2", (entry) => entry.lineX2)
      .attr("y2", (entry) => entry.lineY2);

    labels
      .selectAll(".scatter-anchor__label")
      .data((entry) => [entry])
      .join("text")
      .attr("class", "scatter-anchor__label")
      .attr("x", (entry) => entry.labelX)
      .attr("y", (entry) => entry.labelY)
      .attr("text-anchor", "end")
      .text((entry) =>
        entry.key === "top-right"
          ? `Top-right: ${entry.row.team_abbr}`
          : `Bottom-left: ${entry.row.team_abbr}`
      );
  }

  updateSummary({ state, seasonRows, leagueRow, activeSeasonRow, anchorRows }) {
    if (activeSeasonRow && state.selectedTeamId) {
      const chip = state.selectedTeamId
        ? '<span class="state-chip state-chip--selected">Pinned team</span>'
        : '<span class="state-chip state-chip--preview">Preview</span>';
      this.summaryEl.innerHTML = `${chip}${activeSeasonRow.team_name} scored ${formatMetricValue(
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

    if (activeSeasonRow && state.hoveredTeamId) {
      this.summaryEl.innerHTML = `<span class="state-chip state-chip--preview">Preview</span>${activeSeasonRow.team_abbr} is highlighted across the views for ${leagueRow.season_label}.`;
      return;
    }

    if (state.selectedTeamId && !activeSeasonRow) {
      const teamMeta = this.data.teamLookup.find(
        (team) => team.team_id === state.selectedTeamId
      );
      this.summaryEl.innerHTML = `<span class="state-chip state-chip--selected">Pinned team</span>${
        teamMeta?.team_name ?? "The selected team"
      } is not present in ${leagueRow.season_label}, so the scatterplot falls back to league-wide outliers for that season.`;
      return;
    }

    const topRight = anchorRows.find((entry) => entry.key === "top-right")?.row;
    const bottomLeft = anchorRows.find((entry) => entry.key === "bottom-left")?.row;

    this.summaryEl.textContent = `In ${leagueRow.season_label}, ${
      topRight?.team_name ?? "the upper-right team"
    } sat closest to the upper-right corner at ${formatMetricValue(
      "avg_three_point_rate",
      topRight?.avg_three_point_rate ?? leagueRow.avg_three_point_rate
    )} and ${formatMetricValue(
      "avg_points",
      topRight?.avg_points ?? leagueRow.avg_points
    )}, while ${bottomLeft?.team_name ?? "the lower-left team"} anchored the opposite corner.`;
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

function conferencePointClass(row) {
  return row.conference === "East"
    ? "scatter-point--east"
    : row.conference === "West"
      ? "scatter-point--west"
      : "scatter-point--neutral";
}

function getPointPriority(row, state, labeledTeamIds) {
  if (row.team_id === state.selectedTeamId) {
    return 4;
  }

  if (row.team_id === state.hoveredTeamId) {
    return 3;
  }

  if (labeledTeamIds.has(row.team_id)) {
    return 2;
  }

  return 1;
}

function buildScatterAnchors(seasonRows) {
  if (!seasonRows.length) {
    return [];
  }

  const xExtent = d3.extent(seasonRows, (row) => row.avg_three_point_rate);
  const yExtent = d3.extent(seasonRows, (row) => row.avg_points);
  const scoredRows = seasonRows.map((row) => {
    const xNorm = normalizeValue(row.avg_three_point_rate, xExtent);
    const yNorm = normalizeValue(row.avg_points, yExtent);
    return {
      row,
      bottomLeftScore: xNorm + yNorm,
      topRightScore: xNorm + yNorm,
    };
  });

  const bottomLeft = scoredRows.reduce((best, current) =>
    current.bottomLeftScore < best.bottomLeftScore ? current : best
  );
  const topRight = scoredRows.reduce((best, current) =>
    current.topRightScore > best.topRightScore ? current : best
  );

  const anchors = [
    { key: "bottom-left", row: bottomLeft.row },
    { key: "top-right", row: topRight.row },
  ];

  return anchors.filter(
    (entry, index, list) =>
      list.findIndex((candidate) => candidate.row.team_id === entry.row.team_id) === index
  );
}

function normalizeValue(value, extent) {
  const [min, max] = extent;
  if (max === min) {
    return 0.5;
  }

  return (value - min) / (max - min);
}

function buildFixedDomain(values, { floor = 0, step = 1, padding = 0 } = {}) {
  const [min, max] = d3.extent(values);
  const domainMin = Math.max(floor, Math.floor((min - padding) / step) * step);
  const domainMax = Math.ceil((max + padding) / step) * step;
  return [domainMin, domainMax];
}
