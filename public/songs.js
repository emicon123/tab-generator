"use strict";

/*
 * Biblioteka utworów: lista, otwieranie, nowy utwór i autozapis do plików w katalogu songs/ na serwerze.
 * Zależy od globalnych z app.js: sourceEl, setStatus, applyText, store, $.
 */
const songLibrary = (() => {
  const select = $("#song");
  const saveState = $("#saveState");
  const dialog = $("#newDialog");
  const titleInput = $("#newTitle");

  const SAVE_DELAY = 700;
  let currentId = null;
  let lastSaved = "";
  let saveTimer = 0;
  let saving = Promise.resolve();

  async function request(path, options) {
    const response = await fetch(`api/songs${path}`, options);
    if (!response.ok) throw new Error(`${response.status}`);
    return response;
  }

  function showSaveState(message, isError = false) {
    saveState.textContent = message;
    saveState.classList.toggle("is-error", isError);
  }

  /* ---------- Lista ---------- */

  async function refreshList(selectId) {
    const songs = await (await request("")).json();
    select.replaceChildren(
      ...songs.map((song) => Object.assign(document.createElement("option"), { value: song.id, textContent: song.title })),
    );
    if (selectId) select.value = selectId;
    return songs;
  }

  async function open(id) {
    await flush();
    const text = await (await request(`/${id}`)).text();
    currentId = id;
    lastSaved = text;
    store.set("song", id);
    select.value = id;
    showSaveState("Zapisano");
    document.dispatchEvent(new Event("song-opened")); // edycja na karcie czyści historię cofania
    applyText(text);
  }

  /* ---------- Zapis ---------- */

  function save(text) {
    const id = currentId;
    showSaveState("Zapisywanie…");
    saving = saving
      .then(() => request(`/${id}`, { method: "PUT", body: text }))
      .then(async () => {
        if (id === currentId && text === lastSaved) showSaveState("Zapisano");
        if (id === currentId) await refreshTitle(id, text);
      })
      .catch(() => showSaveState("Nie zapisano: brak połączenia z serwerem", true));
    lastSaved = text;
    return saving;
  }

  // Tytuł na liście pochodzi z \title w pliku, więc po zmianie tytułu odświeżamy napis
  async function refreshTitle(id, text) {
    const match = /^\s*\\title\s+["']([^"'\n]*)/m.exec(text);
    const option = [...select.options].find((o) => o.value === id);
    if (option && match && match[1].trim()) option.textContent = match[1].trim();
  }

  function changed(text) {
    if (!currentId || text === lastSaved) return;
    clearTimeout(saveTimer);
    if (!text.trim()) {
      showSaveState("Pusty tekst nie jest zapisywany", true);
      return;
    }
    showSaveState("Niezapisane zmiany…");
    saveTimer = setTimeout(() => save(text), SAVE_DELAY);
  }

  // Zapis oczekujących zmian przed przełączeniem utworu albo zamknięciem karty
  async function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
      const text = sourceEl.value;
      if (currentId && text !== lastSaved && text.trim()) await save(text);
    }
    await saving;
  }

  document.addEventListener("score-text", (event) => changed(event.detail));

  window.addEventListener("beforeunload", () => {
    const text = sourceEl.value;
    if (currentId && text !== lastSaved && text.trim()) {
      fetch(`api/songs/${currentId}`, { method: "PUT", body: text, keepalive: true });
    }
  });

  /* ---------- Nowy utwór i import ---------- */

  async function create(title, text) {
    await flush();
    const created = await (
      await request("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, text }) })
    ).json();
    await refreshList(created.id);
    await open(created.id);
    return created;
  }

  $("#newSong").addEventListener("click", () => {
    titleInput.value = "";
    dialog.showModal();
    titleInput.focus();
  });

  dialog.addEventListener("close", async () => {
    if (dialog.returnValue !== "ok") return;
    try {
      await create(titleInput.value.trim() || "Nowy utwór");
    } catch {
      setStatus("Nie udało się utworzyć utworu: brak połączenia z serwerem.", true);
    }
  });

  select.addEventListener("change", () => {
    open(select.value).catch(() => setStatus("Nie udało się otworzyć utworu.", true));
  });

  /* ---------- Start ---------- */

  // Dawniej tekst leżał tylko w pamięci przeglądarki. Jeśli ktoś tam coś zmieniał, zapisujemy to jako osobny utwór.
  async function migrateLegacy(songs) {
    const legacy = store.get("source", "");
    if (!legacy) return songs;
    store.remove("source");
    const staleSample = legacy.includes("\\voice\n3.6.2{d}"); // stara wersja przykładu z basem
    const known = await Promise.all(songs.map(async (s) => (await (await request(`/${s.id}`)).text()).trim()));
    if (staleSample || !legacy.trim() || known.includes(legacy.trim())) return songs;
    const title = (/^\s*\\title\s+["']([^"'\n]*)/m.exec(legacy)?.[1] ?? "").trim() || "Utwór z przeglądarki";
    await request("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${title} (z przeglądarki)`, text: legacy }),
    });
    return (await refreshList(null)) ?? songs;
  }

  async function init() {
    try {
      let songs = await refreshList(null);
      songs = await migrateLegacy(songs);
      await refreshList(null);
      const remembered = store.get("song", "");
      const id = [...select.options].some((o) => o.value === remembered) ? remembered : select.options[0]?.value;
      if (!id) return create("Nowy utwór");
      await open(id);
    } catch {
      showSaveState("Brak połączenia z serwerem zapisu", true);
      setStatus("Nie ma połączenia z serwerem zapisu. Uruchom aplikację przez npm start.", true);
    }
  }

  return { init, create, flush, get current() { return currentId; } };
})();
