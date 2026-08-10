import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PlannerHeader from '@/components/PlannerHeader';
import TripProjects from '@/components/TripProjects';

/**
 * Tablica i plan wyjazdu. Szerokość 1400 px, bo projekt zakłada trzy kolumny
 * kubełków obok siebie, a przy 1024 px karta miejsca robiła się węższa niż
 * własny rząd przycisków.
 */
export default function TripPlans() {
  const [initials, setInitials] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      const name = (data.user?.user_metadata as any)?.full_name as string | undefined;
      if (name) setInitials(name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase());
      else if (email) setInitials(email.slice(0, 2).toUpperCase());
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PlannerHeader context={context} initials={initials} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <TripProjects onContextChange={setContext} />
      </main>
    </div>
  );
}
