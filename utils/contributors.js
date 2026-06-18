import 'dotenv/config';

const DEFAULT_WEIGHTS = {
  externalBoost: 1.5,
  recency7d: 2.0,
  recency30d: 1.5,
  diversityBoost: 1.5,
  diversityMinDiscussions: 3
};

function parseInternalIds() {
  const raw = process.env.INTERNAL_MEMBER_IDS || '';
  return new Set(
    raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
  );
}

/**
 * Compute weighted contributors from raw activity rows returned by fetchContributorActivity().
 *
 * Formula (all multipliers configurable):
 *   score = base * external * recency * diversity
 *   base      = number of posts in window
 *   external  = WEIGHT_EXTERNAL_BOOST if user_id not in INTERNAL_MEMBER_IDS, else 1.0
 *   recency   = WEIGHT_RECENCY_7D  if any post within 7d
 *               WEIGHT_RECENCY_30D if any post within 30d but not 7d
 *               1.0 otherwise
 *   diversity = WEIGHT_DIVERSITY_BOOST if distinct discussions >= WEIGHT_DIVERSITY_MIN_DISCUSSIONS
 *               1.0 otherwise
 *
 * @param {Array<{author_user_id, author_name, discussion_id, created_at}>} activity
 * @param {{internalIds?: Set<number>|number[], now?: Date, forumBaseUrl?: string, topN?: number, weights?: object}} opts
 * @returns {Array<{name, user_id, url, contribution, discussion_ids, score}>}
 */
export function computeContributors(activity, opts = {}) {
  const {
    internalIds: internalIdsInput,
    now = new Date(),
    forumBaseUrl = process.env.FORUM_BASE_URL || 'https://community.itqan.dev',
    topN = parseInt(process.env.CONTRIBUTORS_TOP_N || '5', 10),
    weights: weightsOverride = {}
  } = opts;

  const internalIds = internalIdsInput instanceof Set
    ? internalIdsInput
    : new Set(internalIdsInput ?? [...parseInternalIds()]);

  const weights = { ...DEFAULT_WEIGHTS, ...resolveEnvWeights(), ...weightsOverride };

  const MS_7D = 7 * 86400000;
  const MS_30D = 30 * 86400000;

  // Aggregate per user
  const byUser = new Map();
  for (const row of activity) {
    const uid = row.author_user_id;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        user_id: uid,
        name: row.author_name,
        posts: [],
        discussions: new Set()
      });
    }
    const entry = byUser.get(uid);
    entry.posts.push(new Date(row.created_at));
    entry.discussions.add(String(row.discussion_id));
  }

  const nowMs = now.getTime();

  const scored = [];
  for (const [uid, entry] of byUser) {
    const base = entry.posts.length;
    const mostRecentMs = Math.max(...entry.posts.map(d => d.getTime()));
    const ageMs = nowMs - mostRecentMs;

    const external = internalIds.has(uid) ? 1.0 : weights.externalBoost;
    const recency = ageMs <= MS_7D ? weights.recency7d
      : ageMs <= MS_30D ? weights.recency30d
      : 1.0;
    const diversity = entry.discussions.size >= weights.diversityMinDiscussions
      ? weights.diversityBoost
      : 1.0;

    const score = base * external * recency * diversity;
    const distinctDiscussions = entry.discussions.size;

    scored.push({
      name: entry.name,
      user_id: uid,
      url: `${forumBaseUrl}/u/${uid}`,
      contribution: `شارك في ${distinctDiscussions} ${distinctDiscussions === 1 ? 'نقاش' : 'نقاشات'} بـ ${base} مساهمة`,
      discussion_ids: [...entry.discussions],
      score
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}

function resolveEnvWeights() {
  const result = {};
  const map = {
    WEIGHT_EXTERNAL_BOOST: 'externalBoost',
    WEIGHT_RECENCY_7D: 'recency7d',
    WEIGHT_RECENCY_30D: 'recency30d',
    WEIGHT_DIVERSITY_BOOST: 'diversityBoost',
    WEIGHT_DIVERSITY_MIN_DISCUSSIONS: 'diversityMinDiscussions'
  };
  for (const [envKey, optKey] of Object.entries(map)) {
    if (process.env[envKey] !== undefined) {
      result[optKey] = parseFloat(process.env[envKey]);
    }
  }
  return result;
}
