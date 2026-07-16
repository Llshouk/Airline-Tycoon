"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onFallback: () => void;
  unavailableLabel: string;
  returnTo2dLabel: string;
};

type State = { hasError: boolean };

export class GlobeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Globe] Render failed", error, errorInfo);
    }
    this.props.onFallback();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-white">
        <p className="text-base font-black">{this.props.unavailableLabel}</p>
        <button type="button" onClick={this.props.onFallback} className="rounded-md bg-white px-4 py-2 text-sm font-black text-ink shadow-soft">
          {this.props.returnTo2dLabel}
        </button>
      </div>
    );
  }
}
