import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

export interface OpisPelny {
  opis: string;
  co_zobaczyc: string[];
  praktyka: { czas_min?: number | null; bilet?: string | null; kiedy?: string | null; tlok?: string | null; ograniczenia?: string | null };
  ciekawostki: string[];
  zrodla: { url: string; tytul?: string }[];
  opis_i18n?: Record<string, string>;
}

/**
 * Rozszerzony opis miejsca (tabela place_opisy): napisany po polsku, sprawdzony przed
 * publikacją. Dla innych języków pokazujemy go dopiero, gdy ma tłumaczenie — polski
 * akapit na stronie niemieckiej jest gorszy niż krótki opis z katalogu.
 */
export function useOpisPelny(placeId?: string): OpisPelny | null {
  const { i18n } = useTranslation();
  const [dane, setDane] = useState<OpisPelny | null>(null);
  useEffect(() => {
    setDane(null);
    if (!placeId) return;
    let aktualne = true;
    (supabase as any).from('place_opisy')
      .select('opis, co_zobaczyc, praktyka, ciekawostki, zrodla, opis_i18n').eq('place_id', placeId).maybeSingle()
      .then(({ data }: { data: OpisPelny | null }) => { if (aktualne && data) setDane(data); });
    return () => { aktualne = false; };
  }, [placeId]);
  if (!dane) return null;
  const jezyk = (i18n.language || 'pl').split('-')[0];
  if (jezyk === 'pl') return dane;
  const tlumaczenie = dane.opis_i18n?.[jezyk];
  return tlumaczenie ? { ...dane, opis: tlumaczenie } : null;
}

/** Część pod akapitem: co zobaczyć, informacje praktyczne, ciekawostki, źródła. */
export default function OpisPelnySzczegoly({ dane }: { dane: OpisPelny }) {
  const { t } = useTranslation();
  const p = dane.praktyka ?? {};
  const wiersze: [string, string | null | undefined][] = [
    [t('miejsce.praktyka_czas'), p.czas_min ? t('miejsce.praktyka_minuty', { count: p.czas_min }) : null],
    [t('miejsce.praktyka_bilet'), p.bilet],
    [t('miejsce.praktyka_kiedy'), p.kiedy],
    [t('miejsce.praktyka_tlok'), p.tlok],
    [t('miejsce.praktyka_uwaga'), p.ograniczenia],
  ];
  const widoczne = wiersze.filter(([, v]) => v);
  const domeny = [...new Set((dane.zrodla ?? []).map((z) => { try { return new URL(z.url).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean) as string[])];

  return (
    <div className="mt-8 space-y-8 max-w-[60ch]">
      {dane.co_zobaczyc?.length > 0 && (
        <section>
          <h2 className="font-display text-[20px]">{t('miejsce.co_zobaczyc_tytul')}</h2>
          <ul className="mt-3 space-y-2 text-[16px] leading-snug list-disc pl-5 marker:text-muted-foreground">
            {dane.co_zobaczyc.map((c) => <li key={c} className="text-pretty">{c}</li>)}
          </ul>
        </section>
      )}

      {widoczne.length > 0 && (
        <section>
          <h2 className="font-display text-[20px]">{t('miejsce.przed_wyjazdem')}</h2>
          <dl className="mt-3 divide-y divide-border border-y border-border">
            {widoczne.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-4 py-2.5 text-[15px]">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-pretty">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12.5px] text-muted-foreground mt-2 text-pretty">{t('miejsce.praktyka_sprawdz')}</p>
        </section>
      )}

      {dane.ciekawostki?.length > 0 && (
        <section>
          <h2 className="font-display text-[20px]">{t('miejsce.ciekawostki')}</h2>
          <ul className="mt-3 space-y-2 text-[16px] leading-snug list-disc pl-5 marker:text-muted-foreground">
            {dane.ciekawostki.map((c) => <li key={c} className="text-pretty">{c}</li>)}
          </ul>
        </section>
      )}

      {domeny.length > 0 && (
        <p className="text-[12.5px] text-muted-foreground text-pretty">
          {t('miejsce.zrodla_opisu')}: {dane.zrodla.map((z, i) => {
            let h = ''; try { h = new URL(z.url).hostname.replace(/^www\./, ''); } catch { return null; }
            return <span key={z.url}>{i > 0 && ', '}<a href={z.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:no-underline">{h}</a></span>;
          })}
        </p>
      )}
    </div>
  );
}
