const d3 = window.d3;

import { TRANSITION_MS } from "../constants.js";

export function renderTimelineAnnotations({
  layer,
  annotations,
  xScale,
  yScale,
  leagueBySeason,
  metricKey,
  width,
  height,
  margin,
  show,
}) {
  const positionedAnnotations = buildAnnotationLayout({
    annotations,
    xScale,
    yScale,
    leagueBySeason,
    metricKey,
    width,
    height,
    margin,
    show,
  });

  const join = layer
    .selectAll(".timeline-annotation")
    .data(positionedAnnotations, (annotation) => annotation.season);

  const enter = join
    .enter()
    .append("g")
    .attr("class", "timeline-annotation")
    .style("opacity", show ? 1 : 0);

  enter.append("line").attr("class", "timeline-annotation__stem");
  enter.append("circle").attr("class", "timeline-annotation__dot").attr("r", 4.5);
  enter.append("rect").attr("class", "timeline-annotation__pill").attr("rx", 10);
  enter
    .append("text")
    .attr("class", "timeline-annotation__label")
    .attr("text-anchor", "middle");

  const merged = enter.merge(join);

  merged.each(function updateAnnotation(annotation) {
    const group = d3.select(this);
    const labelVisible = Boolean(annotation.labelText);

    group
      .select(".timeline-annotation__stem")
      .attr("x1", annotation.x)
      .attr("x2", annotation.x)
      .attr("y1", annotation.y)
      .attr("y2", annotation.stemEndY);

    group
      .select(".timeline-annotation__dot")
      .attr("cx", annotation.x)
      .attr("cy", annotation.y);

    const text = group
      .select(".timeline-annotation__label")
      .attr("display", labelVisible ? null : "none")
      .attr("x", annotation.labelX)
      .attr("y", annotation.labelY)
      .attr("text-anchor", annotation.textAnchor)
      .text(annotation.labelText ?? "");

    const rect = group.select(".timeline-annotation__pill");
    rect.attr("display", "none");
  });

  merged.style("opacity", show ? 1 : 0);

  join
    .exit()
    .transition()
    .duration(TRANSITION_MS / 2)
    .style("opacity", 0)
    .remove();
}

function buildAnnotationLayout({
  annotations,
  xScale,
  yScale,
  leagueBySeason,
  metricKey,
  width,
  height,
  margin,
  show,
}) {
  if (!show) {
    return [];
  }

  const topOffsets = [-42, -68, -92];
  const bottomOffsets = [28, 48];
  const topBound = margin.top + 18;
  const bottomBound = height - margin.bottom - 22;

  const rawAvailable = annotations
    .map((annotation) => {
      const leagueRow = leagueBySeason.get(annotation.season);
      if (!leagueRow) {
        return null;
      }

      return {
        ...annotation,
        x: xScale(annotation.season),
        y: yScale(leagueRow[metricKey]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => d3.ascending(a.season, b.season));
  const available = rawAvailable.filter((annotation) => annotation.season !== 1985);

  let topCount = 0;
  let bottomCount = 0;

  return available.map((annotation) => {
    const isBottom = annotation.placement === "bottom";
    const offset = isBottom
      ? bottomOffsets[bottomCount++ % bottomOffsets.length]
      : topOffsets[topCount++ % topOffsets.length];

    return buildPositionedAnnotation({
      annotation,
      labelText: annotation.title,
      offset,
      topBound,
      bottomBound,
      width,
      margin,
    });
  });
}

function buildPositionedAnnotation({
  annotation,
  labelText,
  offset,
  topBound,
  bottomBound,
  width,
  margin,
}) {
  const labelY = clamp(annotation.y + offset, topBound, bottomBound);
  const stemEndY = labelText
    ? labelY + (labelY < annotation.y ? 12 : -12)
    : labelY;
  const edgePadding = 16;
  const isNearLeft = annotation.x < margin.left + 110;
  const isNearRight = annotation.x > width - margin.right - 110;
  const textAnchor = isNearLeft ? "start" : isNearRight ? "end" : "middle";
  const labelX = isNearLeft
    ? annotation.x + edgePadding
    : isNearRight
      ? annotation.x - edgePadding
      : annotation.x;

  return {
    ...annotation,
    labelText,
    labelX,
    labelY,
    stemEndY,
    textAnchor,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
