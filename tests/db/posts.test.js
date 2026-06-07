import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg BEFORE importing the module
vi.mock('pg', () => {
  function MockPool() {}
  return { Pool: MockPool };
});

import { Pool } from 'pg';
import { fetchRecentPosts, fetchRecipientEmails } from '../../db/posts';

describe('fetchRecentPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DB_HOST', 'localhost');
    vi.stubEnv('DB_PORT', '5432');
    vi.stubEnv('DB_NAME', 'test');
    vi.stubEnv('DB_USER', 'test');
    vi.stubEnv('DB_PASS', 'test');
    vi.stubEnv('DIGEST_WINDOW_DAYS', '7');
    vi.stubEnv('DIGEST_POSTS_COUNT', '30');
    vi.stubEnv('FORUM_BASE_URL', 'https://community.itqan.dev');
  });

  it('returns posts with required fields', async () => {
    const mockRows = [
      {
        discussion_id: 123,
        title: 'Test Discussion',
        post_body: 'Test body content',
        author_name: 'Test User',
        created_at: new Date(),
        view_count: 100,
        reply_count: 10,
        like_count: 5
      }
    ];

    Pool.prototype.query = vi.fn().mockResolvedValue({ rows: mockRows });
    Pool.prototype.end = vi.fn().mockResolvedValue(undefined);

    const result = await fetchRecentPosts();

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('discussion_id', '123');
    expect(result[0]).toHaveProperty('title', 'Test Discussion');
    expect(result[0]).toHaveProperty('author_name', 'Test User');
    expect(result[0]).toHaveProperty('url', 'https://community.itqan.dev/d/123');
    expect(result[0]).toHaveProperty('interactions', 115);
  });

  it('returns empty array when no posts exist', async () => {
    Pool.prototype.query = vi.fn().mockResolvedValue({ rows: [] });
    Pool.prototype.end = vi.fn().mockResolvedValue(undefined);

    const result = await fetchRecentPosts();
    expect(result).toEqual([]);
  });
});

describe('fetchRecipientEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DB_HOST', 'localhost');
    vi.stubEnv('DB_PORT', '5432');
    vi.stubEnv('DB_NAME', 'test');
    vi.stubEnv('DB_USER', 'test');
    vi.stubEnv('DB_PASS', 'test');
  });

  it('returns array of emails', async () => {
    const mockRows = [
      { email: 'user1@test.com' },
      { email: 'user2@test.com' }
    ];

    Pool.prototype.query = vi.fn().mockResolvedValue({ rows: mockRows });
    Pool.prototype.end = vi.fn().mockResolvedValue(undefined);

    const result = await fetchRecipientEmails();
    expect(result).toEqual(['user1@test.com', 'user2@test.com']);
  });
});
