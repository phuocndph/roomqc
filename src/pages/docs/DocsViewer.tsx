import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { DocsTOC } from './components/DocsTOC';
import { getDoc } from './lib/docs-loader';

export default function DocsViewer() {
  const params = useParams();
  // wildcard route: params['*'] chứa toàn bộ slug sau /docs/
  const slug = (params['*'] || '').replace(/\.md$/, '');
  const doc = getDoc(slug);

  // Scroll to anchor sau khi render
  useEffect(() => {
    if (!doc) return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [doc, slug]);

  if (!doc) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold mb-2">Không tìm thấy tài liệu</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Slug: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{slug || '(rỗng)'}</code>
        </p>
        <Link to="/docs" className="text-sm text-primary hover:underline">
          ← Về trang tài liệu
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-8 px-4 md:px-8 py-6">
      <div className="flex-1 min-w-0 max-w-4xl">
        <MarkdownRenderer content={doc.content} />
      </div>
      <DocsTOC doc={doc} />
    </div>
  );
}
