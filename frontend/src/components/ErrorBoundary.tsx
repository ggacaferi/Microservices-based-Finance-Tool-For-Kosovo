import React from 'react';

interface State { hasError: boolean; message: string; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#ef4444', fontFamily: 'monospace' }}>
          <strong>Something went wrong rendering this page.</strong>
          <pre style={{ marginTop: '1rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
            {this.state.message}
          </pre>
          <button
            style={{ marginTop: '1rem', padding: '0.5rem 1.25rem', cursor: 'pointer' }}
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
