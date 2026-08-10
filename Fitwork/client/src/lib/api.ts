export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  // A 401 here means the session cookie is missing/expired — every action
  // in the app depends on it, so a bare inline error under whatever button
  // the user happened to click reads as "this feature is broken" rather
  // than "please sign in again". `/auth/me` is excluded since a 401 there
  // is the normal, silent way AuthProvider discovers there's no session on
  // first load; React Router's <Navigate> already handles that case.
  if (res.status === 401 && url !== "/auth/me" && typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login?expired=1";
    return new Promise<T>(() => {});
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T,>(url: string) => request<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body),
  put: <T,>(url: string, body?: unknown) => request<T>("PUT", url, body),
  patch: <T,>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  delete: <T,>(url: string, body?: unknown) => request<T>("DELETE", url, body),
};
