const d3 = window.d3;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function paddedExtent(values, paddingRatio = 0.08, minPadding = 0) {
  const [min, max] = d3.extent(values);
  const span = max - min || 1;
  const padding = Math.max(span * paddingRatio, minPadding);
  return [min - padding, max + padding];
}

export function buildPointSegments(scale, domain, rangeStart, rangeEnd) {
  const positions = domain.map((value) => scale(value));
  return domain.map((value, index) => {
    const x = positions[index];
    const x0 = index === 0 ? rangeStart : (positions[index - 1] + x) / 2;
    const x1 =
      index === positions.length - 1 ? rangeEnd : (x + positions[index + 1]) / 2;
    return {
      value,
      x,
      x0,
      x1,
      width: x1 - x0,
    };
  });
}

export function observeResize(element, callback) {
  const observer = new ResizeObserver(() => callback());
  observer.observe(element);
  return observer;
}

export function getActiveTeamId(state) {
  return state.selectedTeamId ?? state.hoveredTeamId ?? null;
}

export function getTeamRowForSeason(data, teamId, season) {
  const rows = data.teamsBySeason.get(season) ?? [];
  return rows.find((row) => row.team_id === teamId) ?? null;
}

export function normalizeSeasonRange(start, end) {
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

export function isSeasonInRange(season, range) {
  if (!range) {
    return true;
  }

  return season >= range.start && season <= range.end;
}

export function buildSeasonSeriesWithGaps(allSeasons, rowBySeason) {
  return allSeasons.map((season) => rowBySeason.get(season) ?? { season, isGap: true });
}

export function formatFallbackSeasonLabel(season) {
  return `${season}-${String((season + 1) % 100).padStart(2, "0")}`;
}
