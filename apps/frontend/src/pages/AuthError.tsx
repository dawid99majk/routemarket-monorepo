import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function AuthError() {
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(3);
  const errorMessage = searchParams.get('msg') || 'Authentication information is invalid or has expired';

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); window.location.href = '/'; return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="space-y-6 max-w-md">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">Authentication Error</h1>
        <p className="text-muted-foreground">{errorMessage}</p>
        <p className="text-sm text-muted-foreground">
          {countdown > 0 ? <>Redirecting in <span className="text-primary font-semibold">{countdown}</span> seconds</> : 'Redirecting...'}
        </p>
        <Button onClick={() => { window.location.href = '/'; }}>Return to Home</Button>
      </div>
    </div>
  );
}
