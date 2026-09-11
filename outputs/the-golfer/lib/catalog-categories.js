import { KINDS } from './listings.js';

/** UI board categories mapped to underlying listing kinds. */
export const BOARD_CATEGORIES = {
  all: {
    label: 'All Golf',
    kinds: [...KINDS]
  },
  course: {
    label: 'Courses',
    kinds: ['course']
  },
  tournament: {
    label: 'Tournaments',
    kinds: ['tournament', 'charity', 'corporate']
  },
  simulator: {
    label: 'Simulators',
    kinds: ['simulator']
  },
  training: {
    label: 'Lessons',
    kinds: ['training']
  }
};

export const BOARD_CATEGORY_KEYS = Object.keys(BOARD_CATEGORIES);

export function boardCategoryLabel(key) {
  return BOARD_CATEGORIES[key]?.label || key;
}

export function kindsForBoardCategory(key) {
  if (!key || key === 'all') return [...KINDS];
  return BOARD_CATEGORIES[key]?.kinds || [];
}

export function boardCategoryForKind(kind) {
  for (const [key, value] of Object.entries(BOARD_CATEGORIES)) {
    if (key === 'all') continue;
    if (value.kinds.includes(kind)) return key;
  }
  return 'all';
}

export function kindMatchesBoardCategory(kind, categoryKey) {
  if (!categoryKey || categoryKey === 'all') return true;
  return kindsForBoardCategory(categoryKey).includes(kind);
}

export function filterListingsByBoardCategory(listings, categoryKey) {
  if (!categoryKey || categoryKey === 'all') return listings;
  const allowed = new Set(kindsForBoardCategory(categoryKey));
  return listings.filter((row) => allowed.has(row.kind));
}

export function filterListingsByKindPrefs(listings, prefs = {}) {
  const allowed = new Set(
    [
      prefs.show_tournaments !== false && 'tournament',
      prefs.show_tournaments !== false && 'charity',
      prefs.show_tournaments !== false && 'corporate',
      prefs.show_courses !== false && 'course',
      prefs.show_training !== false && 'training',
      prefs.show_simulators !== false && 'simulator'
    ].filter(Boolean)
  );
  if (!allowed.size) return listings;
  return listings.filter((row) => allowed.has(row.kind));
}

export function kindLabel(kind) {
  switch (kind) {
    case 'course':
      return 'Course';
    case 'tournament':
      return 'Tournament';
    case 'charity':
      return 'Charity event';
    case 'corporate':
      return 'Corporate event';
    case 'simulator':
      return 'Simulator';
    case 'training':
      return 'Lessons';
    default:
      return kind || 'Listing';
  }
}
