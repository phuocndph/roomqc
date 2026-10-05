import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { isChunkLoadError, purgeCachesAndReload, hasReloadAttempted } from '@/lib/chunk-reload';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
  error: Error | null;
}

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    const isChunk = isChunkLoadError(error);
    return { hasError: true, isChunkError: isChunk, error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error) && !hasReloadAttempted()) {
      // Tự động reload lần đầu tiên — handler global cũng sẽ bắt, nhưng
      // ErrorBoundary chạy đồng bộ với render nên đảm bảo trigger ngay.
      purgeCachesAndReload();
    }
  }

  private handleReload = () => {
    // Xoá flag để cho phép reload kể cả khi đã thử trước đó
    try {
      sessionStorage.removeItem('__chunk_reload_attempted__');
    } catch {
      /* ignore */
    }
    purgeCachesAndReload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.state.isChunkError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="max-w-sm w-full text-center space-y-4">
            <h2 className="text-lg font-semibold">Đã có bản cập nhật mới</h2>
            <p className="text-sm text-muted-foreground">
              Vui lòng tải lại để dùng phiên bản mới nhất.
            </p>
            <Button onClick={this.handleReload} className="w-full">
              Tải lại ngay
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md w-full space-y-4">
          <h2 className="text-lg font-semibold text-destructive">Đã xảy ra lỗi</h2>
          <p className="text-sm text-muted-foreground break-words">
            {this.state.error?.message ?? 'Lỗi không xác định'}
          </p>
          <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
            Tải lại trang
          </Button>
        </div>
      </div>
    );
  }
}
