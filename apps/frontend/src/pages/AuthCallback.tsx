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
        // Cel zapisany przed wyjsciem do Google. Sprawdzamy go tak samo jak
        // parametr z adresu: wartosc z sessionStorage tez moze byc podmieniona,
        // a przekierowanie na obcy adres byloby otwartym przekierowaniem.
        let cel = '/start';
        try {
          const zapisany = sessionStorage.getItem('rm_powrot_po_logowaniu');
          sessionStorage.removeItem('rm_powrot_po_logowaniu');
          if (zapisany && zapisany.startsWith('/') && !zapisany.startsWith('//')) cel = zapisany;
        } catch { /* tryb prywatny — zostaje wartosc domyslna */ }
        navigate(cel, { replace: true });
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
