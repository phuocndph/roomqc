import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  name?: string;
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Lightweight per-section error boundary.
 *
 * Tác dụng: nếu 1 section (Pricing, Features, FAQ…) ném lỗi runtime
 * (ví dụ i18n trả về object thay vì array trên bundle cũ), section đó
 * "biến mất" hoặc thay bằng fallback nhỏ — phần còn lại của trang vẫn
 * dùng được, không hiện màn "Unexpected Application Error" mặc định
 * của React Router.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.name ?? 'unknown'}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

export default SectionErrorBoundary;
