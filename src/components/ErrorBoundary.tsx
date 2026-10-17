/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Last line of defence. Unvalidated AI output, malformed saved plans, or a
 * render-time TypeError in one panel would otherwise unmount the whole app and
 * leave a blank page with no recovery path.
 */

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Shown instead of the default card, if you want a lighter treatment. */
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[LandCraft] Render error caught by boundary:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900 border border-red-900/50 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-3 text-red-400">
            <AlertTriangle className="w-6 h-6" />
            <h1 className="text-base font-bold">Something went wrong</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            LandCraft hit an unexpected error while drawing the editor. Your plan may not be saved — if you
            have an exported JSON copy, you can reload and re-open it.
          </p>
          <pre className="text-[10px] font-mono bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-auto max-h-40 text-slate-500 whitespace-pre-wrap">
            {error.message}
          </pre>
          <button
            onClick={this.handleReload}
            className="mt-4 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reload Editor
          </button>
        </div>
      </div>
    );
  }
}
