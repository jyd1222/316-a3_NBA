const d3 = window.d3;

import { paddedExtent } from "./helpers.js";

export function createSeasonScale(seasons, range) {
  return d3.scalePoint().domain(seasons).range(range).padding(0.45);
}

export function createMetricScale(values, range, { isRate = false } = {}) {
  const minPadding = isRate ? 0.01 : 1;
  const [min, max] = paddedExtent(values, 0.1, minPadding);
  return d3
    .scaleLinear()
    .domain([Math.max(0, min), max])
    .range(range)
    .nice(5);
}

export function createRadiusScale(values, range) {
  const extent = d3.extent(values);
  return d3.scaleSqrt().domain(extent).range(range);
}
