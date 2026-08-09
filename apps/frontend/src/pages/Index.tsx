import { useNavigate } from 'react-router-dom';
import { CalendarDays, Compass, MapPin, Route as RouteIcon, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Strona główna planera. Poprzednia wersja była witryną sklepu z trasami —
 * po odejściu od modelu marketplace nie miała już czego sprzedawać.
 */
export default function Index() {
  const navigate = useNavigate();
  // Wcześniej strona pytała Supabase samodzielnie, a stan startowy brzmiał
  // „niezalogowany". Przez moment po wejściu zalogowany użytkownik widział
  // przycisk logowania, a kliknięcie CTA w tym oknie wyrzucało go na /auth.
  const { user, loading } = useAuth();
  const loggedIn = !!user;

  const start = () => {
    if (loading) return;
    navigate(loggedIn ? '/plany' : '/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            {/* Dopóki sesja się nie rozstrzygnie, nie pokazujemy żadnego z wariantów —
                mignięcie „Zaloguj się" u zalogowanego wyglądało jak wylogowanie. */}
            {loading ? null : loggedIn ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/plany')}>Plany</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/odkrywaj')}>Odkrywaj</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/ulubione')}>Ulubione</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/kolekcje')}>Kolekcje</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/my-routes')}>Moje trasy</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>Profil</Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>Zaloguj się</Button>
            )}
            <Button size="sm" onClick={start} className="bg-emerald-600 hover:bg-emerald-500">
              <Wand2 className="w-4 h-4 mr-1.5" /> Zaplanuj wyjazd
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
Wyjazdy układane pod Ciebie, nie pod średnią
          </h1>
          <p className="text-lg text-muted-foreground mt-5 max-w-2xl mx-auto leading-relaxed">
            Zbieraj miejsca, które chcesz zobaczyć, tygodniami albo w jeden wieczór.
            Kiedy będziesz gotowy, ułożymy z nich dni i wyznaczymy przebieg — z plikiem GPX i przewodnikiem.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Button size="lg" onClick={start} className="bg-emerald-600 hover:bg-emerald-500">
              <CalendarDays className="w-4 h-4 mr-2" /> Zacznij zbierać miejsca
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate(loggedIn ? '/odkrywaj' : '/auth')}>
              <Sparkles className="w-4 h-4 mr-2" /> Przeglądaj miejsca
            </Button>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 pb-24 grid gap-6 sm:grid-cols-3">
          {[
            {
              Icon: Compass,
              title: 'Agent, który zna teren',
              text: 'Zamiast odpytywać Cię z kilometrów, sam sprawdza, co jest w zasięgu, i proponuje warianty o różnym charakterze.'
            },
            {
              Icon: MapPin,
              title: 'Miejsca, które istnieją',
              text: 'Punkty pochodzą z OpenStreetMap i mają realne współrzędne oraz godziny otwarcia — nie z wyobraźni modelu.'
            },
            {
              Icon: RouteIcon,
              title: 'Plan, który się spina',
              text: 'Trasa jest sprawdzana pod kątem dystansu i czasu. Jeśli coś się nie mieści, dowiesz się wprost.'
            }
          ].map(({ Icon, title, text }) => (
            <div key={title} className="rounded-2xl border p-6">
              <Icon className="w-6 h-6 text-emerald-600" />
              <h2 className="font-semibold mt-4">{title}</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{text}</p>
            </div>
          ))}
        </section>

        <section className="border-t bg-muted/30">
          <div className="max-w-5xl mx-auto px-4 py-16 text-center">
            <Sparkles className="w-8 h-8 text-emerald-600 mx-auto" />
            <h2 className="text-2xl font-bold mt-4">Zacznij od jednego miejsca</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Wpisz „Tirana" i dorzuć pierwszą rzecz, którą chcesz zobaczyć. Resztę możesz dokładać tygodniami —
              tablica poczeka, a plan powstanie wtedy, kiedy będziesz gotowy.
            </p>
            <Button size="lg" onClick={start} className="mt-6 bg-emerald-600 hover:bg-emerald-500">
              Zacznij zbierać miejsca
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-wrap gap-4 justify-between text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} RouteMarket</span>
          <div className="flex gap-4">
            <button onClick={() => navigate('/legal/terms')} className="hover:text-foreground">Regulamin</button>
            <button onClick={() => navigate('/legal/privacy')} className="hover:text-foreground">Prywatność</button>
            <button onClick={() => navigate('/contact')} className="hover:text-foreground">Kontakt</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
