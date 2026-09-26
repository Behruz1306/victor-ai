"use client";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data;
}

export async function apiGet<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { cache: "no-store" }));
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export const POLL_MS = 3000;

/** Type of a server value after JSON round-trip (Dates become strings). */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;
