// Top-level safety net: a render-time throw anywhere below would otherwise blank
// the whole page. React error boundaries must be class components — there is no
// hook equivalent.

import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="panel center" role="alert">
        <p className="error">Something broke while loading the puzzle.</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => location.reload()}
        >
          Reload
        </button>
      </section>
    );
  }
}
