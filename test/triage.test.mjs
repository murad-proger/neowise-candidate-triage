import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";
import { parseModelOutput, triage } from "../triage.mjs";
import { applyView, pendingView, viewFor } from "../triage-view.mjs";

let server;
let base;

before(async () => {
  server = createApp();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (body) =>
  fetch(`${base}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const MANUAL = { status: "manual_review", topic: null, draft: null };

test("корректный ввод: тема определяется, черновик непустой", async () => {
  for (const [text, topic] of [
    ["Когда доставка?", "delivery"],
    ["Какая цена?", "pricing"],
    ["Здравствуйте", "other"],
  ]) {
    const response = await post({ text });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ready");
    assert.equal(body.topic, topic);
    assert.ok(body.draft.trim().length > 0);
  }
});

test("некорректный ввод даёт 400 invalid_input", async () => {
  const bad = [{}, { text: "" }, { text: "   \n" }, { text: 42 }, { text: null }, { text: ["a"] }, "null", "[]", "{broken"];
  for (const body of bad) {
    const response = await post(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { status: "invalid_input" });
  }
});

test("сбои имитатора дают manual_review с HTTP 200", async () => {
  for (const marker of ["[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
    const response = await post({ text: `Нужна цена ${marker}` });
    assert.equal(response.status, 200, marker);
    assert.deepEqual(await response.json(), MANUAL, marker);
  }
});

test("таймаут: ответ приходит около 300 мс, а не после 1200 мс", async () => {
  const started = performance.now();
  const response = await post({ text: "Доставка [timeout]" });
  const elapsed = performance.now() - started;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), MANUAL);
  assert.ok(elapsed >= 250 && elapsed < 900, `elapsed ${Math.round(elapsed)} ms`);
});

test("triage не зависит от того, уважает ли провайдер abort-сигнал", async () => {
  const hangs = () => new Promise(() => {});
  assert.deepEqual(await triage("x", { classifyFn: hangs, timeoutMs: 20 }), MANUAL);
});

test("parseModelOutput отклоняет не-объекты и неполные объекты", () => {
  for (const raw of ["null", "[]", "42", '"text"', "{}", '{"topic":"other"}', '{"topic":"other","draft":5}', undefined]) {
    assert.equal(parseModelOutput(raw), null, String(raw));
  }
  assert.deepEqual(parseModelOutput('{"topic":"other","draft":"ok"}'), { topic: "other", draft: "ok" });
});

test("страница: manual_review очищает предыдущий черновик и показывает сообщение", () => {
  const els = { status: { dataset: {} }, topic: {}, draft: {}, panel: {} };

  applyView(els, viewFor(200, { status: "ready", topic: "delivery", draft: "Старый черновик" }));
  assert.equal(els.draft.textContent, "Старый черновик");
  assert.equal(els.panel.hidden, false);

  applyView(els, pendingView());
  assert.equal(els.draft.textContent, "");
  assert.equal(els.panel.hidden, true);

  applyView(els, viewFor(200, MANUAL));
  assert.equal(els.draft.textContent, "");
  assert.equal(els.topic.textContent, "");
  assert.equal(els.panel.hidden, true);
  assert.equal(els.status.dataset.kind, "manual");
  assert.match(els.status.textContent, /вручную/);
});

test("страница: ошибка сети, HTTP 500 и мусорный ответ тоже ведут к ручному разбору", () => {
  for (const [status, body] of [[0, null], [500, { status: "server_error" }], [200, { status: "ready", topic: "refund", draft: "x" }], [200, { status: "ready", topic: "other", draft: " " }]]) {
    assert.equal(viewFor(status, body).kind, "manual");
  }
});
