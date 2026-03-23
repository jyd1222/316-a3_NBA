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
  show,
}) {
  const labelMode = width >= 960;
  const visibleAnnotations = show ? annotations : [];

  const join = layer
    .selectAll(".timeline-annotation")
    .data(visibleAnnotations, (annotation) => annotation.season);

  const enter = join
    .enter()
    .append("g")
    .attr("class", "timeline-annotation")
    .style("opacity", 0);

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
    const leagueRow = leagueBySeason.get(annotation.season);
    const x = xScale(annotation.season);
    const y = yScale(leagueRow[metricKey]);
    const direction = annotation.placement === "bottom" ? 1 : -1;
    const stemLength = labelMode ? 42 : 22;
    const labelText = labelMode ? annotation.title : "";

    group.attr("transform", `translate(${x}, ${y})`);

    group
      .select(".timeline-annotation__stem")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 0)
      .attr("y2", direction * stemLength);

    const text = group
      .select(".timeline-annotation__label")
      .attr("display", labelMode ? null : "none")
      .attr("y", direction * (stemLength + (direction < 0 ? -12 : 18)))
      .text(labelText);

    const rect = group.select(".timeline-annotation__pill");
    if (!labelMode) {
      rect.attr("display", "none");
      return;
    }

    const bbox = text.node().getBBox();
    rect
      .attr("display", null)
      .attr("x", bbox.x - 10)
      .attr("y", bbox.y - 5)
      .attr("width", bbox.width + 20)
      .attr("height", bbox.height + 10);
  });

  merged
    .transition()
    .duration(TRANSITION_MS)
    .style("opacity", show ? 1 : 0);

  join
    .exit()
    .transition()
    .duration(TRANSITION_MS / 2)
    .style("opacity", 0)
    .remove();
}
