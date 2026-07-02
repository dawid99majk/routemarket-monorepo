import React, { Component, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', fontFamily: 'sans-serif', height: '100vh', width: '100vw' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Wystąpił błąd aplikacji!</h1>
          <p style={{ marginBottom: '16px' }}>Zrób zrzut ekranu i wyślij go programiście:</p>
          <pre style={{ backgroundColor: '#fef2f2', padding: '16px', borderRadius: '8px', overflow: 'auto', border: '1px solid #fca5a5' }}>
            {this.state.error?.toString()}
            {'\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
