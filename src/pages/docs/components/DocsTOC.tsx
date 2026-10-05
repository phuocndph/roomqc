import type { DocFile } from '../lib/docs-loader';
import { cn } from '@/lib/utils';

export function DocsTOC({ doc }: { doc: DocFile }) {
  const items = doc.headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length === 0) return null;
  return (
    <aside className="hidden xl:block w-56 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Mục lục
      </p>
      <ul className="space-y-1 text-sm border-l">
        {items.map((h, i) => (
          <li key={i}>
            <a
              href={`#${h.slug}`}
              className={cn(
                'block border-l-2 -ml-px hover:border-primary hover:text-foreground text-muted-foreground transition-colors',
                h.level === 2 ? 'pl-3 py-0.5' : 'pl-6 py-0.5 text-xs',
                'border-transparent'
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
