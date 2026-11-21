import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from './index';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React component tree:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-8 shadow-xl text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-black text-slate-900">Something went wrong</h2>
              <p className="text-xs text-slate-500">
                An unexpected error occurred in this view.
              </p>
            </div>

            {this.state.error && (
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-left">
                <p className="text-xs font-mono font-bold text-rose-800 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="pt-2 flex items-center justify-center gap-3">
              <Button onClick={this.handleReset} className="rounded-xl font-bold shadow-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reload Page
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="rounded-xl font-bold shadow-xs"
              >
                <Home className="h-3.5 w-3.5 mr-1.5" />
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
