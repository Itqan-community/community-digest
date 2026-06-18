import { describe, it, expect } from 'vitest';
import { renderEmail } from '../../email/renderer.js';

const mockDigest = {
  window_label: 'ملخص الأسبوع: 1 يونيو 2026',
  featured_topic: {
    title: 'موضوع تجريبي',
    excerpt: 'نص تجريبي',
    author_names: ['مستخدم 1'],
    url: 'https://community.itqan.dev/d/123'
  },
  themes: [
    { title: 'محور 1', description: 'وصف محور', url: 'https://community.itqan.dev/d/124', discussion_id: '124' }
  ],
  open_questions: [
    { question: 'سؤال مفتوح؟', url: 'https://community.itqan.dev/d/125', discussion_id: '125' }
  ],
  contributors: [
    { name: 'مساهم', user_id: 42, contribution: 'شارك في نقاشين', url: 'https://community.itqan.dev/u/42', discussion_ids: ['123', '124'] }
  ]
};

describe('renderEmail', () => {
  it('injects digest data into HTML template', async () => {
    const html = await renderEmail(mockDigest);
    expect(html).toContain('موضوع تجريبي');
    expect(html).toContain('نص تجريبي');
    expect(html).toContain('محور 1');
    expect(html).toContain('سؤال مفتوح؟');
    expect(html).toContain('مساهم');
  });

  it('renderEmail_includesUnsubscribePlaceholder', async () => {
    const html = await renderEmail(mockDigest);
    // Template must contain the raw sentinel, NOT an empty href
    expect(html).toContain('__UNSUBSCRIBE_PLACEHOLDER__');
    // Handlebars must NOT have silently resolved it to empty
    expect(html).not.toMatch(/href=""\s*[^_]/);
  });

  it('renderEmail_contributorUrlUsesRealUserId', async () => {
    const html = await renderEmail(mockDigest);
    // Contributor URL must use the DB-sourced user_id, not a hallucinated value
    expect(html).toContain('/u/42');
  });

  it('handles empty digest gracefully', async () => {
    const empty = {
      window_label: undefined,
      featured_topic: {},
      themes: [],
      open_questions: [],
      contributors: []
    };
    const html = await renderEmail(empty);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });
});
