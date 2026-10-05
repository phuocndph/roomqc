import { useEffect, useRef, useState } from 'react';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const isDark = document.documentElement.classList.contains('dark');
      m.default.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'inherit',
      });
      return m.default;
    });
  }
  return mermaidPromise;
};

let counter = 0;

export function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++counter}-${Date.now()}`;
    loadMermaid()
      .then(async (mermaid) => {
        try {
          const { svg } = await mermaid.render(id, code);
          if (!cancelled && ref.current) {
            ref.current.innerHTML = svg;
            setError(null);
          }
        } catch (e: any) {
          if (!cancelled) setError(e?.message || 'Lỗi render diagram');
        }
      })
      .catch((e) => !cancelled && setError(e?.message || 'Không tải được Mermaid'));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-4 border border-destructive/30 rounded-lg p-3 bg-destructive/5">
        <p className="text-xs text-destructive font-medium mb-2">Lỗi sơ đồ Mermaid</p>
        <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs cursor-pointer text-muted-foreground">Xem code</summary>
          <pre className="text-xs mt-1 overflow-auto">{code}</pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="my-4 flex justify-center overflow-auto rounded-lg border bg-muted/20 p-4 [&_svg]:max-w-full"
    />
  );
}
