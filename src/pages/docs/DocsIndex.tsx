import { Link } from 'react-router-dom';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { DocsTOC } from './components/DocsTOC';
import { allDocs, getReadme } from './lib/docs-loader';
import { buildDocsTree, formatFolderName } from './lib/docs-tree';

export default function DocsIndex() {
  const readme = getReadme();
  const tree = buildDocsTree();

  return (
    <div className="flex gap-8 px-4 md:px-8 py-6">
      <div className="flex-1 min-w-0 max-w-4xl space-y-8">
        {readme ? (
          <MarkdownRenderer content={readme.content} />
        ) : (
          <div>
            <h1 className="text-2xl font-bold mb-2">Tài liệu kỹ thuật</h1>
            <p className="text-sm text-muted-foreground">
              {allDocs.length} tài liệu trong <code>docs/architecture/</code>
            </p>
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold mb-3">Duyệt theo thư mục</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {tree
              .filter((n) => n.type === 'folder')
              .map((folder) => (
                <div key={folder.path} className="border rounded-lg p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {formatFolderName(folder.name)}
                  </p>
                  <ul className="space-y-1">
                    {folder.children?.map((c) =>
                      c.type === 'file' ? (
                        <li key={c.path}>
                          <Link
                            to={`/docs/${c.path}`}
                            className="text-sm hover:text-primary hover:underline"
                          >
                            {c.doc?.title || c.name}
                          </Link>
                        </li>
                      ) : null
                    )}
                  </ul>
                </div>
              ))}
          </div>
        </section>
      </div>
      {readme && <DocsTOC doc={readme} />}
    </div>
  );
}
