import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mysql2 BEFORE importing the module
const MOCK_POOL_OBJ = { query: vi.fn(), end: vi.fn() };

vi.mock('mysql2/promise', () => {
  return {
    default: {
      createPool: vi.fn(() => MOCK_POOL_OBJ)
    }
  };
});

import mysql from 'mysql2/promise';
import { fetchRecentPosts, fetchRecipientEmails, closePool } from '../../db/posts';

describe('fetchRecentPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DB_HOST', 'localhost');
    vi.stubEnv('DB_PORT', '3306');
    vi.stubEnv('DB_NAME', 'test');
    vi.stubEnv('DB_USER', 'test');
    vi.stubEnv('DB_PASS', 'test');
    vi.stubEnv('DIGEST_WINDOW_DAYS', '7');
    vi.stubEnv('DIGEST_POSTS_COUNT', '30');
    vi.stubEnv('FORUM_BASE_URL', 'https://community.itqan.dev');

    // Reset the singleton pool between tests
    closePool().catch(() => {});
  });

  it('returns posts with required fields', async () => {
    const mockRows = [
      {
        id: 123,
        title: 'Test Discussion',
        post_body: 'Test body content',
        author_name: 'Test User',
        created_at: new Date(),
        view_count: 100,
        comment_count: 10,
        like_count: 5
      }
    ];

    MOCK_POOL_OBJ.query.mockResolvedValue([mockRows]);

    const result = await fetchRecentPosts();

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('discussion_id', '123');
    expect(result[0]).toHaveProperty('title', 'Test Discussion');
    expect(result[0]).toHaveProperty('author_name', 'Test User');
    expect(result[0]).toHaveProperty('url', 'https://community.itqan.dev/d/123');
    expect(result[0]).toHaveProperty('interactions', 115);
  });

  it('returns empty array when no posts exist', async () => {
    MOCK_POOL_OBJ.query.mockResolvedValue([[]]);

    const result = await fetchRecentPosts();
    expect(result).toEqual([]);
  });

  it('propagates query error', async () => {
    MOCK_POOL_OBJ.query.mockRejectedValue(new Error('DB down'));

    await expect(fetchRecentPosts()).rejects.toThrow('DB down');
  });

  it('handles null numeric fields', async () => {
    const mockRows = [
      {
        id: 123,
        title: 'Test',
        post_body: 'Body',
        author_name: 'User',
        created_at: new Date(),
        view_count: null,
        comment_count: null,
        like_count: null
      }
    ];

    MOCK_POOL_OBJ.query.mockResolvedValue([mockRows]);

    const result = await fetchRecentPosts();
    expect(result[0].interactions).toBe(0);
    expect(result[0].view_count).toBe(0);
  });
});

describe('fetchRecipientEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DB_HOST', 'localhost');
    vi.stubEnv('DB_PORT', '3306');
    vi.stubEnv('DB_NAME', 'test');
    vi.stubEnv('DB_USER', 'test');
    vi.stubEnv('DB_PASS', 'test');

    // Reset the singleton pool between tests
    closePool().catch(() => {});
  });

  it('returns array of emails', async () => {
    const mockRows = [
      { email: 'user1@test.com' },
      { email: 'user2@test.com' }
    ];

    MOCK_POOL_OBJ.query.mockResolvedValue([mockRows]);

    const result = await fetchRecipientEmails();
    expect(result).toEqual(['user1@test.com', 'user2@test.com']);
  });
});
