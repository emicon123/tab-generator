# Sheet music and guitar tablature

A small, print-first web app for writing, previewing and printing sheet music and guitar tablature from
**AlphaTex** text notation. Rendering is done by [alphaTab](https://www.alphatab.net).

The user interface is in Polish; button and panel names below are quoted as they appear on screen, with an
English translation in brackets.

## Purpose

**The main goal of this app is printing tablature.** The screen is a preview and a place for corrections; what
ends up on paper comes first in every layout decision. That leads to the rules followed when changing anything:

- **Tablature is the focal point.** Tab digits and lines are black and crisp; everything else in the systems
  (staff notation, note letters, lyrics, chord names, bar numbers) is a soft grey (panel „Pokaż” [Show],
  option „Poza tabulaturą” [Outside the tab]).
- **The preview must look exactly like the printout:** the card is as wide as the printable area of an A4 page,
  a dashed line marks page breaks, and every extra (lyrics, letters, greying, hidden elements) must reach the
  paper too.
- **Readability over cramming:** it is better to spread a piece over several pages with larger notes than to
  squeeze it onto one sheet. Sizes are set in the „Rozmiary” [Sizes] panel.
- A new feature is done only once it has been checked in the PDF (print preview), not just on screen.

The app renders scores from AlphaTex, stores songs as plain files on disk, and lets you correct them by clicking
on the score.

## Running

```bash
npm start          # http://localhost:8765, on the local network: http://<raspberry-address>:8765
```

`npm start` runs a small server (`server.mjs`, plain Node, no dependencies). The library and fonts are vendored in
`public/lib` and `public/fonts`, so the app works offline. `PORT` and `HOST` can be set via environment variables.
`node_modules` is only needed to update alphaTab (copy `alphaTab.min.js` and `font/` from its `dist`).

## Songs on disk

Every song is a plain text file in `songs/` (e.g. `songs/cicha-noc.alphatex`). Changes save automatically a few
seconds after the last edit (a „Zapisano” [Saved] label next to the song list), both after typing in the editor
and after clicks on the score. Pick a song from the list in the top-left corner; „Nowy utwór” [New song] creates
a file with four empty bars. Files can be copied, archived and deleted by hand — there is no database.

The server writes files for anyone who can reach it on the local network. Do not expose it to the internet.

The bundled example songs are public-domain melodies (Polish folk songs and carols, „Ode to Joy”).

## How to use it

1. **From a screenshot:** „Nowy utwór” [New song], then „Skopiuj prompt dla LLM” [Copy prompt for an LLM].
   Paste the prompt into a chat together with a photo of the sheet music or tab, and paste the answer (AlphaTex
   code) into the editor on the left.
2. **By hand:** type in the editor; the preview refreshes live.
3. **From a file:** „Otwórz plik” [Open file] saves an `.alphatex` or `.txt` file as a new song (it does not
   overwrite the open one). Guitar Pro (`.gp3`–`.gp`, `.gpx`) and MusicXML files are preview and print only,
   without saving.
4. **Printing:** „Drukuj” [Print] opens the browser's print dialog (also the place for "Save as PDF"). Keep the
   scale at 100% and the default margins — the page already has its own 10 mm margins.
   **„Druk dwustronny”** [Duplex print] does the same, but after every page with full notation it prints its
   back side with **tablature only** for the same bars (no staff, letters, lyrics or chords). Enable duplex
   printing in the print dialog so a page and its back land on one sheet. On a printer without duplex the pages
   come out in order (front, back, front, back), so sheets can be turned by hand. The button works in the
   „Nuty + tab” [Notation + tab] view.

The view can be switched to tablature only or notation only, and the number of bars per line and the size are set
in the top bar.

## Pages and sizes

The card is as wide as the printable area of A4 (190 mm), so what you see is what you print. Next to the song
list there is a page counter („2 strony A4” [2 A4 pages]), and a dashed „Strona 2” [Page 2] line shows where the
next page starts. No system (row of music) is ever split across pages.

The „Rozmiary” [Sizes] button opens a panel (it stays open, so changes show on the card immediately):

- **Notation and staff:** scale of the whole notation (50–200%). The − and + buttons in the toolbar do the same.
- **Note letters, lyrics, chord names, title:** separate sizes in pixels.
- **Staff–tablature gap:** moves the two rows apart (default 10 px, 0–48 px). It does not change the gap below the
  tablature.
- **Systems per page:** "as many as fit" or a fixed number (2–8). With larger notes a piece spreads over more
  pages.
- „Przywróć domyślne” [Restore defaults] resets all sizes. Bars per line are chosen in the toolbar.

Sizes are remembered in the browser. Large letters and lyrics in dense bars may overlap; make them smaller or use
fewer bars per line.

## What to show on the card

The „Pokaż” [Show] button opens a panel of toggles. They only hide things on the card and in the printout — the
song text on the left stays unchanged, so e.g. chords are still in the file, they just are not drawn. The choice
is remembered in the browser and applies to all songs.

- Title and subtitle, tempo, chord names above the notes, chord diagrams, section names (e.g. Chorus), bar
  numbers.
- **Note letters:** labels under the staff. Choose `C D E F G A H` (Polish/German names, where "si" is H) or
  `C D E F G A B` (English). A note extended by a tie gets its letter only once.
- **Lyrics:** drawn by the app's own code under every bar of tablature, so they sit at the same distance from it
  in every bar (alphaTab itself can only place text above staves).
- **Outside the tab** („Poza tabulaturą”): „Czarne” [Black], „Lekko szare” [Light grey] (default) or „Szare”
  [Grey]. Dims everything in the systems except the tablature, so the tab stays the focal point. The grey also
  appears in print, even when the browser has background printing turned off. The title and chord diagrams stay
  black, and in the „Tylko nuty” [Notation only] view nothing is dimmed.
- „Pokaż wszystko” [Show all] brings every element back. The page count and page breaks are recalculated at once
  (e.g. hiding the diagrams makes the card shorter).
- Letters and lyrics are part of the card, so they are printed too. Their sizes are set in the „Rozmiary” [Sizes]
  panel. Letters are laid out by alphaTab, so in individual bars they may sit 2–4 px higher or lower.

## Lyrics in the file

Lyrics live in the song file as a `\lyrics` line before the dot. Separate syllables with spaces, one per note
(rests and tied notes get no syllable), and use `+` to join syllables on one note.
Example: `\lyrics "Wlazł ko- tek na pło- tek i mru- ga"`. If the number of syllables does not match the number of
notes, the last notes stay without lyrics. When a syllable stretches over several notes (e.g. "Ci- i- cha"),
write each note separately, repeating the vowel with a hyphen.

„Wlazł kotek na płotek”, „Sto lat” and „Cicha noc” come with lyrics; add them to the other songs with the same
line in the editor.

## Editing by clicking on the card

The „Edycja na karcie” [Edit on card] button (on by default) shows a bar with note values.

- **Inserting:** click a tablature line. The string follows from the height of the click and the position in the
  bar from the horizontal position. Close to an existing note you add a note to the chord; further away you insert
  a new note between its neighbours. Clicking a rest turns it into a note. The „Pauza” [Rest] mode inserts rests
  instead of notes.
- **Selecting:** click a note (in the tab or on the staff). Digits then change the fret (e.g. `1` `2` gives 12),
  `←` `→` move the selection, `↑` `↓` move the note to another string, `Delete` turns the note into a rest, and a
  second `Delete` removes the rest. The 1, 1/2, 1/4, 1/8, 1/16 and „Kropka” [Dot] buttons change the value of the
  selected note.
- **Undo:** „Cofnij” [Undo] / `Ctrl+Z`, „Ponów” [Redo] / `Ctrl+Shift+Z`.

Every click changes only the part of the editor text it refers to; the rest of the notation stays untouched. If a
bar no longer fits the time signature after inserting a note, a warning appears under the editor — nothing is
blocked. Click editing does not work for notation with several tracks, repeats with an asterisk (`3.2*4`) or
loaded Guitar Pro files; text editing remains available there.

## AlphaTex cheat sheet

```
\title "Title"  \subtitle "Subtitle"  \tempo 100  \ts 3 4
\chord ("G" 3 0 0 0 2 3)          chord diagram (frets from string 1 to 6, x = not played)
.                                  end of the header
3.2.4  1.2.8  0.2.8  (0.1 2.2).2   fret.string.duration; a chord in parentheses
3.2.4{d}   0.2.4{ch "G"}           dotted note; chord name above the note
\section "Chorus"  \ro  \rc 2      section, repeat open and close (at the start of a bar)
\voice                             second voice on the same staff (e.g. bass)
{h} {sl} {b (0 4)} {v} {pm}        hammer-on/pull-off, slide, bend, vibrato, palm mute
```

String 1 is the thinnest. Write the duration (`.4`, `.8`, `.2`…) on every note, because `:4` and `.8` change the
default duration for the following notes.
Full documentation: https://www.alphatab.net/docs/alphatex/introduction

## Licenses

- alphaTab (`public/lib/alphaTab.min.js`) — MPL-2.0. The „♪ alphaTab.net” mark on rendered scores stays, as the
  library's license requires.
- Bravura music font — SIL Open Font License (`public/lib/font/Bravura-OFL.txt`).
- JetBrains Mono and Schibsted Grotesk — SIL Open Font License (`public/fonts/LICENSE-*.txt`).
