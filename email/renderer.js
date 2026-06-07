import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, '..', 'template-itqan-digest.html');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

export async function renderEmail(digest) {
  let template;
  try {
    template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read email template: ${error.message}`);
  }

  // 1. Window label
  template = template.replace(
    /ملخص الأسبوع:.*?(?=<\/p>)/,
    digest.window_label || 'ملخص الأسبوع'
  );

  // 2. Featured topic title
  template = template.replace(
    /كيف نتعامل مع الأخطاء التحريفية المنسية في GitHub\؟/,
    escapeHtml(digest.featured_topic?.title) || 'لا يوجد موضوع مميز'
  );

  // 3. Featured topic excerpt — replace the entire <p> content
  const excerptPattern = /(<p class="text-gray-700 text-md leading-relaxed">)([\s\S]*?)(<\/p>)/;
  if (excerptPattern.test(template)) {
    const authorText = (digest.featured_topic?.author_names || [])
      .map(name => `<strong>${escapeHtml(name)}</strong>`)
      .join(' و ');
    const newExcerpt = digest.featured_topic?.excerpt
      ? escapeHtml(digest.featured_topic.excerpt)
      : `شارك ${authorText} في نقاش مهم هذا الأسبوع.`;
    template = template.replace(excerptPattern, `$1${newExcerpt}$3`);
  }

  // 4. Featured topic URL
  template = template.replace(
    /href="https:\/\/community\.itqan\.dev\/d\/466"/g,
    `href="${digest.featured_topic?.url || '#'}"`
  );

  // 5. Theme 1
  const theme1 = digest.themes?.[0];
  if (theme1) {
    template = template.replace(
      'أداة "مزمن" لمزامنة الآيات بأسهم لوحة المفاتيح',
      escapeHtml(theme1.title)
    );
    template = template.replace(
      /أداة جديدة من تطوير ناصر طاهري.*?كفاءة عالية\./,
      escapeHtml(theme1.description) || ''
    );
    template = template.replace(
      'href="https://community.itqan.dev/d/467"',
      `href="${theme1.url}"`
    );
  }

  // 6. Theme 2
  const theme2 = digest.themes?.[1];
  if (theme2) {
    template = template.replace(
      'تحسين تجربة المستخدم للتنبيهات في تطبيق زاد المؤمن',
      escapeHtml(theme2.title)
    );
    template = template.replace(
      /نقاش حول ذكاء التنبيهات.*?دون إزعاج\./,
      escapeHtml(theme2.description) || ''
    );
    template = template.replace(
      'href="https://community.itqan.dev/d/463"',
      `href="${theme2.url}"`
    );
  }

  // 7. Open Questions — replace the entire <ul> content
  const questions = digest.open_questions || [];
  if (questions.length > 0) {
    const questionItems = questions.map(q =>
      `<li class="text-md font-medium leading-relaxed border-b border-itqan-primary/20 pb-4">
                        • ${escapeHtml(q.question)}
                    </li>`
    ).join('\n');
    const questionsBlock = /(<ul class="space-y-6">)([\s\S]*?)(<\/ul>)/;
    template = template.replace(questionsBlock, `$1\n${questionItems}\n                $3`);
  }

  // 8. Contributors — replace the grid content using text anchors
  // because the grid has nested </div> tags, we anchor on the heading text
  // and replace everything up to the next heading or the end of the section.
  const contributors = digest.contributors || [];
  if (contributors.length > 0) {
    const contributorCards = contributors.map(c => `                    <div class="flex items-center gap-4 p-5 rounded-3xl bg-itqan-light/30 border border-transparent hover:border-itqan-primary/20 hover:bg-itqan-light/50 transition-all">
                        <div class="w-12 h-12 rounded-2xl bg-itqan-primary flex items-center justify-center text-white font-bold text-lg">${initials(c.name)}</div>
                        <div>
                            <h4 class="text-sm font-bold text-itqan-dark">${escapeHtml(c.name)}</h4>
                            <p class="text-[11px] text-itqan-dark/60 mt-0.5">${escapeHtml(c.contribution)}</p>
                        </div>
                    </div>`).join('\n');

    // Use the heading text as a right-side anchor and the grid class as a left-side anchor
    const contributorsBlock = /(أبرز المساهمين<\/h3>)([\s\S]*?)(<\/div>\s*<\/div>\s*<\/div>\s*\n\s*<!-- Footer -->)/;
    if (contributorsBlock.test(template)) {
      template = template.replace(contributorsBlock, `$1\n${contributorCards}\n            $3`);
    }
  }

  return template;
}
