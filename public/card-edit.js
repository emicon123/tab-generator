"use strict";

/*
 * Edycja na karcie: klik w tabulaturę zmienia zapis AlphaTex w edytorze.
 *
 * Tekst w edytorze jest jedynym źródłem prawdy. Parser alphaTab podaje dokładne miejsce
 * każdego beatu i każdej nuty w tekście, więc zmieniamy tylko ten fragment i nie ruszamy
 * reszty zapisu (formatowania, komentarzy, akordów). Po zmianie alphaTab rysuje kartę od nowa.
 *
 * Zależy od globalnych z app.js: api, state, sourceEl, currentText, fileMode, applyText, setStatus, store, $.
 */
(() => {
  const page = $("#page");
  const overlay = $("#overlay");
  const toolsEl = $("#tools");
  const toolsHint = $("#toolsHint");
  const desk = $("#desk");
  const toggleButton = $("#toggleCardEdit");

  const TICKS_PER_QUARTER = 960;
  const HIT_NOTE_PAD = 5; // px wokół cyfry próg/główki nuty, które liczą się jako trafienie w nutę
  const NEAR_NOTE_X = 14; // px od pionu nuty: dodajemy do akordu, dalej wstawiamy nowy beat

  const tool = { duration: 4, dotted: false, rest: false };
  let enabled = store.get("cardEdit", "1") === "1";
  let index = null; // powiązanie model alphaTab <-> węzły AST bieżącego tekstu (null = edycja niedostępna)
  let sel = null; // zaznaczenie: { flat, beat, str }, str = numer struny w AlphaTex (1 = najcieńsza) lub null
  let history = [];
  let future = [];
  let lastCommitAt = 0;
  let lastCommitCoalesced = false;
  let pendingScroll = null;
  let fretBuffer = "";
  let fretAt = 0;

  /* ---------- Powiązanie modelu z tekstem ---------- */

  function buildIndex(score) {
    index = null;
    if (fileMode || !currentText) return;

    let ast;
    try {
      ast = new alphaTab.importer.alphaTex.AlphaTexParser(currentText).read();
    } catch {
      return;
    }

    const track = score.tracks[0];
    if (!track || track.staves.length === 0) return;

    // Kolejność jak w zapisie: dla każdego głosu wszystkie takty po kolei
    const slots = [];
    for (const staff of track.staves) {
      const voiceCount = Math.max(...staff.bars.map((bar) => bar.voices.length));
      for (let v = 0; v < voiceCount; v++) {
        for (const bar of staff.bars) {
          if (!bar.voices[v]) return;
          slots.push({ bar, voice: bar.voices[v] });
        }
      }
    }
    if (slots.length !== ast.bars.length) return;

    const beats = [];
    const byBeat = new Map();
    for (let i = 0; i < slots.length; i++) {
      const nodes = ast.bars[i].beats;
      const modelBeats = slots[i].voice.beats;
      if (nodes.length !== modelBeats.length) return; // np. powtórzenia beatów (*N) albo kilka ścieżek
      nodes.forEach((node, pos) => {
        const info = { node, beat: modelBeats[pos], flat: i, pos, order: beats.length };
        beats.push(info);
        byBeat.set(modelBeats[pos], info);
      });
    }

    index = { text: currentText, slots, beats, byBeat, strings: track.staves[0].tuning.length };
  }

  const ready = () => (index && index.text === currentText ? index : null);

  // W modelu struna 1 jest najgrubsza, w AlphaTex najcieńsza
  const texString = (note) => index.strings - note.string + 1;

  const noteNodes = (info) => info.node.notes?.notes ?? [];
  const nodeForString = (info, str) => noteNodes(info).find((n) => n.noteString?.value === str);
  const isRestBeat = (info) => info.beat.isRest || noteNodes(info).length === 0;
  const hasExplicitDuration = (info) => Boolean(info.node.durationValue || info.node.durationChange);
  const contentEnd = (info) => (info.node.notes ?? info.node.rest).end.offset;

  /* ---------- Zmiany tekstu ---------- */

  // Wstawia i zamienia fragmenty naraz; wstawki w tym samym miejscu zachowują kolejność dodania
  function splice(text, edits) {
    const sorted = edits.map((e, seq) => ({ ...e, seq })).sort((a, b) => a.start - b.start || a.seq - b.seq);
    let out = "";
    let pos = 0;
    for (const e of sorted) {
      out += text.slice(pos, e.start) + e.insert;
      pos = e.end;
    }
    return out + text.slice(pos);
  }

  const replaceNode = (node, insert) => ({ start: node.start.offset, end: node.end.offset, insert });
  const insertAt = (offset, insert) => ({ start: offset, end: offset, insert });

  // Usuwa fragment razem z jednym sąsiednim odstępem, żeby nie zostawały podwójne spacje
  function removeSpan(text, start, end) {
    let after = end;
    while (text[after] === " " || text[after] === "\t") after++;
    if (after > end) return { start, end: after, insert: "" };
    let before = start;
    while (before > 0 && (text[before - 1] === " " || text[before - 1] === "\t")) before--;
    return { start: before, end, insert: "" };
  }

  // Beat bez zapisanej wartości dziedziczy ją po poprzednim. Gdy zmiana tekstu przestawia tę wartość,
  // następny beat dostaje swoją wartość wprost, żeby jego długość została taka, jak była.
  function keepNextDuration(edits, next, newDefault) {
    if (!next || hasExplicitDuration(next) || next.beat.duration === newDefault) return;
    edits.push(insertAt(contentEnd(next), `.${next.beat.duration}`));
  }

  const defaultBefore = (order) => (order > 0 ? index.beats[order - 1].beat.duration : 4);

  function opSetFret(info, str, fret) {
    const node = nodeForString(info, str);
    if (!node) return null;
    return {
      text: splice(currentText, [replaceNode(node.noteValue, String(fret))]),
      sel: { flat: info.flat, beat: info.pos, str },
    };
  }

  function opMoveString(info, str, newStr) {
    const node = nodeForString(info, str);
    if (!node || newStr < 1 || newStr > index.strings || nodeForString(info, newStr)) return null;
    return {
      text: splice(currentText, [replaceNode(node.noteString, String(newStr))]),
      sel: { flat: info.flat, beat: info.pos, str: newStr },
    };
  }

  function opAddNote(info, str) {
    const fresh = `0.${str}`;
    const node = info.node;
    let edit;
    if (isRestBeat(info) && node.rest) {
      edit = replaceNode(node.rest, fresh);
    } else if (node.notes.openParenthesis) {
      edit = insertAt(noteNodes(info).at(-1).end.offset, ` ${fresh}`);
    } else {
      const old = currentText.slice(node.notes.start.offset, node.notes.end.offset);
      edit = replaceNode(node.notes, `(${old} ${fresh})`);
    }
    return { text: splice(currentText, [edit]), sel: { flat: info.flat, beat: info.pos, str } };
  }

  function opRemoveNote(info, str) {
    const target = nodeForString(info, str);
    if (!target) return null;
    const list = info.node.notes;
    const edit =
      noteNodes(info).length > 1
        ? removeSpan(currentText, target.start.offset, target.end.offset)
        : replaceNode(list, "r");
    return { text: splice(currentText, [edit]), sel: { flat: info.flat, beat: info.pos, str: null } };
  }

  function opInsertBeat(anchor, side, str) {
    const order = side === "after" ? anchor.order + 1 : anchor.order;
    const before = defaultBefore(order);
    let content = tool.rest ? "r" : `0.${str}`;
    if (tool.duration !== before) content += `.${tool.duration}`;
    if (tool.dotted) content += "{d}";

    const edits = [
      side === "after" ? insertAt(anchor.node.end.offset, ` ${content}`) : insertAt(anchor.node.start.offset, `${content} `),
    ];
    if (tool.duration !== before) keepNextDuration(edits, index.beats[order], tool.duration);

    return {
      text: splice(currentText, edits),
      sel: { flat: anchor.flat, beat: side === "after" ? anchor.pos + 1 : anchor.pos, str: tool.rest ? null : str },
    };
  }

  function opSetDuration(info, duration) {
    const node = info.node;
    const edits = [];
    if (node.durationValue) edits.push(replaceNode(node.durationValue, String(duration)));
    else edits.push(insertAt(contentEnd(info), `.${duration}`));
    keepNextDuration(edits, index.beats[info.order + 1], duration);
    return {
      text: splice(currentText, edits),
      sel: sel && { ...sel, flat: info.flat, beat: info.pos },
    };
  }

  function opSetDotted(info, dotted) {
    if (info.beat.dots > 0 === dotted) return null;
    const node = info.node;
    let edit;
    if (dotted) {
      edit = node.beatEffects?.openBrace
        ? insertAt(node.beatEffects.openBrace.end.offset, "d ")
        : insertAt(node.end.offset, "{d}");
    } else if (node.beatEffects) {
      const effects = currentText.slice(node.beatEffects.start.offset, node.beatEffects.end.offset);
      const without = effects.replace(/([{\s])d(?=[\s}])\s*/, "$1");
      edit = replaceNode(node.beatEffects, /^\{\s*\}$/.test(without) ? "" : without);
    } else {
      return null;
    }
    return { text: splice(currentText, [edit]), sel: sel && { ...sel, flat: info.flat, beat: info.pos } };
  }

  function opDeleteBeat(info) {
    if (index.slots[info.flat].voice.beats.length < 2) return null; // ostatni beat w takcie zostaje
    const edits = [removeSpan(currentText, info.node.start.offset, info.node.end.offset)];
    keepNextDuration(edits, index.beats[info.order + 1], defaultBefore(info.order));
    return {
      text: splice(currentText, edits),
      sel: { flat: info.flat, beat: Math.max(0, info.pos - 1), str: null },
    };
  }

  /* ---------- Zatwierdzanie zmian, cofanie ---------- */

  function commit(result, { coalesce = false } = {}) {
    if (!result) return;
    const now = Date.now();
    if (!(coalesce && lastCommitCoalesced && now - lastCommitAt < 1500)) {
      history.push(currentText);
      if (history.length > 200) history.shift();
    }
    future = [];
    lastCommitAt = now;
    lastCommitCoalesced = coalesce;
    sel = result.sel;
    pendingScroll = desk.scrollTop;
    applyText(result.text);
    syncTools();
  }

  function undo() {
    if (!history.length) return;
    future.push(currentText);
    pendingScroll = desk.scrollTop;
    lastCommitCoalesced = false;
    applyText(history.pop());
    syncTools();
  }

  function redo() {
    if (!future.length) return;
    history.push(currentText);
    pendingScroll = desk.scrollTop;
    lastCommitCoalesced = false;
    applyText(future.pop());
    syncTools();
  }

  /* ---------- Zaznaczenie ---------- */

  function selectedInfo() {
    if (!sel || !ready()) return null;
    const beat = index.slots[sel.flat]?.voice.beats[sel.beat];
    return beat ? index.byBeat.get(beat) : null;
  }

  const selectedNote = (info) => (sel?.str ? info.beat.notes.find((n) => texString(n) === sel.str) : null);

  function select(info, note) {
    sel = { flat: info.flat, beat: info.pos, str: note ? texString(note) : null };
    // Pasek wartości pokazuje to, co zaznaczono, a nowe nuty dostają tę samą wartość
    tool.duration = info.beat.duration;
    tool.dotted = info.beat.dots > 0;
    fretBuffer = "";
    syncTools();
    drawSelection();
  }

  function clearSelection() {
    sel = null;
    syncTools();
    drawSelection();
  }

  /* ---------- Rysowanie nakładki ---------- */

  function box(className, x, y, w, h) {
    const el = document.createElement("div");
    el.className = className;
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    return el;
  }

  function drawSelection() {
    overlay.querySelectorAll(".sel").forEach((el) => el.remove());
    const info = selectedInfo();
    const lookup = api.renderer.boundsLookup;
    if (!info || !lookup) return;
    const note = selectedNote(info);
    for (const bb of lookup.findBeats(info.beat) ?? []) {
      const v = bb.visualBounds;
      overlay.append(box("sel sel-col", v.x - 4, v.y, v.w + 8, v.h));
      const nb = note && bb.notes?.find((n) => n.note === note);
      if (nb) {
        const h = nb.noteHeadBounds;
        overlay.append(box("sel sel-ring", h.x - 3, h.y - 2, h.w + 6, h.h + 4));
      }
    }
  }

  function drawHover(target) {
    overlay.querySelectorAll(".hover").forEach((el) => el.remove());
    if (!target || !target.preview) return;
    const { px, py, line } = target.preview;
    if (line) overlay.append(box("hover hover-line", px - 1, line.y, 2, line.h));
    const dot = box("hover hover-dot", px - 9, py - 9, 18, 18);
    dot.dataset.kind = target.kind;
    overlay.append(dot);
  }

  /* ---------- Co jest pod kursorem ---------- */

  const inside = (b, x, y, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

  function resolveTarget(x, y) {
    const lookup = api.renderer.boundsLookup;
    if (!enabled || !ready() || !lookup?.isFinished) return null;
    const kinds = state.view === "scoretab" ? ["score", "tab"] : [state.view];

    for (const system of lookup.staffSystems) {
      for (const mb of system.bars) {
        if (!inside(mb.visualBounds, x, y)) continue;

        for (let k = 0; k < mb.bars.length; k++) {
          const bb = mb.bars[k];
          const kind = kinds[k];
          const vb = bb.visualBounds;
          if (!kind || y < vb.y - 10 || y > vb.y + vb.h + 10) continue;

          // Trafienie w istniejącą nutę (na obu pięcioliniach)
          for (const beatBounds of bb.beats) {
            const hit = beatBounds.notes?.find((n) => inside(n.noteHeadBounds, x, y, HIT_NOTE_PAD));
            if (hit) {
              const info = index.byBeat.get(hit.note.beat);
              if (info) return { kind: "select", info, note: hit.note, preview: null };
            }
          }

          if (kind === "score") {
            const beatBounds = bb.beats.find((b) => inside(b.visualBounds, x, y, 4));
            const info = beatBounds && index.byBeat.get(beatBounds.beat);
            return info ? { kind: "select", info, note: null, preview: null } : null;
          }

          // Tabulatura: struna z wysokości kliknięcia, miejsce w takcie z pozycji poziomej
          const step = vb.h / (index.strings - 1);
          const row = Math.min(index.strings - 1, Math.max(0, Math.round((y - vb.y) / step)));
          const str = row + 1;
          const py = vb.y + row * step;

          const lane = bb.beats.filter((b) => b.beat.voice.index === 0);
          if (!lane.length) return null;
          let slot = lane.find((b) => x >= b.realBounds.x && x < b.realBounds.x + b.realBounds.w);
          let side = null;
          if (!slot) {
            if (x < lane[0].realBounds.x) [slot, side] = [lane[0], "before"];
            else [slot, side] = [lane.at(-1), "after"];
          }
          const info = index.byBeat.get(slot.beat);
          if (!info) return null;

          if (isRestBeat(info)) {
            if (tool.rest) return { kind: "select", info, note: null, preview: null };
            return { kind: "fill-rest", info, str, preview: { px: slot.onNotesX, py } };
          }

          const dx = x - slot.onNotesX;
          if (!side && Math.abs(dx) <= NEAR_NOTE_X) {
            const existing = info.beat.notes.find((n) => texString(n) === str);
            if (existing) return { kind: "select", info, note: existing, preview: null };
            if (tool.rest) return { kind: "select", info, note: null, preview: null };
            return { kind: "add-note", info, str, preview: { px: slot.onNotesX, py } };
          }
          side = side ?? (dx < 0 ? "before" : "after");
          return {
            kind: "insert",
            info,
            side,
            str,
            preview: { px: x, py: tool.rest ? vb.y + vb.h / 2 : py, line: { y: vb.y - 4, h: vb.h + 8 } },
          };
        }
      }
    }
    return null;
  }

  const pointer = (event) => {
    const rect = $("#alphaTab").getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /* ---------- Mysz ---------- */

  let hoverFrame = 0;
  page.addEventListener("mousemove", (event) => {
    if (!enabled) return;
    cancelAnimationFrame(hoverFrame);
    hoverFrame = requestAnimationFrame(() => {
      const { x, y } = pointer(event);
      const target = resolveTarget(x, y);
      drawHover(target);
      page.classList.toggle("is-over-note", target?.kind === "select");
    });
  });
  page.addEventListener("mouseleave", () => drawHover(null));

  page.addEventListener("click", (event) => {
    if (!enabled || !ready()) return;
    const { x, y } = pointer(event);
    const target = resolveTarget(x, y);
    drawHover(null);
    if (!target) return clearSelection();

    switch (target.kind) {
      case "select":
        select(target.info, target.note);
        break;
      case "fill-rest":
      case "add-note":
        commit(opAddNote(target.info, target.str));
        break;
      case "insert":
        commit(opInsertBeat(target.info, target.side, target.str));
        break;
    }
  });

  /* ---------- Klawiatura ---------- */

  function moveSelection(delta) {
    const info = selectedInfo();
    if (!info) return;
    const next = index.beats[info.order + delta];
    const sameVoice = next && index.slots[next.flat].voice.index === index.slots[info.flat].voice.index;
    if (!sameVoice) return;
    const notes = next.beat.notes;
    const want = sel.str ?? 1;
    const pick = notes.length ? notes.reduce((a, b) => (Math.abs(texString(b) - want) < Math.abs(texString(a) - want) ? b : a)) : null;
    select(next, pick);
    pendingScroll = null;
    scrollIntoViewIfNeeded(next);
  }

  function scrollIntoViewIfNeeded(info) {
    const bounds = api.renderer.boundsLookup?.findBeat(info.beat);
    if (!bounds) return;
    const top = bounds.visualBounds.y + $("#alphaTab").offsetTop;
    const view = desk.getBoundingClientRect().height;
    if (top < desk.scrollTop + 80 || top > desk.scrollTop + view - 120) desk.scrollTop = Math.max(0, top - view / 3);
  }

  function deleteSelected() {
    const info = selectedInfo();
    if (!info) return;
    const note = selectedNote(info);
    if (note) return commit(opRemoveNote(info, sel.str));
    if (isRestBeat(info)) commit(opDeleteBeat(info));
  }

  function typeDigit(digit) {
    const info = selectedInfo();
    if (!info || !sel.str) return;
    const now = Date.now();
    fretBuffer = now - fretAt < 1200 ? fretBuffer + digit : digit;
    fretAt = now;
    if (Number(fretBuffer) > 30) fretBuffer = digit;
    commit(opSetFret(info, sel.str, Number(fretBuffer)), { coalesce: true });
  }

  document.addEventListener("keydown", (event) => {
    if (!enabled) return;
    if (["TEXTAREA", "INPUT", "SELECT"].includes(event.target.tagName)) return;

    const key = event.key;
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "z") {
      event.preventDefault();
      return event.shiftKey ? redo() : undo();
    }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "y") {
      event.preventDefault();
      return redo();
    }
    if (event.ctrlKey || event.metaKey || event.altKey || !selectedInfo()) return;

    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      typeDigit(key);
    } else if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      deleteSelected();
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      moveSelection(key === "ArrowRight" ? 1 : -1);
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      if (sel.str) commit(opMoveString(selectedInfo(), sel.str, sel.str + (key === "ArrowDown" ? 1 : -1)));
    } else if (key === "Escape") {
      clearSelection();
    }
  });

  /* ---------- Pasek narzędzi ---------- */

  const durationButtons = toolsEl.querySelectorAll("[data-dur]");
  const dotButton = $("#toolDot");
  const restButton = $("#toolRest");

  function syncTools() {
    durationButtons.forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.dur) === tool.duration)));
    dotButton.setAttribute("aria-pressed", String(tool.dotted));
    restButton.setAttribute("aria-pressed", String(tool.rest));
    $("#toolUndo").disabled = history.length === 0;
    $("#toolRedo").disabled = future.length === 0;
    $("#toolDelete").disabled = !selectedInfo();
  }

  durationButtons.forEach((button) =>
    button.addEventListener("click", () => {
      tool.duration = Number(button.dataset.dur);
      const info = selectedInfo();
      if (info && info.beat.duration !== tool.duration) commit(opSetDuration(info, tool.duration));
      else syncTools();
    }),
  );

  dotButton.addEventListener("click", () => {
    tool.dotted = !tool.dotted;
    const info = selectedInfo();
    if (info) commit(opSetDotted(info, tool.dotted));
    syncTools();
  });

  restButton.addEventListener("click", () => {
    tool.rest = !tool.rest;
    syncTools();
  });

  $("#toolDelete").addEventListener("click", deleteSelected);
  $("#toolUndo").addEventListener("click", undo);
  $("#toolRedo").addEventListener("click", redo);

  function setEnabled(on) {
    enabled = on;
    store.set("cardEdit", on ? "1" : "0");
    toggleButton.setAttribute("aria-pressed", String(on));
    toolsEl.hidden = !on;
    page.classList.toggle("is-editing", on);
    if (!on) {
      sel = null;
      drawHover(null);
      drawSelection();
    }
    syncTools();
  }
  toggleButton.addEventListener("click", () => setEnabled(!enabled));

  /* ---------- Po wczytaniu i narysowaniu ---------- */

  const DEFAULT_HINT = toolsHint.textContent;

  api.scoreLoaded.on((score) => buildIndex(score));

  api.renderFinished.on(() => {
    if (pendingScroll !== null) {
      desk.scrollTop = pendingScroll;
      pendingScroll = null;
    }
    toolsHint.textContent = enabled && !ready() && !fileMode
      ? "Edycja kliknięciem nie działa dla tego zapisu (kilka ścieżek albo powtórzenia z gwiazdką). Edytuj tekst po lewej."
      : DEFAULT_HINT;
    drawSelection();
    warnAboutBarLength();
    syncTools();
  });

  // Po wstawieniu nuty takt bywa dłuższy niż wynika z metrum; sygnalizujemy to, nie blokujemy
  function warnAboutBarLength() {
    const info = selectedInfo();
    if (!info) return;
    try {
      const slot = index.slots[info.flat];
      const actual = slot.voice.beats.reduce((sum, b) => sum + (b.playbackDuration ?? b.displayDuration), 0);
      const expected = slot.bar.masterBar.calculateDuration();
      if (!expected || Math.abs(actual - expected) < 1) return;
      const quarters = Math.round((Math.abs(actual - expected) / TICKS_PER_QUARTER) * 100) / 100;
      const unit = quarters === 1 ? "ćwierćnutę" : Number.isInteger(quarters) && quarters >= 5 ? "ćwierćnut" : "ćwierćnuty";
      const amount = String(quarters).replace(".", ",");
      setStatus(`Takt ${slot.bar.index + 1} jest ${actual > expected ? "za długi" : "za krótki"} o ${amount} ${unit} względem metrum.`);
    } catch {
      /* ostrzeżenie jest dodatkiem */
    }
  }

  const resetHistory = () => {
    sel = null;
    history = [];
    future = [];
    syncTools();
  };
  sourceEl.addEventListener("input", resetHistory);
  document.addEventListener("song-opened", resetHistory); // cofanie nie może przenieść tekstu między utworami

  setEnabled(enabled);
})();
