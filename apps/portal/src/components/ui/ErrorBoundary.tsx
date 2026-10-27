'use client';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// React 19 class component JSX workaround — cast at export
class ErrorBoundaryImpl extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 mb-5">
            <Icon name="shield" size={28} className="text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-navy mb-2">Something went wrong</h2>
          <p className="text-sm text-royal/50 max-w-sm mb-6 leading-relaxed">
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="inline-flex items-center gap-2 rounded-xl bg-azure px-5 py-2.5 text-sm font-semibold text-white hover:bg-royal transition"
          >
            <Icon name="spinner" size={14} />
            Try again
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="mt-6 max-w-lg overflow-auto rounded-xl bg-cloud p-4 text-left text-xs text-red-700">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ErrorBoundary = ErrorBoundaryImpl as any;
