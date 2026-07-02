"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 bg-red-50/50 rounded-xl border border-red-100 dark:bg-red-950/20 dark:border-red-900/50 mx-4 my-8">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-red-900 dark:text-red-400 mb-2">Something went wrong</h2>
          <p className="text-red-700 dark:text-red-500/80 mb-6 text-center max-w-md">
            The application encountered an unexpected error. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
