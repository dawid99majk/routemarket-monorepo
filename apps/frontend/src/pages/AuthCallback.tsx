import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        navigate('/auth/error?msg=' + encodeURIComponent(error?.message || 'Authentication failed'));
      } else {
        navigate('/');
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Przetwarzanie logowania...</p>
      </div>
    </div>
  );
}
