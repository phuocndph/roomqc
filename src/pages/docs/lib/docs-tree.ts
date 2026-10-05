import { allDocs, type DocFile } from './docs-loader';

export interface DocNode {
  type: 'folder' | 'file';
  name: string;
  /** slug đầy đủ (file) hoặc đường dẫn folder */
  path: string;
  doc?: DocFile;
  children?: DocNode[];
}

export function buildDocsTree(): DocNode[] {
  const root: DocNode = { type: 'folder', name: '', path: '', children: [] };

  for (const doc of allDocs) {
    const parts = doc.relPath.split('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const folderPath = parts.slice(0, i + 1).join('/');
      let next = cur.children?.find((c) => c.type === 'folder' && c.name === folderName);
      if (!next) {
        next = { type: 'folder', name: folderName, path: folderPath, children: [] };
        cur.children!.push(next);
      }
      cur = next;
    }
    cur.children!.push({
      type: 'file',
      name: parts[parts.length - 1].replace(/\.md$/, ''),
      path: doc.slug,
      doc,
    });
  }

  // sort: folders trước, theo tên
  const sortRec = (n: DocNode) => {
    if (!n.children) return;
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.children || [];
}

/** Format folder name (vd "01-modules" → "01 · Modules") */
export function formatFolderName(name: string): string {
  const m = name.match(/^(\d+)-(.+)$/);
  if (m) return `${m[1]} · ${m[2].replace(/-/g, ' ')}`;
  return name.replace(/-/g, ' ');
}
