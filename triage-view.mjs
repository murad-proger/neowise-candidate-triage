// Чистая логика отображения: не зависит от браузера, поэтому проверяется тестом в Node.

const TOPIC_LABELS = { delivery: "Доставка", pricing: "Цены и стоимость", other: "Другое" };

const MESSAGES = {
  pending: "Разбираем заявку…",
  invalid: "Введите текст заявки.",
  manual:
    "AI не смог разобрать эту заявку. Разберите её вручную: прочитайте текст и ответьте клиенту сами. Черновик не создан.",
};

export function pendingView() {
  return { kind: "pending", message: MESSAGES.pending, topic: null, draft: null };
}

// Превращает ответ API в то, что видит менеджер. Всё неожиданное считаем ручным разбором.
export function viewFor(httpStatus, body) {
  if (httpStatus === 400 && body?.status === "invalid_input") {
    return { kind: "invalid", message: MESSAGES.invalid, topic: null, draft: null };
  }
  if (
    httpStatus === 200 &&
    body?.status === "ready" &&
    Object.hasOwn(TOPIC_LABELS, body.topic) &&
    typeof body.draft === "string" &&
    body.draft.trim() !== ""
  ) {
    return { kind: "ready", message: "", topic: TOPIC_LABELS[body.topic], draft: body.draft };
  }
  return { kind: "manual", message: MESSAGES.manual, topic: null, draft: null };
}

// Каждый вызов полностью перезаписывает вывод, поэтому старый черновик не переживает новый результат.
export function applyView(els, view) {
  els.status.textContent = view.message;
  els.status.dataset.kind = view.kind;
  els.topic.textContent = view.topic ?? "";
  els.draft.textContent = view.draft ?? "";
  els.panel.hidden = view.kind !== "ready";
}
