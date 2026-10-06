import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiGet, apiPost } from '@/lib/api';

interface Zdjecie { id: string; miejsce: string; url: string; thumb_url: string; caption: string | null; moderacja: { ocena?: string }; report_count: number; created_at: string }
interface Miejsce { id: string; name: string; city: string | null; category: string; description: string; website: string | null; lat: number; lng: number; created_at: string }

/** Kolejka przeglądu: zdjęcia i miejsca od użytkowników, które zatrzymała kontrola albo zgłoszenia. */
export default function AdminWklad() {
  const [zdjecia, setZdjecia] = useState<Zdjecie[] | null>(null);
  const [miejsca, setMiejsca] = useState<Miejsce[] | null>(null);
  const [zajete, setZajete] = useState<string | null>(null);

  const wczytaj = useCallback(async () => {
    try {
      const d = await apiGet<{ zdjecia: Zdjecie[]; miejsca: Miejsce[] }>('/admin/wklad');
      setZdjecia(d.zdjecia); setMiejsca(d.miejsca);
    } catch (e: any) { toast.error(e?.message ?? 'Nie udało się wczytać kolejki'); }
  }, []);
  useEffect(() => { void wczytaj(); }, [wczytaj]);

  const decyduj = async (rodzaj: 'zdjecie' | 'miejsce', id: string, akcja: 'zatwierdz' | 'odrzuc') => {
    setZajete(id);
    try { await apiPost(`/admin/wklad/${rodzaj}/${id}/${akcja}`, {}); await wczytaj(); }
    catch (e: any) { toast.error(e?.message ?? 'Nie udało się zapisać decyzji'); }
    finally { setZajete(null); }
  };

  return (
    <div className="space-y-10 max-w-4xl">
      <section>
        <h1 className="font-display text-[28px]">Zdjęcia do przeglądu {zdjecia ? `(${zdjecia.length})` : ''}</h1>
        {zdjecia?.length === 0 && <p className="text-muted-foreground mt-3">Kolejka jest pusta.</p>}
        <ul className="mt-4 space-y-4">
          {zdjecia?.map((z) => (
            <li key={z.id} className="flex gap-4 rounded-md bg-card shadow-token-sm p-3">
              <a href={z.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src={z.thumb_url} alt="" className="w-40 h-32 object-cover rounded-md bg-muted" />
              </a>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{z.miejsce}</p>
                {z.caption && <p className="text-sm text-muted-foreground">„{z.caption}”</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {z.moderacja?.ocena ?? 'zgłoszone przez użytkowników'} · zgłoszeń: {z.report_count} · {new Date(z.created_at).toLocaleString('pl-PL')}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" disabled={zajete === z.id} onClick={() => decyduj('zdjecie', z.id, 'zatwierdz')}>Opublikuj</Button>
                  <Button size="sm" variant="outline" disabled={zajete === z.id} onClick={() => decyduj('zdjecie', z.id, 'odrzuc')}>Usuń</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-[28px]">Miejsca do przeglądu {miejsca ? `(${miejsca.length})` : ''}</h2>
        {miejsca?.length === 0 && <p className="text-muted-foreground mt-3">Kolejka jest pusta.</p>}
        <ul className="mt-4 space-y-4">
          {miejsca?.map((m) => (
            <li key={m.id} className="rounded-md bg-card shadow-token-sm p-3">
              <p className="font-medium">{m.name} <span className="text-muted-foreground font-normal">· {m.city ?? '—'} · {m.category}</span></p>
              {m.description && <p className="text-sm mt-1 text-pretty">{m.description}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                <a className="underline" target="_blank" rel="noopener noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lng}#map=17/${m.lat}/${m.lng}`}>{m.lat.toFixed(4)}, {m.lng.toFixed(4)}</a>
                {m.website && <> · <a className="underline" target="_blank" rel="noopener noreferrer" href={m.website}>{m.website}</a></>}
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" disabled={zajete === m.id} onClick={() => decyduj('miejsce', m.id, 'zatwierdz')}>Opublikuj</Button>
                <Button size="sm" variant="outline" disabled={zajete === m.id} onClick={() => decyduj('miejsce', m.id, 'odrzuc')}>Odrzuć</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
