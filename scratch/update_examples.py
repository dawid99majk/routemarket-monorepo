import re
import os

with open('apps/route-builder-api/src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

prompt_old = r"""Odpowiedz WYŁĄCZNIE W FORMACIE JSON \(bez markdown, czysty JSON\):

Przykład gdy pytasz o brakujący dystans:
\{
  "done": false,
  "reply": "Świetnie! Widzę pinezkę w okolicach Milicza i wybrany Gravel\. Jaki dystans planujesz — 25km, 40km, dłużej\?"
\}

Przykład gdy generujesz gotową pętlę \(done: true\) — WŁAŚCIWY OKRĄG:
\{
  "done": true,
  "reply": "Wytyczyłem rewelacyjną pętlę gravelową ~25km wokół Milicza! Trasa okrąża Stawy Milickie i wiedzie wzdłuż rzeki Barycz — mnóstwo szutru i brak asfaltu\. Sprawdź mapę!",
  "add_waypoints": \["Milicz", "Stawno \(stawy\), Milicz", "Jaz Grabownica, Milicz", "Postolin, Milicz", "Sułów, Milicz", "Milicz"\],
  "extracted": \{
    "start_point": "Milicz",
    "end_point": "Milicz",
    "route_type": "gravel",
    "distance": "25",
    "intent": "pętla gravelowa 25km Milicz Stawy Milickie Barycz",
    "loop": true,
    "key_waypoints": \["Stawno, Milicz", "Jaz Grabownica, Milicz", "Sułów, Milicz"\]
  \}
\}"""

prompt_new = """Odpowiedz WYŁĄCZNIE W FORMACIE JSON (bez markdown, czysty JSON):

Przykład 1: Brakuje dni i trudności (tylko hiking/city):
{
  "done": false,
  "reply": "Widzę start z Zakopanego. Na ile dni planujesz tę wędrówkę i jaki poziom trudności preferujesz (lekki, umiarkowany, wymagający)?"
}

Przykład 2: Pytasz o dystans (rower/moto):
{
  "done": false,
  "reply": "Mamy to, Gravel! Jaki dystans planujesz przejechać - 20km, 40km, a może dłużej?"
}

Przykład 3: Zebrano wszystko, pytasz o zatwierdzenie (done: false!):
{
  "done": false,
  "reply": "Zaplanuję 3-dniową umiarkowaną wędrówkę z Zakopanego, z dala od tłumów. Czy chcesz dodać coś jeszcze, czy mam wygenerować trasę?"
}

Przykład 4: Użytkownik zatwierdził -> generujesz JSON (done: true):
{
  "done": true,
  "reply": "Proszę bardzo! Wytyczyłem 3-dniową umiarkowaną trasę po Tatrach omijając najbardziej tłoczne miejsca. Sprawdź mapę!",
  "add_waypoints": ["Karpacz", "Schronisko Samotnia, Karpacz", "Śnieżka, Karkonosze", "Karpacz"],
  "extracted": {
    "start_point": "Karpacz",
    "end_point": "Karpacz",
    "route_type": "hiking",
    "distance": "48",
    "intent": "3 dni umiarkowany hiking z dala od tłumów",
    "loop": true,
    "key_waypoints": ["Schronisko Samotnia, Karpacz", "Śnieżka, Karkonosze"]
  }
}"""

content = re.sub(prompt_old, prompt_new, content)

with open('apps/route-builder-api/src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
