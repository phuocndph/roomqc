import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, ChevronDown, FileText, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildDocsTree, formatFolderName, type DocNode } from '../lib/docs-tree';

function NodeItem({ node, depth }: { node: DocNode; depth: number }) {
  const { pathname } = useLocation();
  const currentSlug = pathname.replace(/^\/docs\/?/, '');
  const isActive = node.type === 'file' && currentSlug === node.path;
  const startsActive =
    node.type === 'folder' && currentSlug.startsWith(node.path + '/');
  const [open, setOpen] = useState(depth === 0 || startsActive);

  if (node.type === 'folder') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Folder className="h-3 w-3" />
          <span className="truncate">{formatFolderName(node.name)}</span>
        </button>
        {open && (
          <div>
            {node.children?.map((c) => (
              <NodeItem key={c.path} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={`/docs/${node.path}`}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md hover:bg-muted/60 transition-colors',
        isActive && 'bg-primary/10 text-primary font-medium'
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className="truncate">{node.doc?.title || node.name}</span>
    </NavLink>
  );
}

export function DocsSidebar() {
  const tree = buildDocsTree();
  return (
    <nav className="flex flex-col gap-0.5 py-2 text-sm">
      {tree.map((n) => (
        <NodeItem key={n.path} node={n} depth={0} />
      ))}
    </nav>
  );
}
