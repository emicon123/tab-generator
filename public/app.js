"use strict";

/* ---------- Prompt dla LLM (zrzut ekranu -> AlphaTex) ---------- */

const LLM_PROMPT = String.raw`Zamień załączony obraz (pięciolinia i/lub tabulatura gitarowa) na zapis AlphaTex (format biblioteki alphaTab). Zwróć WYŁĄCZNIE jeden blok kodu, bez komentarzy i wyjaśnień.

Zasady:
- Nagłówek: \title "..." \subtitle "..." \artist "..." \tempo 100 \ts 3 4 (metrum) \capo 2 (jeśli jest). Nagłówek kończy linia z samą kropką: .
- Nuta: numer_progu.numer_struny. Struna 1 to najcieńsza (e), struna 6 najgrubsza (E). Przykład: 3.2 to próg 3 na strunie B.
- Martwa nuta: x.3.4. Akord (kilka nut naraz): (0.3 2.2 2.1).4
- Wartość rytmiczna zapisuj przy KAŻDEJ nucie, po numerze struny: 3.2.4 (ćwierćnuta), 3.2.8 (ósemka), 3.2.16, 3.2.2 (półnuta), 3.2.1 (cała nuta). Nuta z kropką: 3.2.4{d}. Pauza: r.4
- Kreska taktowa: |   Liczba wartości w takcie musi zgadzać się z metrum.
- Efekty nuty w klamrach: {h} hammer-on/pull-off, {sl} slide legato, {ss} slide, {b (0 4)} bend, {v} vibrato, {pm} palm mute, {-} nuta przedłużona (ligatura): 3.2.4 -.4
- Nazwa akordu nad nutą: 0.2.4{ch "G"}. Diagram akordu definiujesz przed kropką: \chord ("G" 3 0 0 0 2 3) (progi od struny 1 do 6, x = struna niegrana).
- Nazwa części nad taktem: \section "Refren" (na początku taktu). Repetycje: \ro na początku taktu otwiera, \rc 2 na początku taktu zamyka (liczba powtórzeń).
- Słowa piosenki (jeśli są na obrazie): \lyrics "Wlazł ko- tek na pło- tek" w nagłówku przed kropką. Sylaby oddzielaj spacją i wpisuj po jednej na nutę (nie na pauzę), a + łączy sylaby na jednej nucie: "w+sam".
- Dwa głosy na jednej pięciolinii (np. melodia i bas): napisz najpierw cały głos pierwszy po kropce, potem \voice i cały głos drugi. Głos drugi musi mieć tyle samo taktów.
- Jeśli na obrazie jest tylko tabulatura, odtwórz rytm z tabulatury; jeśli są tylko nuty, dobierz progi tak, by były wygodne w pierwszej pozycji.
- Przepisz dokładnie to, co widzisz. Niczego nie dopowiadaj i nie upraszczaj.`;

/* ---------- Pomocnicze ---------- */

const $ = (selector) => document.querySelector(selector);

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* tryb prywatny: pomijamy */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* tryb prywatny: pomijamy */ }
  },
};

const sourceEl = $("#source");
const statusEl = $("#status");
const toastEl = $("#toast");

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

/* ---------- alphaTab ---------- */

// Rozmiary w pikselach przy skali 100%: litery nut, słowa piosenki, nazwy akordów, tytuł, odstęp między pięciolinią a tabulaturą
// oraz liczba systemów na stronie (0 = automatycznie)
const DEFAULT_SIZES = { letters: 12, words: 13, chords: 12, title: 32, systems: 0, gap: 10 };

// Co pokazywać na karcie (to tylko wyświetlanie, zapis utworu zostaje bez zmian)
const DEFAULT_SHOW = { title: true, tempo: true, chordNames: true, chordDiagrams: true, markers: true, barNumbers: true };

function readShow() {
  try {
    return { ...DEFAULT_SHOW, ...JSON.parse(store.get("show", "{}")) };
  } catch {
    return { ...DEFAULT_SHOW };
  }
}

function readSizes() {
  try {
    return { ...DEFAULT_SIZES, ...JSON.parse(store.get("sizes", "{}")) };
  } catch {
    return { ...DEFAULT_SIZES };
  }
}

const state = {
  view: store.get("view", "scoretab"),
  bars: Number(store.get("bars", "3")),
  zoom: Number(store.get("zoom", "100")),
  sizes: readSizes(),
  show: readShow(),
  names: store.get("names", "pl"), // podpisy nut: "off", "pl" (…A H) albo "en" (…A B)
  words: store.get("words", "1") === "1", // słowa piosenki pod nutami (jeśli utwór je ma)
};
state.tone = store.get("tone", "soft"); // kolor wszystkiego poza tabulaturą: "black", "soft" (lekko szare) albo "gray"
state.namesStyle = state.names === "off" ? store.get("namesStyle", "pl") : state.names; // ostatnio wybrane nazwy liter (pl albo en)

const CAPTION_SPACE = 22; // px wolnego miejsca pod ostatnim rzędem nut (tabulaturą) na słowa

const STAVE_PROFILES = {
  scoretab: alphaTab.StaveProfile.ScoreTab,
  tab: alphaTab.StaveProfile.Tab,
  score: alphaTab.StaveProfile.Score,
};

function displaySettings() {
  return {
    scale: state.zoom / 100,
    staveProfile: STAVE_PROFILES[state.view],
    barsPerRow: state.bars > 0 ? state.bars : -1,
    notationStaffPaddingTop: state.sizes.gap, // dodatkowy odstęp nad tabulaturą, czyli między nią a pięciolinią
    lastSystemFillThreshold: 0, // ostatni wiersz też na całą szerokość, a nie ściśnięty z lewej strony
    lastNotationStaffPaddingBottom: Math.ceil(state.sizes.words * 1.7), // miejsce pod tabulaturą na słowa piosenki
  };
}

const api = new alphaTab.AlphaTabApi($("#alphaTab"), {
  core: {
    fontDirectory: new URL("lib/font/", location.href).href,
    includeNoteBounds: true,
    enableLazyLoading: false, // do druku potrzebne są od razu wszystkie systemy, nie tylko te widoczne na ekranie
  },
  display: {
    layoutMode: alphaTab.LayoutMode.Page,
    ...displaySettings(),
    // Cały zapis czarny, jak w druku (domyślnie drugi głos jest szary, a numery taktów czerwone)
    resources: {
      mainGlyphColor: "#000000",
      secondaryGlyphColor: "#000000",
      barNumberColor: "#444444",
    },
  },
  notation: { elements: { guitarTuning: false } },
  player: { enablePlayer: false },
});

// Litery nut rysuje alphaTab jako tekst (lyrics) tuż pod pięciolinią, a słowa piosenki (z \lyrics w pliku) rysujemy sami
// pod tabulaturą (drawCaptions). Biblioteka kładzie tekst tylko nad pięcioliniami, a własny rysunek daje równą linię pod tabulaturą.
const FONT = alphaTab.model.Font;
const elementFonts = api.settings.display.resources.elementFonts;
const baseFonts = {
  chords: elementFonts.get(alphaTab.NotationElement.EffectChordNames),
  title: elementFonts.get(alphaTab.NotationElement.ScoreTitle),
  subtitle: elementFonts.get(alphaTab.NotationElement.ScoreSubTitle),
};

// Ta sama rodzina, styl i grubość co domyślne czcionki biblioteki, tylko inny rozmiar
function withSize(base, size, fallbackFamily, fallbackStyle) {
  const model = alphaTab.model;
  const family = base?.families?.length ? base.families.join(", ") : fallbackFamily;
  return new FONT(family, size, base ? base.style : fallbackStyle, base ? base.weight : model.FontWeight.Regular);
}

function applyFonts() {
  const model = alphaTab.model;
  const { letters, chords, title } = state.sizes;
  elementFonts.set(
    alphaTab.NotationElement.EffectLyrics,
    new FONT("Arial, Helvetica, sans-serif", letters, model.FontStyle.Plain, model.FontWeight.Regular),
  );
  elementFonts.set(alphaTab.NotationElement.EffectChordNames, withSize(baseFonts.chords, chords, "Georgia, serif", model.FontStyle.Italic));
  elementFonts.set(alphaTab.NotationElement.ScoreTitle, withSize(baseFonts.title, title, "Georgia, serif", model.FontStyle.Plain));
  elementFonts.set(
    alphaTab.NotationElement.ScoreSubTitle,
    withSize(baseFonts.subtitle, Math.round(title * 0.625), "Georgia, serif", model.FontStyle.Plain),
  );
}
// Elementy karty, które można ukryć w panelu „Pokaż” (nazwy z NotationElement alphaTab)
const ELEMENT_GROUPS = {
  title: ["ScoreTitle", "ScoreSubTitle"],
  tempo: ["EffectTempo"],
  chordNames: ["EffectChordNames"],
  chordDiagrams: ["ChordDiagrams"],
  markers: ["EffectMarker"],
  barNumbers: ["BarNumber"],
};

function applyElements() {
  const elements = api.settings.notation.elements;
  for (const [key, names] of Object.entries(ELEMENT_GROUPS)) {
    for (const name of names) elements.set(alphaTab.NotationElement[name], state.show[key]);
  }
}

applyFonts();
applyElements();
api.updateSettings();

const NOTE_NAMES = {
  pl: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "B", "H"], // po polsku dźwięk "si" to H, a B oznacza si bemol
  en: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
};

// Słowa z pliku zapamiętujemy i zdejmujemy z lyrics biblioteki, żeby nie rysowały się dwa razy
let fileWords = { score: null, byBeat: new Map() };

function annotateScore(score) {
  const beats = score.tracks[0].staves[0].bars.flatMap((bar) => bar.voices[0]?.beats ?? []);
  if (fileWords.score !== score) {
    fileWords = { score, byBeat: new Map(beats.filter((b) => b.lyrics?.length).map((b) => [b, b.lyrics[0]])) };
  }

  const names = state.names === "off" ? null : NOTE_NAMES[state.names];
  for (const beat of beats) {
    const fresh = names ? beat.notes.filter((note) => !note.isTieDestination) : []; // nuta z ligatury nie dostaje drugiej litery
    const letter = [...new Set(fresh.map((note) => names[((note.realValue % 12) + 12) % 12]))].join(" ");
    beat.lyrics = letter ? [letter] : null;
  }
}

// Słowa piosenki dopisujemy do SVG systemu (a nie na wierzch), żeby przy druku zawsze były przy swoich nutach
const SVG_NS = "http://www.w3.org/2000/svg";

function drawCaptions() {
  document.querySelectorAll("#alphaTab svg .caption").forEach((el) => el.remove());
  const lookup = api.renderer.boundsLookup;
  if (!state.words || !fileWords.byBeat.size || !lookup?.isFinished) return;

  const fontSize = (state.sizes.words * state.zoom) / 100;
  const root = $("#alphaTab").getBoundingClientRect();
  const chunks = [...document.querySelectorAll("#alphaTab svg")].map((svg) => {
    const box = svg.getBoundingClientRect();
    return { svg, top: box.top - root.top, bottom: box.bottom - root.top };
  });

  for (const system of lookup.staffSystems) {
    for (const masterBar of system.bars) {
      const staff = masterBar.bars.at(-1); // najniższy rząd nut w takcie (tabulatura)
      const bottom = staff.visualBounds.y + staff.visualBounds.h;
      const chunk = chunks.find((c) => bottom >= c.top && bottom <= c.bottom + 1);
      if (!chunk) continue;
      for (const beatBounds of staff.beats) {
        const word = fileWords.byBeat.get(beatBounds.beat);
        if (!word || beatBounds.beat.voice.index !== 0) continue;
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("class", "caption");
        text.setAttribute("x", String(beatBounds.onNotesX));
        text.setAttribute("y", String(bottom - chunk.top + fontSize * 1.15));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-family", "Arial, Helvetica, sans-serif");
        text.setAttribute("font-size", String(fontSize));
        text.setAttribute("fill", "#000");
        text.textContent = word;
        chunk.svg.append(text);
      }
    }
  }
}

/* ---------- Szarość poza tabulaturą ---------- */

// Tabulatura ma być głównym punktem do skupienia, więc wszystko inne w systemach (nuty, litery, słowa, akordy, numery taktów)
// jest szare. alphaTab ma jeden kolor dla całej notacji, dlatego po narysowaniu przyciemniamy elementy SVG leżące poza pasem tabulatury.
const TONES = { black: null, soft: "#5a6270", gray: "#8b929d" };

function applyTone() {
  const lookup = api.renderer.boundsLookup;
  if (!lookup?.isFinished) return;
  const tabInBlack = state.view !== "score"; // w widoku samych nut nie ma tabulatury, więc nic nie zmieniamy
  const color = tabInBlack ? TONES[state.tone] : null;

  const root = $("#alphaTab").getBoundingClientRect();
  const chunks = [...document.querySelectorAll("#alphaTab svg")].map((svg) => {
    const box = svg.getBoundingClientRect();
    return { svg, top: box.top - root.top, bottom: box.bottom - root.top, bands: [] };
  });
  for (const system of lookup.staffSystems) {
    const tab = system.bars[0]?.bars.at(-1)?.visualBounds; // najniższy rząd to tabulatura (w widoku samych nut tu nie dojdziemy)
    if (!tab) continue;
    const chunk = chunks.find((c) => tab.y >= c.top && tab.y <= c.bottom);
    if (chunk) chunk.bands.push([tab.y - 6 - chunk.top, tab.y + tab.h + 3 - chunk.top]); // cyfry na górnej linii wystają ok. 6 px
  }

  for (const chunk of chunks) {
    if (!chunk.bands.length) continue; // tytuł i diagramy akordów zostają bez zmian
    const svgTop = chunk.svg.getBoundingClientRect().top;
    const elements = [...chunk.svg.querySelectorAll("path, rect, text")];
    const centers = elements.map((el) => {
      const box = el.getBoundingClientRect();
      return box.top + box.height / 2 - svgTop;
    });
    elements.forEach((el, i) => {
      if (!("originalFill" in el)) el.originalFill = el.getAttribute("fill");
      const inTab = chunk.bands.some(([from, to]) => centers[i] >= from && centers[i] <= to);
      if (tabInBlack && inTab && el.originalFill !== "none") el.setAttribute("fill", "#000000"); // linie strun i cyfry w tabulaturze
      else if (color && !inTab && el.originalFill !== "none") el.setAttribute("fill", color);
      else if (el.originalFill === null) el.removeAttribute("fill");
      else el.setAttribute("fill", el.originalFill);
    });
  }
}

// Bloki karty (każdy system to osobny blok) z pasem tabulatury w jego współrzędnych: [od, do] albo null dla tytułu i diagramów
function chunkInfo() {
  const lookup = api.renderer.boundsLookup;
  const surface = document.querySelector("#alphaTab .at-surface");
  if (!surface || !lookup?.isFinished) return [];
  const root = $("#alphaTab").getBoundingClientRect();
  const chunks = [...surface.children]
    .filter((el) => el.querySelector("svg"))
    .map((el) => {
      const box = el.getBoundingClientRect();
      return { el, svg: el.querySelector("svg"), top: box.top - root.top, bottom: box.bottom - root.top, height: box.height, band: null };
    });
  for (const system of lookup.staffSystems) {
    const tab = system.bars[0]?.bars.at(-1)?.visualBounds;
    const chunk = tab && chunks.find((c) => tab.y >= c.top && tab.y <= c.bottom);
    if (chunk) chunk.band = [tab.y - 6 - chunk.top, tab.y + tab.h + 3 - chunk.top]; // cyfry na górnej linii wystają ok. 6 px
  }
  return chunks;
}

/* ---------- Strony ---------- */

// Pole druku A4 z marginesami 10 mm: 190 × 277 mm, czyli 718 × 1047 px przy 96 dpi. Karta na ekranie ma dokładnie 718 px szerokości,
// więc podział na strony liczymy tu na ekranie i ten sam podział wymuszamy przy druku (żaden system nie jest przecięty).
const PRINT_WIDTH_PX = 718;
const PAGE_HEIGHT_PX = 1047;
const PAGE_SAFETY_PX = 6; // zapas, żeby przeglądarka nie dołożyła własnego podziału strony
let pageBreaks = []; // ostatni blok każdej strony poza ostatnią
let pageGroups = []; // bloki należące do kolejnych stron

function pagesLabel(n) {
  return n === 1 ? "1 strona A4" : n >= 2 && n <= 4 ? `${n} strony A4` : `${n} stron A4`;
}

function updatePages() {
  document.querySelectorAll("#overlay .page-guide").forEach((el) => el.remove());
  pageBreaks = [];
  pageGroups = [];
  const info = $("#pageInfo");
  const lookup = api.renderer.boundsLookup;
  const surface = document.querySelector("#alphaTab .at-surface");
  if (!surface || !lookup?.isFinished || !surface.children.length) {
    info.textContent = "";
    return;
  }

  const root = $("#alphaTab").getBoundingClientRect();
  const blocks = [...surface.children].map((el) => {
    const box = el.getBoundingClientRect();
    return { el, top: box.top - root.top, height: box.height };
  });
  const systemTops = lookup.staffSystems.map((system) => system.visualBounds.y);
  const isSystem = (block) => systemTops.some((y) => y >= block.top - 1 && y < block.top + block.height);
  const perPage = state.sizes.systems;

  let page = 1;
  let used = 0;
  let systems = 0;
  pageGroups = [[]];
  blocks.forEach((block, i) => {
    const system = isSystem(block);
    const full = used > 0 && (used + block.height > PAGE_HEIGHT_PX - PAGE_SAFETY_PX || (system && perPage > 0 && systems >= perPage));
    if (full) {
      pageBreaks.push(blocks[i - 1].el);
      pageGroups.push([]);
      page++;
      used = 0;
      systems = 0;
      const guide = document.createElement("div");
      guide.className = "page-guide";
      guide.dataset.label = `Strona ${page}`;
      guide.style.top = `${block.top}px`;
      $("#overlay").append(guide);
    }
    used += block.height;
    if (system) systems++;
    pageGroups.at(-1).push(block.el);
  });
  info.textContent = pagesLabel(page);
}

api.postRenderFinished.on(() => {
  drawCaptions();
  applyTone();
  updatePages();
});

let fileMode = false; // true, gdy widać wczytany plik binarny, a nie tekst z edytora

function bars(n) {
  const lastTwo = n % 100, last = n % 10;
  const word = n === 1 ? "takt" : last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? "takty" : "taktów";
  return `${n} ${word}`;
}

api.scoreLoaded.on((score) => {
  annotateScore(score);
  score.stylesheet.hideDynamics = true; // alphaTex wstawia domyślne f, którego nie ma w oryginale
  document.title = score.title ? `${score.title} – Nuty i tabulatura` : "Nuty i tabulatura";
  const count = score.tracks[0]?.staves[0]?.bars.length ?? 0;
  if (!fileMode) setStatus(`Wczytano ${bars(count)}.`);
});

// Wyciąga z błędu alphaTab pierwszą konkretną usterkę zapisu (linia i kolumna w edytorze)
function describeError(error) {
  const source = [error, error?.cause, error?.inner].find((e) => typeof e?.iterateDiagnostics === "function");
  if (source) {
    for (const d of source.iterateDiagnostics()) {
      if (d.severity === 2) {
        const where = d.start ? `linia ${d.start.line}, kolumna ${d.start.col}: ` : "";
        return `Błąd zapisu (${where}${d.message})`;
      }
    }
  }
  return `Błąd zapisu: ${error?.message ?? error}`;
}

api.error.on((error) => setStatus(describeError(error), true));

let currentText = ""; // tekst, który widzi alphaTab; edycja na karcie liczy na nim pozycje w zapisie

function renderText() {
  fileMode = false;
  const text = sourceEl.value;
  currentText = text;
  document.dispatchEvent(new CustomEvent("score-text", { detail: text })); // autozapis do pliku (songs.js)
  if (!text.trim()) {
    setStatus("Wklej kod AlphaTex albo otwórz plik.");
    return;
  }
  setStatus("");
  api.tex(text);
}

function applyText(text) {
  sourceEl.value = text;
  renderText();
}

function applySettings() {
  Object.assign(api.settings.display, displaySettings());
  applyFonts();
  applyElements();
  api.updateSettings();
  api.render();
}

/* ---------- Edytor ---------- */

let debounce;
sourceEl.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(renderText, 400);
});

// Tab wstawia wcięcie zamiast przenosić fokus
sourceEl.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && !event.shiftKey) {
    event.preventDefault();
    sourceEl.setRangeText("  ", sourceEl.selectionStart, sourceEl.selectionEnd, "end");
  }
});

/* ---------- Widok, takty, rozmiar ---------- */

const viewButtons = document.querySelectorAll("[data-view]");
function syncViewButtons() {
  viewButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.view === state.view)));
}
viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    store.set("view", state.view);
    syncViewButtons();
    applySettings();
  });
});

const barsSelect = $("#bars");
barsSelect.value = String(state.bars);
barsSelect.addEventListener("change", () => {
  state.bars = Number(barsSelect.value);
  store.set("bars", String(state.bars));
  applySettings();
});

/* ---------- Panel „Pokaż” ---------- */

const showPanel = $("#showPanel");
const showLetters = $("#showLetters");
const namesStyle = $("#namesStyle");
const showWords = $("#showWords");

function syncShowPanel() {
  document.querySelectorAll("[data-show]").forEach((box) => (box.checked = state.show[box.dataset.show]));
  showLetters.checked = state.names !== "off";
  namesStyle.value = state.namesStyle;
  namesStyle.disabled = state.names === "off";
  showWords.checked = state.words;
  $("#toneSelect").value = state.tone;
}

function redrawLetters() {
  if (!api.score) return;
  annotateScore(api.score);
  api.renderScore(api.score, [0]);
}

document.querySelectorAll("[data-show]").forEach((box) =>
  box.addEventListener("change", () => {
    state.show[box.dataset.show] = box.checked;
    store.set("show", JSON.stringify(state.show));
    applySettings();
  }),
);

$("#toneSelect").addEventListener("change", (event) => {
  state.tone = event.target.value;
  store.set("tone", state.tone);
  applyTone();
});

function setNames(value) {
  state.names = value;
  if (value !== "off") state.namesStyle = value;
  store.set("names", state.names);
  store.set("namesStyle", state.namesStyle);
  syncShowPanel();
  redrawLetters();
}
showLetters.addEventListener("change", () => setNames(showLetters.checked ? state.namesStyle : "off"));
namesStyle.addEventListener("change", () => setNames(namesStyle.value));

showWords.addEventListener("change", () => {
  state.words = showWords.checked;
  store.set("words", state.words ? "1" : "0");
  drawCaptions();
});

$("#showAll").addEventListener("click", () => {
  state.show = { ...DEFAULT_SHOW };
  state.words = true;
  store.set("show", JSON.stringify(state.show));
  store.set("words", "1");
  if (state.names === "off") setNames(state.namesStyle);
  syncShowPanel();
  applySettings();
});

// Oba panele są niemodalne i stoją w tym samym miejscu, więc otwarcie jednego zamyka drugi
function togglePanel(panel, button, other, otherButton) {
  other.close();
  if (panel.open) panel.close();
  else panel.show();
  button.setAttribute("aria-expanded", String(panel.open));
  otherButton.setAttribute("aria-expanded", "false");
}
$("#showClose").addEventListener("click", () => showPanel.close());
showPanel.addEventListener("close", () => $("#showButton").setAttribute("aria-expanded", "false"));
syncShowPanel();

const zoomValue = $("#zoomValue");
function setZoom(next) {
  state.zoom = Math.min(200, Math.max(50, next));
  zoomValue.textContent = `${state.zoom}%`;
  store.set("zoom", String(state.zoom));
  if (typeof syncSizesPanel === "function") syncSizesPanel();
  applySettings();
}
$("#zoomIn").addEventListener("click", () => setZoom(state.zoom + 10));
$("#zoomOut").addEventListener("click", () => setZoom(state.zoom - 10));
zoomValue.textContent = `${state.zoom}%`;

/* ---------- Panel rozmiarów ---------- */

const sizesPanel = $("#sizesPanel");
const SIZE_FIELDS = { sizeLetters: "letters", sizeWords: "words", sizeChords: "chords", sizeTitle: "title", sizeGap: "gap", sizeSystems: "systems" };

function syncSizesPanel() {
  $("#sizeScale").value = state.zoom;
  $("#sizeScale").nextElementSibling.textContent = `${state.zoom}%`;
  for (const [id, key] of Object.entries(SIZE_FIELDS)) {
    const input = $(`#${id}`);
    input.value = String(state.sizes[key]);
    if (input.tagName === "INPUT") input.nextElementSibling.textContent = `${state.sizes[key]} px`;
  }
}

let sizesTimer;
function scheduleSizesApply() {
  clearTimeout(sizesTimer);
  sizesTimer = setTimeout(applySettings, 200); // przeciąganie suwaka nie renderuje karty przy każdej wartości
}

$("#sizeScale").addEventListener("input", (event) => {
  state.zoom = Number(event.target.value);
  zoomValue.textContent = `${state.zoom}%`;
  store.set("zoom", String(state.zoom));
  syncSizesPanel();
  scheduleSizesApply();
});

for (const [id, key] of Object.entries(SIZE_FIELDS)) {
  $(`#${id}`).addEventListener("input", (event) => {
    state.sizes[key] = Number(event.target.value);
    store.set("sizes", JSON.stringify(state.sizes));
    syncSizesPanel();
    if (key === "systems") updatePages(); // podział na strony liczymy bez ponownego rysowania nut
    else scheduleSizesApply();
  });
}

$("#sizesReset").addEventListener("click", () => {
  state.zoom = 100;
  state.sizes = { ...DEFAULT_SIZES };
  zoomValue.textContent = "100%";
  store.set("zoom", "100");
  store.set("sizes", JSON.stringify(state.sizes));
  syncSizesPanel();
  applySettings();
});

$("#sizesClose").addEventListener("click", () => sizesPanel.close());
$("#sizesButton").addEventListener("click", () => togglePanel(sizesPanel, $("#sizesButton"), showPanel, $("#showButton")));
$("#showButton").addEventListener("click", () => togglePanel(showPanel, $("#showButton"), sizesPanel, $("#sizesButton")));
sizesPanel.addEventListener("close", () => $("#sizesButton").setAttribute("aria-expanded", "false"));
syncSizesPanel();

/* ---------- Edytor: pokaż/ukryj ---------- */

const editorEl = $("#editor");
const toggleEditor = $("#toggleEditor");
function setEditorOpen(open) {
  editorEl.classList.toggle("is-hidden", !open);
  toggleEditor.setAttribute("aria-expanded", String(open));
  store.set("editorOpen", open ? "1" : "0");
}
toggleEditor.addEventListener("click", () => {
  setEditorOpen(editorEl.classList.contains("is-hidden"));
});

/* ---------- Plik ---------- */

const fileInput = $("#file");
$("#openFile").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;

  if (/\.(alphatex|txt)$/i.test(file.name)) {
    const text = await file.text();
    const title = /^\s*\\title\s+["']([^"'\n]*)/m.exec(text)?.[1]?.trim() || file.name.replace(/\.[^.]+$/, "");
    try {
      await songLibrary.create(title, text); // jako nowy utwór, żeby nie nadpisać otwartego
    } catch {
      setStatus("Nie udało się zapisać pliku jako nowego utworu: brak połączenia z serwerem.", true);
    }
    return;
  }

  fileMode = true;
  currentText = "";
  setStatus(`Plik: ${file.name}. Zmiana tekstu w edytorze zastąpi ten widok.`);
  api.load(new Uint8Array(await file.arrayBuffer()));
});

/* ---------- Prompt dla LLM ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Strona po http w sieci lokalnej nie ma dostępu do schowka API
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand("copy");
    helper.remove();
    return ok;
  }
}

$("#copyPrompt").addEventListener("click", async () => {
  toast((await copyText(LLM_PROMPT)) ? "Prompt skopiowany. Wklej go razem ze zrzutem ekranu." : "Nie udało się skopiować promptu.");
});

/* ---------- Druk ---------- */

// Drukujemy stronę przeglądarki (a nie okno alphaTab), bo słowa pod tabulaturą rysujemy sami, a okno biblioteki ich nie zna.
// Karta ma szerokość pola druku A4, więc wydruk jest taki jak podgląd; wymuszamy tylko podziały stron wyliczone w updatePages.
const sheetPage = $("#page");
let duplexNext = false; // następny wydruk jest dwustronny: po każdej stronie idzie jej odwrót z samą tabulaturą

// Kopia systemu z samą tabulaturą: z SVG usuwamy wszystko poza pasem tabulatury (nuty, litery, słowa, akordy) i przycinamy go do tego pasa
function tabOnlyCopy(chunk) {
  const [from, to] = chunk.band;
  const original = [...chunk.svg.querySelectorAll("path, rect, text")];
  const svgBox = chunk.svg.getBoundingClientRect();
  const geometry = original.map((el) => {
    const box = el.getBoundingClientRect();
    return { center: box.top + box.height / 2 - svgBox.top, right: box.right - svgBox.left, isPath: el.tagName === "path" };
  });
  const copy = chunk.svg.cloneNode(true);
  [...copy.querySelectorAll("path, rect, text")].forEach((el, i) => {
    // poza pasem tabulatury oraz klamra systemu po lewej stronie pierwszej kreski taktowej (ok. 39 px od brzegu)
    const { center, right, isPath } = geometry[i];
    // dół pasa (to - 3) to dolna linia strun; elementy leżące ok. 1,5 px niżej to ślad klamry systemu
    if (center < from || center > to - 1.6 || right < 38 || (isPath && right < 46)) el.remove();
  });
  copy.setAttribute("viewBox", `0 ${from} ${chunk.svg.getBoundingClientRect().width} ${to - from}`);
  copy.setAttribute("height", `${to - from}px`);
  const wrapper = document.createElement("div");
  wrapper.className = "duplex-system";
  wrapper.append(copy);
  return wrapper;
}

function addBackPages() {
  const chunks = new Map(chunkInfo().map((chunk) => [chunk.el, chunk]));
  pageGroups.forEach((group, index) => {
    const back = document.createElement("div");
    back.className = "duplex-back";
    for (const el of group) {
      const chunk = chunks.get(el);
      if (chunk?.band) back.append(tabOnlyCopy(chunk));
    }
    group.at(-1).style.breakAfter = "page"; // przód kartki, potem jej odwrót
    if (index < pageGroups.length - 1) back.style.breakAfter = "page";
    group.at(-1).after(back);
  });
}

function clearPrintMarks() {
  document.querySelectorAll(".duplex-back").forEach((el) => el.remove());
  document.querySelectorAll("#alphaTab .at-surface > div").forEach((el) => (el.style.breakAfter = ""));
}

let printPrepared = false; // przygotowanie robimy raz na wydruk, w układzie ekranowym (po zmianie na układ druku bloki mają inne położenie)

window.addEventListener("beforeprint", () => {
  if (printPrepared) return;
  printPrepared = true;
  clearPrintMarks(); // najpierw sprzątamy, żeby stare odwroty nie zaburzyły liczenia stron
  updatePages();
  if (duplexNext && state.view === "scoretab") addBackPages();
  else pageBreaks.forEach((el) => (el.style.breakAfter = "page"));
  // Gdy karta jest węższa niż pole druku (np. na wąskim ekranie), skalujemy ją do szerokości strony
  const width = $("#alphaTab").offsetWidth;
  if (width && Math.abs(width - PRINT_WIDTH_PX) > 2) sheetPage.style.zoom = String(PRINT_WIDTH_PX / width);
});
window.addEventListener("afterprint", () => {
  printPrepared = false;
  clearPrintMarks();
  sheetPage.style.zoom = "";
  duplexNext = false;
});

$("#printDuplex").addEventListener("click", () => {
  if (state.view !== "scoretab") {
    toast("Druk dwustronny działa w widoku „Nuty + tab”.");
    return;
  }
  duplexNext = true;
  window.print();
});

$("#print").addEventListener("click", () => window.print());
