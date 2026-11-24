import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { triage } from "./triage.mjs";

const MAX_BODY_BYTES = 64 * 1024;

const html = await readFile(new URL("./index.html", import.meta.url));
const viewModule = await readFile(new URL("./triage-view.mjs", import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

// Возвращает непустую строку text или null, если ввод некорректен.
async function readText(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const text = body?.text;
    return typeof text === "string" && text.trim() !== "" ? text : null;
  } catch {
    return null;
  }
}

async function handleTriage(request, response, triageFn) {
  const text = await readText(request);
  if (text === null) return json(response, 400, { status: "invalid_input" });
  return json(response, 200, await triageFn(text));
}

export function createApp({ triageFn = triage } = {}) {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (request.method === "GET" && request.url === "/triage-view.mjs") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(viewModule);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
      return json(response, 404, { status: "not_found" });
    }
    try {
      await handleTriage(request, response, triageFn);
    } catch {
      if (!response.headersSent) json(response, 500, { status: "server_error" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const app = createApp();
  app.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Порт ${port} уже занят. Запустите так: PORT=3001 node server.mjs`
        : `Не удалось запустить сервер: ${error.message}`,
    );
    process.exit(1);
  });
  app.listen(port, "127.0.0.1", () => console.log(`Открыть: http://127.0.0.1:${port}`));
}