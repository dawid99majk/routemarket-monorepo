# Route Builder v2 vs Magic AI (Porównanie i Plan Podmiany)

## 1. Porównanie Stanów

| Funkcja | Stary Magic AI | Nowy Route Builder v2 (MVP) |
| :--- | :--- | :--- |
| **Zarządzanie sesją** | Automatyczne wznawianie (często błędne) | Czysty start na liście projektów |
| **Źródło prawdy** | Rozproszone (pliki + DB + localStorage) | Jedno źródło: Baza danych (Jobs table) |
| **Workflow** | Złożona maszyna stanu AI (zacinająca się) | Liniowy pipeline backendowy z pollingiem |
| **Generowanie GPX** | Blokuje się przy braku współrzędnych | Proaktywne propozycje na podstawie regionu |
| **Widoczność mapy** | Niska (cienkie linie, czarne tło) | Wysoka (styl Neon, jasny podkład, Leaflet fix) |
| **Interfejs** | Przeładowany (logi AI, boczne panele) | Minimalistyczny, pełnoekranowy |

## 2. Plan Podmiany (Switch-over)

Zalecane podejście: **BETA SIDE-BY-SIDE**

1.  Udostępnij v2 pod adresem `/route-builder-v2` dla wybranych twórców.
2.  Dodaj banner w starym panelu: "Wypróbuj nowy, szybszy generator tras (Beta)".
3.  Zbieraj logi z tabeli `route_builder_jobs` (kolumna `error_code`).
4.  Po tygodniu bez krytycznych błędów, przekieruj przycisk "Nowa trasa AI" na v2.

## 3. Checklist Rollbacku

W razie awarii v2:
1.  Zmień link w `Navigation.tsx` z powrotem na `/creator-ai-studio`.
2.  Zresetuj `localStorage` użytkowników (opcjonalnie).
3.  Stara wersja pozostaje nietknięta w katalogu `apps/atlas-engine`.

---
*Status v2: Gotowy do testów E2E.*
