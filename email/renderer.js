import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import juice from 'juice';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, '..', 'template-itqan-digest.html');

// Register Handlebars helper to generate initials from a name
Handlebars.registerHelper('initials', (name) => {
  if (!name) return '';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
});

// Register Handlebars helper for default values
Handlebars.registerHelper('default', (value, defaultValue) => {
  return value || defaultValue;
});

export async function renderEmail(digest) {
  let template;
  try {
    template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read email template: ${error.message}`);
  }

  const compiled = Handlebars.compile(template);
  const html = compiled(digest);
  return juice(html);
}
