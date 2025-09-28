// src/api.ts

type Query = Record<string, string | number | boolean | undefined | null>;

const ENV_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE) ||
  (typeof process !== "undefined" && (process as any).env?.VITE_API_BASE) ||
  "";

function normalizeBase(base: string | undefined | null): string {
  const b = (base || "").trim();
  if (b) return b.replace(/\/+$/, ""); // убираем хвостовые слэши
  if (typeof window !== "undefined") return `${window.location.origin}/api`;
  return "/api";
}

const API_BASE = normalizeBase(ENV_BASE);

/** Собираем URL с query-параметрами */
function url(path: string, q?: Query): string {
  const u = `${API_BASE}/${path.replace(/^\/+/, "")}`;
  if (!q) return u;
  const p = new URL(u, "http://x/");
  Object.entries(q).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    p.searchParams.set(k, String(v));
  });
  // Делаем из абсолютного URL относительный (без http://x/)
  return p.pathname + (p.search ? p.search : "");
}

async function http<T>(
  path: string,
  opts: RequestInit & { query?: Query } = {}
): Promise<T> {
  const { query, headers, ...rest } = opts;
  const res = await fetch(url(path, query), {
    method: "GET",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    ...rest,
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text as any; } })() : null;

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.error || data.message)) ||
      res.statusText ||
      "Request failed";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

/* ================== PUBLIC API ================== */

/** Бренды */
export function getBrands() {
  return http<Array<{ id: number; name: string }> | { results: Array<{ id: number; name: string }> }>(
    "/brands/"
  );
}

/** Модели по бренду (+поиск q) */
export function getDeviceModels(params: { brand?: number; q?: string }) {
  return http<
    Array<{ id: number; name: string; brand: { id: number; name: string } }> | {
      results: Array<{ id: number; name: string; brand: { id: number; name: string } }>;
    }
  >("/models/", { query: params as Query });
}

/** Типы неисправностей */
export function getIssues() {
  return http<Array<{ id: number; code: string; name: string }> | { results: Array<{ id: number; code: string; name: string }> }>(
    "/issues/"
  );
}

/** Цены для модели (списком по всем issue) */
export function getModelPrices(modelId: number) {
  return http<
    Array<{
      id: number;
      device_model: number;
      issue: { id: number; code: string; name: string };
      price_min: number | string;
      price_max: number | string;
      hours: number | string;
    }>
  >("/model-prices/", { query: { model: modelId } });
}

/** Сервисные центры */
export function getCenters() {
  return http<
    Array<{ id: number; name: string; address: string; lat: number; lng: number }> | {
      results: Array<{ id: number; name: string; address: string; lat: number; lng: number }>;
    }
  >("/servicecenters/");
}

/** Создать заявку на ремонт */
export function createRequest(payload: {
  brand: string;
  model: string;
  issue: string;
  urgency: number;
  description?: string;
  center: number;
  customer_name: string;
  customer_phone: string;
  agree_to_offer: boolean;
}) {
  return http<any>("/repairs/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Получить заявку по id */
export function fetchRequestById(id: string | number) {
  return http<any>(`/repairs/${id}/`);
}

/** Сообщение в поддержку по заявке */
export function createSupportMessage(payload: {
  repair_request: number;
  text: string;
}) {
  return http<any>("/support-messages/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* Для отладки можно вывести базу API */
export const __API_BASE__ = API_BASE;
