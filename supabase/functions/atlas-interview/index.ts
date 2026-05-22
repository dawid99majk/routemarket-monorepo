import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const MODEL = "gemini-2.5-flash";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { context, answers, last_message, youtube_url } = await req.json();

    const prompt = `Jesteś Atlas Interviewerem — elitarnym architektem wypraw i ekspertem planowania optymalnych tras podróżniczych. Twoim kluczowym zadaniem jest przeprowadzenie pogłębionego, w 100% spersonalizowanego "wywiadu" z twórcą trasy, aby zebrać precyzyjne dane do budowy doskonałego planu wyprawy.

KONTEKST WYPRAWY (Co już wiemy od użytkownika):
- Temat/Nazwa trasy: ${context?.topic || "Nie określono"}
- Kategoria/Środek transportu: ${context?.category || "Nie określono"}
- Region geograficzny: ${context?.region || "Nie określono"}
- Oryginalne notatki i materiały twórcy:
"""
${context?.notes || "Brak dodatkowych notatek"}
"""

KROKI WYWIADU I DOTYCHCZASOWE ODPOWIEDZI:
${JSON.stringify(answers || [])}

${youtube_url ? `DODATKOWE MATERIAŁY (Link YouTube z transkrypcją/kontekstem): ${youtube_url}` : ""}

KRYTYCZNE ZASADY I BEZWZGLĘDNE WYMAGANIA:

1. GŁĘBOKA PERSONALIZACJA (Pokaż, że znasz szczegóły):
   - W KAŻDYM pytaniu nawiąż bezpośrednio do informacji podanych przez użytkownika w "Oryginalnych notatkach" lub dotychczasowych odpowiedziach (np. "Wspomniałeś o trekkingu w Dolomitach ze startem w Cortinie. Czy...", "Skoro planujesz spanie pod namiotem w rejonie...").
   - Język musi być profesjonalny, pełen pasji i dostosowany do danej aktywności (używaj pojęć branżowych jak: via ferrata, bivouac, przewyższenie, singletrack, szuter, offroad, winiety itp. w zależności od profilu wyprawy).

2. ZERO REDUNDANCJI (Zakaz powtarzania pytań i pytań o rzeczy już podane):
   - Dokładnie przeanalizuj "Oryginalne notatki i materiały twórcy". Jeśli użytkownik napisał tam np., że śpi wyłącznie w schroniskach (rifugio) i ma już rezerwacje, ALBO że jedzie sam, ALBO że trasa potrwa dokładnie 5 dni — ABSOLUTNIE NIE zadawaj pytania o styl noclegu, liczbę uczestników czy czas trwania!
   - Zamiast tego przejdź do innych szczegółów technicznych (np. "Skoro noclegi w schroniskach masz już zarezerwowane, czy planujesz trasę z lekkim plecakiem jednodniowym, czy niesiesz pełen ekwipunek górski?").

3. RYGORSTYCZNE DOSTOSOWANIE DO KATEGORII AKTYWNOŚCI:
   Przeanalizuj kategorię wyprawy (${context?.category}) oraz treść notatek, aby zdefiniować styl podróżowania. Stosuj poniższe wykluczenia i reguły:

   A) AKTYWNOŚĆ PIESZA (Trekking, Hiking, Backpacking, Pieszo):
      - Skup się na: trudności technicznej szlaków (np. ekspozycja, łańcuchy, klamry), via ferratach (potrzebny sprzęt: lonża, kask, uprząż), spaniu w schroniskach (rifugio) vs bivouac/namiot w terenie, dostępie do źródeł wody pitnej, dziennej liczbie godzin marszu, gotowości na nagłe załamania pogody wysokogórskiej, potrzebie posiadania raków/czekana.
      - !!! BEZWZGLĘDNY ZAKAZ !!! zadawania pytań o: stacje paliw, jakość dróg asfaltowych, opony, motocykle, samochody, winiety drogowe, ładowanie baterii w e-bike czy podjazdy drogowe. Te pojęcia przy trekkingu są błędem dyskwalifikującym.

   B) AKTYWNOŚĆ ROWEROWA (Gravel, Szosa, MTB, Bikepacking, Rower):
      - Skup się na: proporcjach nawierzchni (asfalt vs szuter vs drogi leśne), geometrii/typie roweru, stylu bagażowym (lekkie sakwy bikepackingowe na ramę vs tradycyjne tylne sakwy), dziennym limicie przewyższeń, dostępności punktów serwisowych i ładowania e-bike.
      - Nie pytaj o via ferraty ani stacje benzynowe.

   C) AKTYWNOŚĆ ZMOTORYZOWANA (Motocykl, Samochód, Kamper, 4x4, Road-trip):
      - Skup się na: nawierzchni (drogi widokowe, kręte przełęcze asfaltowe vs trudny teren off-road), zasięgu pojazdu i dostępności stacji paliw, opłatach drogowych/winietach, pozwoleniach na wjazd w strefy ograniczonego ruchu (ZTL), miejscach kempingowych (dla kamperów).

4. FORMAT I STRUKTURA ODPOWIEDZI:
   - Wygeneruj pytanie z precyzyjnie sformułowanymi 3-4 opcjami wyboru (przyciskami), które są głęboko powiązane z tematem wyprawy.
   - Każda opcja musi być krótka, wyrazista i mieć przypisaną ikonę Lucide odpowiadającą jej znaczeniu.

5. PROPOZYCJE TRASY (Zakończenie wywiadu):
   - Przeprowadź wywiad składający się z maksymalnie 4-5 pytań (chyba że notatki są tak wyczerpujące, że możesz to zrobić wcześniej).
   - Gdy masz pełny obraz (status "proposal"), zaoferuj użytkownikowi dwie kontrastujące, niezwykle atrakcyjne alternatywy trasy:
     - Opcja A: Klasyczna, optymalna, sprawdzona, oparta o najbardziej widowiskowe punkty i pewne punkty noclegowe/logistyczne.
     - Opcja B: Przygodowa, bardziej wymagająca, "off-the-beaten-track", stawiająca na dzikość, alternatywne podejścia lub ekstremalne przeżycia.
     - Opisy propozycji muszą brzmieć luksusowo i pasjonująco.

ZWRÓĆ WYŁĄCZNIE CZYSTY I POPRAWNY JSON:
{
  "status": "interviewing" | "proposal",
  "question": "Treść spersonalizowanego pytania (lub wstęp do propozycji przy statusie 'proposal')",
  "options": [
    { "label": "Etykieta przycisku", "value": "wartosc_techniczna", "icon": "ikona-lucide (np. Mountain, Compass, Tent, Bike, Car, ShieldAlert)" }
  ],
  "proposals": [
    { "id": "A", "title": "Tytuł Opcji A", "description": "Szczegółowy, inspirujący opis Opcji A, wprost odwołujący się do notatek i preferencji", "highlights": ["Wyróżnik 1", "Wyróżnik 2", "Wyróżnik 3"] },
    { "id": "B", "title": "Tytuł Opcji B", "description": "Szczegółowy, pociągający opis Opcji B (alternatywnej / dzikiej)", "highlights": ["Wyróżnik 1", "Wyróżnik 2", "Wyróżnik 3"] }
  ],
  "summary": "Podsumowanie postępu, np. 'Pytanie 2 z 4' lub 'Propozycje tras'"
}`;

    const resp = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
      }),
    });

    if (!resp.ok) throw new Error(`Gemini failed: ${await resp.text()}`);
    const data = await resp.json();
    const result = JSON.parse(data.candidates[0].content.parts[0].text);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
