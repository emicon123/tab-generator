# Nuty i tabulatura

## Cel strony

**Najważniejszy cel tej strony to ostatecznie drukowanie tabulatur.** Ekran jest podglądem i miejscem do poprawek, a to, co ma wyjść na papierze, jest na pierwszym miejscu przy każdej decyzji o wyglądzie.
Z tego wynikają zasady, których trzymamy się przy zmianach:

- **Tabulatura jest głównym punktem do skupienia.** Cyfry i linie tabulatury są czarne i wyraźne, a wszystko inne w systemach (nuty na pięciolinii, litery nut, słowa piosenki, nazwy akordów, numery taktów) jest delikatnie szare (panel „Pokaż”, „Poza tabulaturą”).
- **Podgląd ma wyglądać dokładnie jak wydruk:** karta ma szerokość pola druku na kartce A4, podział na strony pokazuje linia przerywana, a każdy dodatek (słowa, litery, szarość, ukrywanie elementów) musi trafiać też na papier.
- **Czytelność ponad upchnięcie:** lepiej rozłożyć utwór na kilka stron z większymi nutami niż zmieścić go na jednej kartce. Rozmiary ustawia się w panelu „Rozmiary”.
- Nowy dodatek jest skończony dopiero wtedy, gdy sprawdzono go w PDF (podgląd wydruku), a nie tylko na ekranie.

Aplikacja wyświetla nuty i tabulatury z zapisu tekstowego **AlphaTex**, zapisuje utwory jako pliki na dysku i pozwala je poprawiać kliknięciem na karcie. Rendering robi [alphaTab](https://www.alphatab.net).

## Uruchomienie

```bash
npm start          # http://localhost:8765, w sieci lokalnej: http://<adres-raspberry>:8765
```

`npm start` uruchamia mały serwer (`server.mjs`, sam Node, bez zależności). Biblioteka i fonty leżą w `public/lib` i `public/fonts`, więc aplikacja działa offline.
Katalog `node_modules` jest potrzebny tylko, jeśli chcesz zaktualizować alphaTab (skopiuj `alphaTab.min.js` i `font/` z `dist`).

## Utwory na dysku

Każdy utwór to zwykły plik tekstowy w katalogu `songs/` (np. `songs/cicha-noc.alphatex`). Zmiany zapisują się same, kilka sekund po ostatniej poprawce
(napis „Zapisano” obok listy utworów), zarówno po pisaniu w edytorze, jak i po kliknięciach na karcie. Utwór wybierasz z listy w lewym górnym rogu,
a „Nowy utwór” zakłada plik z czterema pustymi taktami. Pliki możesz kopiować, archiwizować i usuwać ręcznie, bez żadnej bazy.

Serwer zapisuje pliki każdemu, kto ma dostęp do adresu w sieci lokalnej. Nie wystawiaj go do internetu.

## Jak z tego korzystać

1. **Ze zrzutu ekranu:** „Nowy utwór”, potem „Skopiuj prompt dla LLM”. Wklej prompt do czatu razem ze zdjęciem nut lub tabulatury, a odpowiedź (kod AlphaTex) wklej do edytora po lewej.
2. **Ręcznie:** pisz w edytorze, podgląd odświeża się na bieżąco.
3. **Z pliku:** „Otwórz plik” zapisuje `.alphatex` lub `.txt` jako nowy utwór (nie nadpisuje otwartego). Pliki Guitar Pro (`.gp3`–`.gp`, `.gpx`) i MusicXML są tylko do podglądu i druku, bez zapisu.
4. **Druk:** przycisk „Drukuj” otwiera okno drukowania przeglądarki (stamtąd też „Zapisz jako PDF”). W oknie zostaw skalę 100% i marginesy domyślne, bo strona ma już własne marginesy 10 mm.
   **„Druk dwustronny”** robi to samo, ale po każdej stronie z pełnymi nutami drukuje jej odwrót z **samą tabulaturą** tych samych taktów (bez nut, liter, słów i akordów). W oknie drukowania włącz druk dwustronny (obie strony kartki), wtedy strona i jej odwrót wypadną na jednej kartce.
   Przy drukarce bez druku dwustronnego strony wychodzą po kolei (przód, odwrót, przód, odwrót), więc kartki można odwracać ręcznie. Przycisk działa w widoku „Nuty + tab”.

Widok można przełączyć na samą tabulaturę albo same nuty, a liczbę taktów w wierszu i rozmiar ustawić na pasku u góry.

## Strony i rozmiary

Karta ma szerokość pola druku na kartce A4 (190 mm), więc to, co widzisz, jest tym, co wydrukujesz. Obok listy utworów jest licznik stron („2 strony A4”),
a linia przerywana „Strona 2” pokazuje, gdzie zacznie się kolejna strona. Żaden system (rząd nut) nie jest dzielony między strony.

Przycisk „Rozmiary” otwiera panel (zostaje otwarty, więc zmiany widać od razu na karcie):

- **Nuty i pięciolinia:** skala całej notacji (50–200%). To samo ustawiają przyciski − i + w belce.
- **Litery nut, słowa piosenki, nazwy akordów, tytuł:** osobne rozmiary w pikselach.
- **Odstęp pięciolinia–tabulatura:** rozsuwa te dwa rzędy (domyślnie 10 px, 0–48 px). Nie zmienia odstępu pod tabulaturą.
- **Systemów na stronie:** „tyle, ile się zmieści” albo stała liczba (2–8). Przy większych nutach utwór rozkłada się na więcej stron.
- „Przywróć domyślne” cofa wszystkie rozmiary. Takty w wierszu wybierasz w belce.

Rozmiary pamiętają się w przeglądarce. Duże litery i słowa w gęstych taktach mogą na siebie nachodzić. Wtedy zmniejsz je albo ustaw mniej taktów w wierszu.

## Co pokazywać na karcie

Przycisk „Pokaż” otwiera panel z przełącznikami. Ukrywają one tylko wyświetlanie na karcie i wydruku, a zapis utworu (tekst po lewej) zostaje bez zmian, więc np. akordy dalej są w pliku, tylko się nie rysują.
Wybór pamięta się w przeglądarce i dotyczy wszystkich utworów.

- Tytuł i podtytuł, tempo, nazwy akordów nad nutami, diagramy akordów, nazwy części (np. Refren), numery taktów.
- **Litery nut:** włączają podpisy pod pięciolinią. Obok wybierasz `C D E F G A H` (polskie nazwy, gdzie „si” to H) albo `C D E F G A B` (angielskie). Nuta przedłużona ligaturą dostaje literę tylko raz.
- **Słowa piosenki:** rysuję je własnym kodem pod każdym taktem tabulatury, więc leżą w jednakowej odległości od niej w każdym takcie (biblioteka alphaTab umie kłaść tekst tylko nad pięcioliniami).
- **Poza tabulaturą:** „Czarne”, „Lekko szare” (domyślnie) albo „Szare”. Przyciemnia wszystko w systemach oprócz tabulatury, żeby to ona była głównym punktem. Szarość jest też na wydruku, także gdy przeglądarka ma wyłączone drukowanie teł. Tytuł i diagramy akordów zostają czarne, a w widoku „Tylko nuty” nic nie jest przyciemnione.
- „Pokaż wszystko” przywraca wszystkie elementy. Liczba stron i podział na strony przeliczają się od razu (np. po ukryciu diagramów karta jest krótsza).
- Litery i słowa są częścią karty, więc trafiają też na wydruk. Rozmiar jednych i drugich ustawiasz w panelu „Rozmiary”. Litery układa alphaTab, więc w poszczególnych taktach mogą leżeć o 2–4 px wyżej albo niżej.

## Słowa piosenki w pliku

Słowa leżą w pliku utworu jako linia `\lyrics` przed kropką. Sylaby oddzielasz spacją i wpisujesz po jednej na nutę (pauzy i nuty z ligatury sylab nie dostają), a `+` łączy sylaby na jednej nucie.
  Przykład: `\lyrics "Wlazł ko- tek na pło- tek i mru- ga"`. Gdy liczba sylab nie zgadza się z liczbą nut, ostatnie nuty zostają bez słów. Gdy sylaba rozciąga się na kilka nut (np. „Ci- i- cha”), każdą nutę opisujesz osobno, powtarzając samogłoskę z myślnikiem.
- Słowa mają „Wlazł kotek na płotek”, „Sto lat” i „Cicha noc”. Do pozostałych utworów dopisujesz je tą samą linią w edytorze.

## Edycja kliknięciem na karcie

Przycisk „Edycja na karcie” (domyślnie włączony) pokazuje pasek z wartościami nut.

- **Wstawianie:** kliknij linię tabulatury. Struna wynika z wysokości kliknięcia, a miejsce w takcie z pozycji poziomej.
  Blisko istniejącej nuty dodajesz nutę do akordu, dalej od niej wstawiasz nowy dźwięk między sąsiednie.
  Kliknięcie w pauzę zamienia ją w nutę. Tryb „Pauza” wstawia pauzy zamiast nut.
- **Zaznaczanie:** kliknij nutę (w tabie albo na pięciolinii). Wtedy cyfry zmieniają próg (np. `1` `2` daje 12),
  `←` `→` przesuwają zaznaczenie, `↑` `↓` przenoszą nutę na inną strunę, `Delete` zamienia nutę w pauzę, a drugie `Delete` usuwa pauzę.
  Przyciski 1, 1/2, 1/4, 1/8, 1/16 i „Kropka” zmieniają wartość zaznaczonej nuty.
- **Cofanie:** „Cofnij” / `Ctrl+Z`, „Ponów” / `Ctrl+Shift+Z`.

Każde kliknięcie zmienia w edytorze tylko ten fragment tekstu, którego dotyczy, a reszta zapisu zostaje nietknięta.
Jeśli po wstawieniu nuty takt przestanie pasować do metrum, pod edytorem pojawi się ostrzeżenie. Niczego nie blokuje.
Edycja kliknięciem nie działa dla zapisów z kilkoma ścieżkami, powtórzeniami z gwiazdką (`3.2*4`) ani dla wczytanych plików Guitar Pro. Wtedy zostaje edycja tekstu.

## Ściąga AlphaTex

```
\title "Tytuł"  \subtitle "Podtytuł"  \tempo 100  \ts 3 4
\chord ("G" 3 0 0 0 2 3)          diagram akordu (progi od struny 1 do 6, x = niegrana)
.                                  koniec nagłówka
3.2.4  1.2.8  0.2.8  (0.1 2.2).2   próg.struna.wartość; akord w nawiasie
3.2.4{d}   0.2.4{ch "G"}           kropka; nazwa akordu nad nutą
\section "Refren"  \ro  \rc 2      część, początek i koniec repetycji (na początku taktu)
\voice                             drugi głos na tej samej pięciolinii (np. bas)
{h} {sl} {b (0 4)} {v} {pm}        hammer/pull-off, slide, bend, vibrato, palm mute
```

Struna 1 to najcieńsza. Wartość rytmiczną (`.4`, `.8`, `.2`…) zapisuj przy każdej nucie, bo `:4` i `.8` zmieniają wartość domyślną dla kolejnych nut.
Pełna dokumentacja: https://www.alphatab.net/docs/alphatex/introduction

Napis „♪ alphaTab.net” na nutach zostaje, bo licencja biblioteki tego wymaga.
