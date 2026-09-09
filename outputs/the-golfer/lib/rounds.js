export function statsForRounds(rounds = [], holes = null) {
  const selected = holes ? rounds.filter((row) => Number(row.holes) === holes) : rounds;
  const scores = selected.map((row) => Number(row.score)).filter(Number.isFinite);
  return {
    rounds: selected.length,
    average: scores.length
      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
      : null,
    best: scores.length ? Math.min(...scores) : null
  };
}

export async function fetchRoundStats(supabase, userId) {
  const rows = await supabase(
    `rounds?player_id=eq.${encodeURIComponent(userId)}&select=score,holes&order=played_on.desc`
  );
  return {
    all: statsForRounds(rows),
    nine: statsForRounds(rows, 9),
    eighteen: statsForRounds(rows, 18)
  };
}

export async function fetchRecentRounds(supabase, userId, { limit = 50, extraFilter = '' } = {}) {
  const select =
    'id,course_name,played_on,holes,score,par,putts,fairways_hit,greens_hit,notes,visibility,listing_id,created_at';
  try {
    return await supabase(
      `rounds?player_id=eq.${encodeURIComponent(userId)}${extraFilter}&select=${select}&order=played_on.desc&limit=${limit}`
    );
  } catch (error) {
    if (!/listing_id|schema cache|does not exist|not ready/i.test(error.message || '')) throw error;
    if (extraFilter.includes('listing_id=')) return [];
    return await supabase(
      `rounds?player_id=eq.${encodeURIComponent(userId)}&select=id,course_name,played_on,holes,score,par,putts,fairways_hit,greens_hit,notes,visibility&order=played_on.desc&limit=${limit}`
    );
  }
}

export function validateRoundInput(input = {}, { requireId = false } = {}) {
  if (requireId && !input.id) throw Object.assign(new Error('Round id is required.'), { status: 400 });
  const score = Number(input.score);
  const holes = Number(input.holes || 18);
  const par = input.par === '' || input.par == null ? null : Number(input.par);
  const course_name = String(input.course_name || '').trim();
  if (!requireId) {
    if (!course_name || !Number.isInteger(score) || score < 20 || score > 200 || ![9, 18].includes(holes)) {
      throw Object.assign(new Error('Add a course, a valid score, and either 9 or 18 holes.'), { status: 400 });
    }
  } else if (input.score != null && (!Number.isInteger(score) || score < 20 || score > 200)) {
    throw Object.assign(new Error('Score must be between 20 and 200.'), { status: 400 });
  }
  if (input.holes != null && ![9, 18].includes(Number(input.holes))) {
    throw Object.assign(new Error('Holes must be 9 or 18.'), { status: 400 });
  }
  return {
    course_name: course_name || undefined,
    played_on: input.played_on || undefined,
    score: input.score == null ? undefined : score,
    holes: input.holes == null ? undefined : holes,
    par,
    putts: input.putts === '' || input.putts == null ? null : Number(input.putts),
    fairways_hit:
      input.fairways_hit === '' || input.fairways_hit == null ? null : Number(input.fairways_hit),
    greens_hit: input.greens_hit === '' || input.greens_hit == null ? null : Number(input.greens_hit),
    notes: String(input.notes || '').trim() || null,
    visibility: 'private'
  };
}

export async function loadOwnedRound(supabase, userId, roundId) {
  const [row] = await supabase(
    `rounds?id=eq.${encodeURIComponent(roundId)}&player_id=eq.${encodeURIComponent(userId)}&select=id,player_id,course_name,played_on,holes,score,par,putts,fairways_hit,greens_hit,notes,visibility,listing_id`
  );
  return row || null;
}
