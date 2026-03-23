const d3 = window.d3;

import { METRICS } from "../constants.js";

const percentOne = d3.format(".1%");
const percentZero = d3.format(".0%");
const numberOne = d3.format(".1f");
const signedNumberOne = d3.format("+.1f");

export function formatMetricValue(metricKey, value) {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  if (METRICS[metricKey].isRate) {
    return percentOne(value);
  }

  return numberOne(value);
}

export function formatMetricDelta(metricKey, teamValue, leagueValue) {
  if (
    teamValue == null ||
    leagueValue == null ||
    Number.isNaN(teamValue) ||
    Number.isNaN(leagueValue)
  ) {
    return "N/A";
  }

  const delta = teamValue - leagueValue;
  if (METRICS[metricKey].isRate) {
    return `${signedNumberOne(delta * 100)} percentage points vs league`;
  }

  return `${signedNumberOne(delta)} vs league`;
}

export function formatWinPct(value) {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  return percentZero(value);
}

export function formatRecord(wins, losses) {
  return `${wins}-${losses}`;
}

export function seasonLabelForRow(row) {
  return row?.season_label ?? "Unknown season";
}
