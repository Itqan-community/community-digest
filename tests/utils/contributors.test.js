import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeContributors } from '../../utils/contributors.js';

const BASE_URL = 'https://community.itqan.dev';
const NOW = new Date('2026-06-18T12:00:00Z');

// Build activity rows as fetchContributorActivity() would return
function makeActivity({ userId, name, discussionIds, daysAgo = 3 }) {
  return discussionIds.map((did, i) => ({
    author_user_id: userId,
    author_name: name,
    discussion_id: String(did),
    created_at: new Date(NOW.getTime() - (daysAgo + i) * 86400000)
  }));
}

const defaultOpts = {
  internalIds: [],
  now: NOW,
  forumBaseUrl: BASE_URL
};

describe('computeContributors', () => {
  it('computeContributors_externalMember_gets1_5xBoost', () => {
    const activity = [
      ...makeActivity({ userId: 1, name: 'Internal', discussionIds: ['10'], daysAgo: 3 }),
      ...makeActivity({ userId: 2, name: 'External', discussionIds: ['11'], daysAgo: 3 }),
    ];
    const opts = { ...defaultOpts, internalIds: [1] };
    const result = computeContributors(activity, opts);

    const internal = result.find(c => c.user_id === 1);
    const external = result.find(c => c.user_id === 2);

    // Both have 1 post within 7d (recency 2.0), 1 discussion (no diversity)
    // internal: 1 * 1.0 * 2.0 * 1.0 = 2.0
    // external: 1 * 1.5 * 2.0 * 1.0 = 3.0
    expect(external.score).toBeGreaterThan(internal.score);
    expect(external.score).toBe(internal.score * 1.5);
  });

  it('computeContributors_internalDoesNotDominateByVolume', () => {
    // Internal has 3 posts; external has 2 recent+diverse posts
    const activity = [
      ...makeActivity({ userId: 1, name: 'Internal', discussionIds: ['10', '11', '12'], daysAgo: 3 }),
      ...makeActivity({ userId: 2, name: 'External', discussionIds: ['20', '21', '22'], daysAgo: 3 }),
    ];
    const opts = { ...defaultOpts, internalIds: [1] };
    const result = computeContributors(activity, opts);

    const internal = result.find(c => c.user_id === 1);
    const external = result.find(c => c.user_id === 2);

    // internal: 3 * 1.0 * 2.0 * 1.5 = 9.0
    // external: 3 * 1.5 * 2.0 * 1.5 = 13.5
    expect(external.score).toBeGreaterThan(internal.score);
  });

  it('computeContributors_recencyWithin7d_applies2xWeight', () => {
    const activity = makeActivity({ userId: 1, name: 'Alice', discussionIds: ['10'], daysAgo: 2 });
    const [result] = computeContributors(activity, defaultOpts);
    // base=1, external=1.5 (not internal), recency=2.0 (within 7d), diversity=1.0
    expect(result.score).toBe(1 * 1.5 * 2.0 * 1.0);
  });

  it('computeContributors_recency30dOnly_applies1_5xWeight', () => {
    const activity = makeActivity({ userId: 1, name: 'Alice', discussionIds: ['10'], daysAgo: 15 });
    const [result] = computeContributors(activity, defaultOpts);
    // base=1, external=1.5, recency=1.5 (within 30d but not 7d), diversity=1.0
    expect(result.score).toBe(1 * 1.5 * 1.5 * 1.0);
  });

  it('computeContributors_3PlusDistinctDiscussions_appliesDiversityBoost', () => {
    const activity = makeActivity({ userId: 1, name: 'Alice', discussionIds: ['10', '11', '12'], daysAgo: 2 });
    const [result] = computeContributors(activity, defaultOpts);
    // base=3, external=1.5, recency=2.0, diversity=1.5
    expect(result.score).toBe(3 * 1.5 * 2.0 * 1.5);
  });

  it('computeContributors_under3Discussions_noDiversityBoost', () => {
    const activity = makeActivity({ userId: 1, name: 'Alice', discussionIds: ['10', '11'], daysAgo: 2 });
    const [result] = computeContributors(activity, defaultOpts);
    // base=2, external=1.5, recency=2.0, diversity=1.0
    expect(result.score).toBe(2 * 1.5 * 2.0 * 1.0);
  });

  it('computeContributors_respectsConfigurableEnvWeights', () => {
    const activity = makeActivity({ userId: 1, name: 'Alice', discussionIds: ['10'], daysAgo: 2 });
    const opts = {
      ...defaultOpts,
      weights: { externalBoost: 2.0, recency7d: 3.0, recency30d: 2.0, diversityBoost: 2.0, diversityMinDiscussions: 2 }
    };
    const [result] = computeContributors(activity, opts);
    // base=1, external=2.0, recency=3.0, diversity=1.0 (only 1 discussion)
    expect(result.score).toBe(1 * 2.0 * 3.0 * 1.0);
  });

  it('computeContributors_returnsTopNSorted', () => {
    const activity = [
      ...makeActivity({ userId: 1, name: 'Low', discussionIds: ['10'], daysAgo: 20 }),
      ...makeActivity({ userId: 2, name: 'High', discussionIds: ['20', '21', '22'], daysAgo: 1 }),
      ...makeActivity({ userId: 3, name: 'Mid', discussionIds: ['30', '31'], daysAgo: 5 }),
    ];
    const opts = { ...defaultOpts, topN: 2 };
    const result = computeContributors(activity, opts);

    expect(result).toHaveLength(2);
    expect(result[0].user_id).toBe(2); // highest score first
  });

  it('computeContributors_usesRealUserIdInUrl', () => {
    const activity = makeActivity({ userId: 42, name: 'Alice', discussionIds: ['10'], daysAgo: 2 });
    const [result] = computeContributors(activity, defaultOpts);
    expect(result.url).toBe(`${BASE_URL}/u/42`);
    expect(result.user_id).toBe(42);
  });

  it('returns correct output shape', () => {
    const activity = makeActivity({ userId: 1, name: 'Alice', discussionIds: ['10'], daysAgo: 2 });
    const [result] = computeContributors(activity, defaultOpts);
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('user_id');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('contribution');
    expect(result).toHaveProperty('discussion_ids');
    expect(result).toHaveProperty('score');
  });
});
