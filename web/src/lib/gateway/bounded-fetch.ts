const TEXT_DECODER = new TextDecoder();

export function enforceRequestBodyLimit(request: Request, maxBytes: number) {
  const rawLength = request.headers.get("content-length");
  const contentLength = rawLength ? Number(rawLength) : 0;

  if (!contentLength || !Number.isFinite(contentLength)) {
    return "Content-Length header is required.";
  }
  if (contentLength > maxBytes) {
    return "Request body too large.";
  }
  return null;
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function readResponseTextBounded(response: Response, maxBytes: number) {
  const rawLength = response.headers.get("content-length");
  const contentLength = rawLength ? Number(rawLength) : 0;
  if (contentLength > maxBytes) throw new Error("Provider response too large.");

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Provider response too large.");
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return TEXT_DECODER.decode(combined);
}
