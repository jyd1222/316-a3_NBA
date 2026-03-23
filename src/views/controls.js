import {
  DEFAULT_METRIC,
  METRIC_ORDER,
  METRICS,
  PLAY_INTERVAL_MS,
} from "../constants.js";
import { clamp } from "../utils/helpers.js";

export function initControls({ store, data, elements }) {
  const {
    playButton,
    seasonSlider,
    seasonLabel,
    metricToggle,
    teamSelect,
    annotationToggle,
    resetButton,
  } = elements;

  seasonSlider.min = 0;
  seasonSlider.max = data.seasons.length - 1;
  seasonSlider.step = 1;

  metricToggle.innerHTML = METRIC_ORDER.map(
    (metricKey) =>
      `<button type="button" data-metric="${metricKey}">${METRICS[metricKey].label}</button>`
  ).join("");

  teamSelect.innerHTML = [
    `<option value="">None selected</option>`,
    ...data.teamLookup.map(
      (team) =>
        `<option value="${team.team_id}">${team.team_name} (${team.team_abbr})</option>`
    ),
  ].join("");

  let intervalId = null;

  function syncPlayback(state) {
    if (state.isPlaying && intervalId == null) {
      intervalId = window.setInterval(() => {
        const currentState = store.getState();
        const currentIndex = data.seasonIndex.get(currentState.selectedSeason);
        if (currentIndex >= data.seasons.length - 1) {
          store.setState({ isPlaying: false });
          return;
        }

        store.setState({
          selectedSeason: data.seasons[currentIndex + 1],
        });
      }, PLAY_INTERVAL_MS);
    }

    if (!state.isPlaying && intervalId != null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  }

  playButton.addEventListener("click", () => {
    const { isPlaying, selectedSeason } = store.getState();
    if (!isPlaying && selectedSeason === data.latestSeason) {
      store.setState({
        selectedSeason: data.seasons[0],
        isPlaying: true,
      });
      return;
    }

    store.setState({ isPlaying: !isPlaying });
  });

  seasonSlider.addEventListener("input", (event) => {
    const nextIndex = clamp(+event.target.value, 0, data.seasons.length - 1);
    store.setState({
      selectedSeason: data.seasons[nextIndex],
      isPlaying: false,
    });
  });

  metricToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-metric]");
    if (!button) {
      return;
    }

    store.setState({
      selectedMetric: button.dataset.metric,
      isPlaying: false,
    });
  });

  teamSelect.addEventListener("change", (event) => {
    const selectedValue = event.target.value;
    store.setState({
      selectedTeamId: selectedValue ? +selectedValue : null,
      hoveredTeamId: null,
      isPlaying: false,
    });
  });

  annotationToggle.addEventListener("change", (event) => {
    store.setState({
      showAnnotations: event.target.checked,
    });
  });

  resetButton.addEventListener("click", () => {
    store.setState({
      selectedSeason: data.latestSeason,
      selectedMetric: DEFAULT_METRIC,
      selectedTeamId: null,
      hoveredTeamId: null,
      showAnnotations: true,
      isPlaying: false,
    });
  });

  const unsubscribe = store.subscribe((state) => {
    syncPlayback(state);

    const seasonIndex = data.seasonIndex.get(state.selectedSeason);
    seasonSlider.value = seasonIndex;
    seasonLabel.textContent =
      data.leagueBySeason.get(state.selectedSeason)?.season_label ?? "Unknown";

    playButton.textContent = state.isPlaying ? "Pause" : "Play";
    annotationToggle.checked = state.showAnnotations;
    teamSelect.value = state.selectedTeamId ? String(state.selectedTeamId) : "";

    metricToggle
      .querySelectorAll("[data-metric]")
      .forEach((button) =>
        button.classList.toggle(
          "is-active",
          button.dataset.metric === state.selectedMetric
        )
      );
  });

  return {
    destroy() {
      unsubscribe();
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }
    },
  };
}
