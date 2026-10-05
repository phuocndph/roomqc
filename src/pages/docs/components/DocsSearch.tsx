import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { allDocs } from '../lib/docs-loader';

export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(
    () =>
      allDocs.flatMap((d) => [
        { kind: 'file' as const, doc: d, label: d.title, sub: d.relPath, slug: d.slug, hash: '' },
        ...d.headings
          .filter((h) => h.level >= 2)
          .map((h) => ({
            kind: 'heading' as const,
            doc: d,
            label: h.text,
            sub: `${d.title} · ${d.relPath}`,
            slug: d.slug,
            hash: h.slug,
          })),
      ]),
    []
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground font-normal"
        onClick={() => setOpen(true)}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs">Tìm kiếm tài liệu...</span>
        <kbd className="ml-auto pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Tìm theo tiêu đề, heading..." />
        <CommandList>
          <CommandEmpty>Không tìm thấy.</CommandEmpty>
          <CommandGroup heading="Trang & Heading">
            {items.map((it, idx) => (
              <CommandItem
                key={`${it.slug}-${it.hash}-${idx}`}
                value={`${it.label} ${it.sub}`}
                onSelect={() => {
                  setOpen(false);
                  navigate(`/docs/${it.slug}${it.hash ? '#' + it.hash : ''}`);
                }}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="truncate text-sm">
                    {it.kind === 'heading' && '# '}
                    {it.label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{it.sub}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
