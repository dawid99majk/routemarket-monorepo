/**
 * Jeden głos dla wszystkich opisów miejsc, które pisze model.
 *
 * Trzy prompty (katalog miasta, wyszukiwanie agenta, szczegóły punktów trasy)
 * prosiły o „magnetyczne, pełne zmysłów” opisy w stylu Monocle i Conde Nast —
 * i model dokładnie to dawał: karty pełne atmosfery, światła i zapachów, z których
 * nie dało się wyczytać, co w tym miejscu się robi i ile to trwa. Produkt obiecuje
 * plan realny, z godzinami, które się zgadzają; opis, który przesadza, podważa tę
 * obietnicę na każdej karcie. Reguły poniżej są skrótem głosu marki
 * (skill routemarket-glos: liczba zamiast przymiotnika, ograniczenie powiedziane
 * od razu, żadnych superlatyw i wykrzykników).
 */
export const STYL_OPISU = `STYL OPISU — pisz jak ktoś, kto tam był i mówi znajomemu, czego się spodziewać:
- Konkret zamiast przymiotnika: co tam jest, co się tam robi, ile to trwa, czy potrzebny bilet, kiedy jest tłok. Liczbę podaj tylko wtedy, gdy jesteś jej pewien.
- Bez poezji: żadnych „szeptów historii”, „magii”, „oaz spokoju”, „tętniącego serca miasta” ani światła i zapachów dopisanych dla efektu.
- Zakazane słowa: niesamowity, wyjątkowy, magiczny, zachwycający, urzekający, niezapomniany, must-see, perła, raj. Żadnych wykrzykników ani emoji.
- Jeśli znasz ograniczenie (stromo, tłoczno w południe, wejście tylko z przewodnikiem), powiedz je od razu — lepiej teraz niż na miejscu.
- Nie wymyślaj faktów. Gdy miejsca nie znasz dobrze, napisz krócej i ogólniej, na podstawie jego rodzaju.`;
