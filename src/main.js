import { DEFAULT_METRIC } from "./constants.js";
import { loadData } from "./dataLoader.js";
import { createStore } from "./state.js";
import { createTooltip } from "./utils/tooltip.js";
import { initControls } from "./views/controls.js";
import { DetailView } from "./views/detailView.js";
import { ScatterView } from "./views/scatterView.js";
import { TimelineView } from "./views/timelineView.js";

async function init() {
  const tooltip = createTooltip(document.getElementById("tooltip"));
  const data = await loadData();

  const store = createStore({
    selectedSeason: data.latestSeason,
    selectedMetric: DEFAULT_METRIC,
    hoveredTeamId: null,
    selectedTeamId: null,
    isPlaying: false,
    showAnnotations: true,
  });

  initControls({
    store,
    data,
    elements: {
      playButton: document.getElementById("play-button"),
      seasonSlider: document.getElementById("season-slider"),
      seasonLabel: document.getElementById("season-label"),
      metricToggle: document.getElementById("metric-toggle"),
      teamSelect: document.getElementById("team-select"),
      annotationToggle: document.getElementById("annotation-toggle"),
      resetButton: document.getElementById("reset-button"),
    },
  });

  new TimelineView({
    container: document.getElementById("timeline-chart"),
    summaryEl: document.getElementById("timeline-summary"),
    noteEl: document.getElementById("annotation-note"),
    store,
    data,
    tooltip,
  });

  new ScatterView({
    container: document.getElementById("scatter-chart"),
    summaryEl: document.getElementById("scatter-summary"),
    store,
    data,
    tooltip,
  });

  new DetailView({
    container: document.getElementById("detail-chart"),
    summaryEl: document.getElementById("detail-summary"),
    store,
    data,
    tooltip,
  });
}

init().catch((error) => {
  console.error(error);
  document.getElementById("timeline-summary").textContent =
    "Data loading failed. Check the console for details.";
});
