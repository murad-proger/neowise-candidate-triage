import { classify } from "./mock-ai.mjs";

export const MODEL_TIMEOUT_MS = 300;
const TOPICS = new Set(["delivery", "pricing", "other"]);

const manualReview = () => ({ status: "manual_review", topic: null, draft: null });

// Принимает «сырой» ответ модели и возвращает {topic, draft} либо null, если ответ непригоден.
export function parseModelOutput(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const { topic, draft } = data;
  if (typeof topic !== "string" || !TOPICS.has(topic)) return null;
  if (typeof draft !== "string" || draft.trim() === "") return null;
  return { topic, draft };
}

// Любой сбой модели (таймаут, исключение, мусорный ответ) превращается в manual_review.
export async function triage(text, { classifyFn = classify, timeoutMs = MODEL_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("model timeout"));
    }, timeoutMs);
  });
  try {
    const raw = await Promise.race([classifyFn(text, { signal: controller.signal }), timeout]);
    const parsed = parseModelOutput(raw);
    return parsed ? { status: "ready", ...parsed } : manualReview();
  } catch {
    return manualReview();
  } finally {
    clearTimeout(timer);
  }
}
