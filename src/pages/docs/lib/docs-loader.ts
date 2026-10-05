// Eager-load tất cả markdown trong docs/architecture/ qua import.meta.glob.
// Path key dạng: /docs/architecture/01-modules/bookings.md
const modules = import.meta.glob('/docs/architecture/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface DocFile {
  /** path tương đối, ví dụ "01-modules/bookings.md" */
  relPath: string;
  /** slug dùng trong URL: "01-modules/bookings" */
  slug: string;
  /** thư mục cha: "01-modules" hoặc "" cho root */
  dir: string;
  /** tên file không có .md: "bookings" */
  name: string;
  /** Tiêu đề H1 hoặc tên file */
  title: string;
  /** Nội dung markdown */
  content: string;
  /** Headings H1-H3 cho TOC + search */
  headings: { level: number; text: string; slug: string }[];
}

const PREFIX = '/docs/architecture/';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

function extractHeadings(md: string) {
  const lines = md.split('\n');
  const out: DocFile['headings'] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      out.push({ level, text, slug: slugify(text) });
    }
  }
  return out;
}

function buildDoc(fullPath: string, content: string): DocFile {
  const relPath = fullPath.startsWith(PREFIX) ? fullPath.slice(PREFIX.length) : fullPath;
  const slug = relPath.replace(/\.md$/, '');
  const parts = relPath.split('/');
  const name = parts[parts.length - 1].replace(/\.md$/, '');
  const dir = parts.slice(0, -1).join('/');
  const headings = extractHeadings(content);
  const title = headings.find((h) => h.level === 1)?.text || name;
  return { relPath, slug, dir, name, title, content, headings };
}

export const allDocs: DocFile[] = Object.entries(modules)
  .map(([p, c]) => buildDoc(p, c as string))
  .sort((a, b) => a.relPath.localeCompare(b.relPath));

export const docsBySlug: Record<string, DocFile> = Object.fromEntries(
  allDocs.map((d) => [d.slug, d])
);

export function getDoc(slug: string): DocFile | undefined {
  return docsBySlug[slug];
}

export function getReadme(): DocFile | undefined {
  return docsBySlug['README'] || allDocs[0];
}
