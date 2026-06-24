import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface to console so it shows up in dev/preview logs.
     
    console.error('[RouteErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-semibold">Nie udało się otworzyć tej strony</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.error.message || 'Wystąpił nieoczekiwany błąd.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => (window.location.href = '/creator-routes')}>
              Moje trasy
            </Button>
            <Button onClick={() => window.location.reload()}>Odśwież</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
