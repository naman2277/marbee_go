import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = { error: Error | null };

export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Campaign canvas error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-red-500/30 bg-red-950/20 p-8 text-center">
            <p className="text-sm font-semibold text-red-200">Campaign editor failed to load</p>
            <p className="mt-2 max-w-md text-xs text-red-300/80">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded-lg bg-red-900/50 px-4 py-2 text-xs text-red-200 hover:bg-red-900"
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
