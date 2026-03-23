export const DEFAULT_METRIC = "avg_three_point_rate";

export const METRICS = {
  avg_three_point_rate: {
    key: "avg_three_point_rate",
    label: "3PA share",
    axisLabel: "3PA share",
    longLabel: "Share of shot attempts from three",
    tooltipLabel: "3-point rate",
    shortNarrative: "shot mix from beyond the arc",
    isRate: true,
  },
  avg_fg3a: {
    key: "avg_fg3a",
    label: "3PA / game",
    axisLabel: "3PA per game",
    longLabel: "Three-point attempts per team game",
    tooltipLabel: "3PA per game",
    shortNarrative: "three-point volume",
    isRate: false,
  },
  avg_points: {
    key: "avg_points",
    label: "Points / game",
    axisLabel: "Points per game",
    longLabel: "Points per team game",
    tooltipLabel: "Points per game",
    shortNarrative: "scoring output",
    isRate: false,
  },
  avg_assists: {
    key: "avg_assists",
    label: "Assists / game",
    axisLabel: "Assists per game",
    longLabel: "Assists per team game",
    tooltipLabel: "Assists per game",
    shortNarrative: "ball movement",
    isRate: false,
  },
};

export const METRIC_ORDER = [
  "avg_three_point_rate",
  "avg_fg3a",
  "avg_points",
  "avg_assists",
];

export const SCATTER_METRICS = {
  x: "avg_three_point_rate",
  y: "avg_points",
  size: "win_pct",
};

export const CHART_HEIGHTS = {
  timeline: 304,
  scatter: 304,
  detail: 244,
};

export const TRANSITION_MS = 700;

export const PLAY_INTERVAL_MS = 1100;
