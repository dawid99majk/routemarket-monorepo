import { describe, it, expect } from 'vitest';
import { bilansTablicy, odstajace, maPosilek } from '@/lib/bilansTablicy';

/** Punkty w centrum Wrocławia — blisko siebie, żeby rozrzut nie zafałszował testów. */
const wCentrum = (ile: number, category = 'attraction') =>
  Array.from({ length: ile }, (_, i) => ({
    lat: 51.11 + i * 0.001,
    lng: 17.03 + i * 0.001,
    category,
    visit_minutes: 60,
    priority: 'must',
  }));

describe('odstajace', () => {
  it('nie orzeka o rozrzucie przy mniej niż czterech punktach', () => {
    // Trzy punkty, jeden bardzo daleko — za mało danych, żeby cokolwiek twierdzić.
    const miejsca = [...wCentrum(2), { lat: 52.23, lng: 21.01, category: 'attraction' }];
    expect(odstajace(miejsca)).toHaveLength(0);
  });

  it('wskazuje punkt oddalony od mediany', () => {
    const miejsca = [...wCentrum(5), { lat: 52.23, lng: 21.01, category: 'attraction' }];
    expect(odstajace(miejsca)).toHaveLength(1);
  });

  it('mediana nie daje się przeciągnac pojedynczemu odstajacemu', () => {
    // Gdyby liczyć średnią, punkt w Warszawie przesunąłby środek na tyle,
    // że sam przestałby wyglądać na odstający.
    const miejsca = [...wCentrum(4), { lat: 52.23, lng: 21.01, category: 'attraction' }];
    const wynik = odstajace(miejsca);
    expect(wynik).toHaveLength(1);
    expect(wynik[0].lat).toBeCloseTo(52.23, 2);
  });

  it('ignoruje miejsca bez wspolrzednych', () => {
    const miejsca = [...wCentrum(4), { lat: null, lng: null, category: 'attraction' }];
    expect(odstajace(miejsca)).toHaveLength(0);
  });
});

describe('maPosilek', () => {
  it('rozpoznaje kategorie katalogu', () => {
    expect(maPosilek([{ category: 'food' }])).toBe(true);
    expect(maPosilek([{ category: 'cafe' }])).toBe(true);
  });

  it('rozpoznaje nazwy po polsku, bo agent dopisuje wlasne', () => {
    expect(maPosilek([{ category: 'Restauracja' }])).toBe(true);
  });

  it('atrakcja to nie posilek', () => {
    expect(maPosilek(wCentrum(3))).toBe(false);
  });
});

describe('bilansTablicy — kolejnosc waznosci', () => {
  it('pusta tablica nie dostaje komentarza', () => {
    expect(bilansTablicy({ aktywne: [], pewnych: 0, doRozwazenia: 0 })).toBeNull();
  });

  it('przeladowanie wygrywa ze wszystkim innym', () => {
    // Tablica jest jednoczesnie przeladowana, rozrzucona i bez jedzenia.
    const u = bilansTablicy({
      aktywne: [...wCentrum(5), { lat: 52.23, lng: 21.01, category: 'attraction' }],
      pewnych: 6, doRozwazenia: 0, dni: 2,
      zajeteMinut: 900, planowaneMinut: 600,
    });
    expect(u?.rodzaj).toBe('przeladowane');
    // Obie liczby musza byc w zdaniu: "za duzo" bez punktu odniesienia nic nie mowi.
    expect(u?.tekst).toContain('15,0 h');
    expect(u?.tekst).toContain('10,0 h');
    expect(u?.tekst).toContain('5,0 h');
  });

  it('rozrzut wygrywa z brakiem jedzenia', () => {
    const u = bilansTablicy({
      aktywne: [...wCentrum(5), { lat: 52.23, lng: 21.01, category: 'attraction' }],
      pewnych: 6, doRozwazenia: 0, dni: 2,
      zajeteMinut: 300, planowaneMinut: 600,
    });
    expect(u?.rodzaj).toBe('rozrzut');
  });

  it('brak posilku zglaszany, gdy geografia i czas sa w porzadku', () => {
    const u = bilansTablicy({
      aktywne: wCentrum(6), pewnych: 6, doRozwazenia: 0, dni: 2,
      zajeteMinut: 300, planowaneMinut: 600,
    });
    expect(u?.rodzaj).toBe('brak_jedzenia');
  });

  it('majac posilek i komplet punktow — gotowe do ulozenia', () => {
    const u = bilansTablicy({
      aktywne: [...wCentrum(5), { lat: 51.111, lng: 17.031, category: 'food' }],
      pewnych: 6, doRozwazenia: 0, dni: 2,
      zajeteMinut: 300, planowaneMinut: 600,
    });
    expect(u?.rodzaj).toBe('gotowe');
  });

  it('za malo kotwic liczone wzgledem liczby dni', () => {
    const u = bilansTablicy({
      aktywne: [...wCentrum(2), { lat: 51.111, lng: 17.031, category: 'food' }],
      pewnych: 2, doRozwazenia: 1, dni: 4,
      zajeteMinut: 180, planowaneMinut: 900,
    });
    expect(u?.rodzaj).toBe('za_malo');
    expect(u?.tekst).toContain('4 dni');
  });

  it('bez ram czasowych nie orzeka o przeladowaniu', () => {
    // Wyjazd bez dni i godzin nie ma jak byc przeladowany — nie ma z czym porownac.
    const u = bilansTablicy({
      aktywne: wCentrum(6), pewnych: 6, doRozwazenia: 0,
      zajeteMinut: null, planowaneMinut: null,
    });
    expect(u?.rodzaj).not.toBe('przeladowane');
  });

  it('zadne zdanie nie konczy sie wykrzyknikiem', () => {
    const przypadki = [
      { aktywne: wCentrum(6), pewnych: 6, doRozwazenia: 0, dni: 2, zajeteMinut: 300, planowaneMinut: 600 },
      { aktywne: wCentrum(6), pewnych: 6, doRozwazenia: 0, dni: 2, zajeteMinut: 900, planowaneMinut: 600 },
      { aktywne: wCentrum(1), pewnych: 1, doRozwazenia: 0, dni: 3, zajeteMinut: 60, planowaneMinut: 600 },
    ];
    for (const p of przypadki) {
      expect(bilansTablicy(p)?.tekst).not.toMatch(/!/);
    }
  });
});
