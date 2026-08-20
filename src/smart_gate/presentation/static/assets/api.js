export class ApiError extends Error {
  constructor(message, status = 0, code = "UNKNOWN_ERROR", details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
    this.csrfToken = null;
  }

  setCsrfToken(token) {
    this.csrfToken = token || null;
  }

  async request(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    let body = options.body;

    if (body && !(body instanceof FormData) && !(body instanceof Blob) && typeof body !== "string") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && this.csrfToken) {
      headers.set("X-CSRF-Token", this.csrfToken);
    }

    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        method,
        headers,
        body,
        credentials: "include",
      });
    } catch (error) {
      throw new ApiError(
        "Không thể kết nối máy chủ. Hãy kiểm tra trạng thái Docker và thử lại.",
        0,
        "NETWORK_ERROR",
        { cause: String(error) },
      );
    }

    if (!response.ok) {
      const payload = await this.parsePayload(response);
      const error = payload?.error || {};
      const apiError = new ApiError(
        error.message || `Yêu cầu thất bại với mã HTTP ${response.status}`,
        response.status,
        error.code || "HTTP_ERROR",
        error.details || {},
      );
      if (response.status === 401 && !options.skipUnauthorizedEvent) {
        window.dispatchEvent(new CustomEvent("smartgate:unauthorized"));
      }
      throw apiError;
    }

    if (options.responseType === "blob") {
      return response.blob();
    }
    if (response.status === 204) {
      return null;
    }
    return this.parsePayload(response);
  }

  async parsePayload(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  get(path, options = {}) {
    return this.request(path, { ...options, method: "GET" });
  }

  post(path, body, options = {}) {
    return this.request(path, { ...options, method: "POST", body });
  }

  patch(path, body, options = {}) {
    return this.request(path, { ...options, method: "PATCH", body });
  }

  delete(path, options = {}) {
    return this.request(path, { ...options, method: "DELETE" });
  }

  blob(path) {
    return this.request(path, { method: "GET", responseType: "blob" });
  }
}
