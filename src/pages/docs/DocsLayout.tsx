import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, ArrowLeft, Printer } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DocsSidebar } from './components/DocsSidebar';
import { DocsSearch } from './components/DocsSearch';
import { formatFolderName } from './lib/docs-tree';

export default function DocsLayout() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\/docs\/?/, '');
  const parts = slug ? slug.split('/') : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="flex h-12 items-center gap-2 px-3 md:px-4">
          {/* Mobile sidebar */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" aria-label="Mở menu">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <ScrollArea className="h-full px-2 py-2">
                <DocsSidebar />
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <Button asChild variant="ghost" size="sm" className="gap-1 h-8">
            <Link to="/">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Về app</span>
            </Link>
          </Button>

          <div className="flex items-center gap-2 text-sm">
            <Link to="/docs" className="font-semibold hover:text-primary">
              Tài liệu kỹ thuật
            </Link>
            {parts.length > 0 && (
              <>
                <span className="text-muted-foreground">/</span>
                {parts.map((p, i) => {
                  const isLast = i === parts.length - 1;
                  const path = parts.slice(0, i + 1).join('/');
                  const label = isLast ? p : formatFolderName(p);
                  return (
                    <span key={i} className="flex items-center gap-2">
                      {isLast ? (
                        <span className="text-muted-foreground truncate max-w-[200px]">{label}</span>
                      ) : (
                        <Link
                          to={`/docs/${path}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {label}
                        </Link>
                      )}
                      {!isLast && <span className="text-muted-foreground">/</span>}
                    </span>
                  );
                })}
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="w-48 md:w-64">
              <DocsSearch />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.print()}
              title="In trang"
            >
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-64 shrink-0 border-r h-[calc(100vh-3rem)] sticky top-12 print:hidden">
          <ScrollArea className="h-full px-2 py-2">
            <DocsSidebar />
          </ScrollArea>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
