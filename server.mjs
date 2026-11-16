// Serwer lokalny: pliki statyczne z public/ oraz zapis utworów jako pliki .alphatex w songs/.
// Bez zależności, tylko Node.
import { createServer } from "node:http";
import { readFile, writeFile, readdir, rename, stat, mkdir } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const SONGS = join(ROOT, "songs");
const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST ?? "0.0.0.0";
const MAX_BODY = 1_000_000;
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

const songPath = (id) => join(SONGS, `${id}.alphatex`);

function titleOf(text, fallback) {
  const match = /^\s*\\title\s+["']([^"'\n]*)["']?/m.exec(text);
  return match?.[1].trim() || fallback;
}

function slugify(title) {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "utwor";
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function uniqueId(title) {
  const base = slugify(title);
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (!(await exists(songPath(id)))) return id;
  }
}

// Zapis przez plik tymczasowy, żeby przerwany zapis nie zostawił uciętego utworu
async function saveSong(id, text) {
  const target = songPath(id);
  const temp = `${target}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, target);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Za duży plik"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const template = (title) =>
  `\\title "${title}"\n\\tempo 100\n\\ts 4 4\n.\nr.1 | r.1 | r.1 | r.1 |\n`;

const cleanTitle = (title) => String(title ?? "").replace(/["\\\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}
const sendJson = (res, status, data) => send(res, status, JSON.stringify(data));

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "songs", id?]
  if (parts[1] !== "songs") return sendJson(res, 404, { error: "Nie ma takiego adresu" });
  const id = parts[2];

  if (!id && req.method === "GET") {
    const files = (await readdir(SONGS)).filter((f) => f.endsWith(".alphatex"));
    const songs = await Promise.all(
      files.map(async (file) => {
        const songId = file.slice(0, -".alphatex".length);
        return { id: songId, title: titleOf(await readFile(join(SONGS, file), "utf8"), songId) };
      }),
    );
    songs.sort((a, b) => a.title.localeCompare(b.title, "pl"));
    return sendJson(res, 200, songs);
  }

  if (!id && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const title = cleanTitle(body.title) || "Nowy utwór";
    const text = typeof body.text === "string" && body.text.trim() ? body.text : template(title);
    const newId = await uniqueId(title);
    await saveSong(newId, text);
    return sendJson(res, 201, { id: newId, title: titleOf(text, title) });
  }

  if (id && ID.test(id)) {
    if (req.method === "GET") {
      if (!(await exists(songPath(id)))) return sendJson(res, 404, { error: "Nie ma takiego utworu" });
      return send(res, 200, await readFile(songPath(id), "utf8"), "text/plain; charset=utf-8");
    }
    if (req.method === "PUT") {
      if (!(await exists(songPath(id)))) return sendJson(res, 404, { error: "Nie ma takiego utworu" });
      await saveSong(id, await readBody(req));
      res.writeHead(204, { "Cache-Control": "no-store" });
      return res.end();
    }
  }
  return sendJson(res, 400, { error: "Nieprawidłowe żądanie" });
}

async function handleStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Metoda niedozwolona", "text/plain");
  const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = resolve(PUBLIC, "." + relative);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return send(res, 403, "Brak dostępu", "text/plain");
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    send(res, 404, "Nie znaleziono", "text/plain");
  }
}

await mkdir(SONGS, { recursive: true });

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await handleStatic(req, res, url);
  } catch (error) {
    sendJson(res, error.status ?? 500, { error: error.status ? error.message : "Błąd serwera" });
  }
}).listen(PORT, HOST, () => console.log(`Nuty i tabulatura: http://localhost:${PORT} (utwory w ${SONGS})`));
