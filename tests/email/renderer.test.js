import { describe, it, expect } from 'vitest';
import { renderEmail } from '../../email/renderer';

describe('renderEmail', () => {
  it('injects digest data into HTML template', () => {
    const mockDigest = {
      window_label: 'ملخص الأسبوع: 1 يونيو 2026',
      featured_topic: {
        title: 'موضوع تجريبي',
        excerpt: 'نص تجريبي',
        author_names: ['مستخدم 1', 'مستخدم 2'],
        url: 'https://community.itqan.dev/d/123'
      },
      themes: [
        {
          title: 'محور 1',
          description: 'وصف محور',
          url: 'https://community.itqan.dev/d/124',
          discussion_id: '124'
        }
      ],
      open_questions: [
        {
          question: 'سؤال مفتوح؟',
          url: 'https://community.itqan.dev/d/125',
          discussion_id: '125'
        }
      ],
      contributors: [
        {
          name: 'مساهم',
          contribution: 'ساهم في تطوير... (#123)',
          discussion_ids: ['123']
        }
      ]
    };

    const html = renderEmail(mockDigest);

    expect(html).toContain('ملخص الأسبوع: 1 يونيو 2026');
    expect(html).toContain('موضوع تجريبي');
    expect(html).toContain('نص تجريبي');
    expect(html).toContain('محور 1');
    expect(html).toContain('سؤال مفتوح؟');
    expect(html).toContain('مساهم');
    expect(html).toContain('https://community.itqan.dev/d/123');
  });

  it('handles empty digest gracefully', () => {
    const mockDigest = {
      window_label: '',
      featured_topic: {},
      themes: [],
      open_questions: [],
      contributors: []
    };

    const html = renderEmail(mockDigest);

    // Should still be valid HTML
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });
});
