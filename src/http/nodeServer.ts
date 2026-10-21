import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { HttpApp } from "./app.js";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const SKIP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export class NodeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "NodeHttpError";
    this.status = status;
  }
}

const readBody = async (req: IncomingMessage): Promise<Uint8Array | undefined> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new NodeHttpError(413, "Request body is too large");
    }
    chunks.push(buffer);
  }
  if (total === 0) return undefined;
  return new Uint8Array(Buffer.concat(chunks));
};

export const toWebRequest = async (req: IncomingMessage): Promise<Request> => {
  const hostHeader = req.headers.host;
  const host = hostHeader && hostHeader.length > 0 ? hostHeader : "invalid.local";
  let url: URL;
  try {
    url = new URL(req.url ?? "/", `http://${host}`);
  } catch {
    throw new NodeHttpError(400, "Invalid request target");
  }
  const headers = new Headers();
  headers.set("host", host);
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key === "host" || SKIP_HEADERS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.append(key, value);
    }
  }
  const method = req.method ?? "GET";
  const bodyless = method === "GET" || method === "HEAD";
  const bytes = bodyless ? undefined : await readBody(req);
  const body = bytes ? new Blob([Buffer.from(bytes)]) : undefined;
  return new Request(url, { method, headers, body });
};

const writeWebResponse = async (
  res: ServerResponse,
  response: Response,
): Promise<void> => {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    const existing = headers[key];
    if (existing === undefined) {
      headers[key] = value;
      return;
    }
    headers[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  });
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (!res.write(Buffer.from(value))) await once(res, "drain");
    }
    res.end();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    res.destroy(error instanceof Error ? error : undefined);
  }
};

const sendPlain = (res: ServerResponse, status: number, error: string) => {
  if (res.headersSent || res.writableEnded) return;
  const body = JSON.stringify({ error });
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
};

export type ListeningServer = {
  port: number;
  close(): Promise<void>;
};

export const listenHttp = (
  app: HttpApp,
  host: string,
  port: number,
): Promise<ListeningServer> => {
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const request = await toWebRequest(req);
        const response = await app.fetch(request);
        await writeWebResponse(res, response);
      } catch (error) {
        const status = error instanceof NodeHttpError ? error.status : 500;
        const message =
          error instanceof NodeHttpError ? error.message : "Request failed";
        console.error(`[mcp-bcra] ${message}`);
        sendPlain(res, status, status === 413 ? "request_too_large" : "request_failed");
      }
    })();
  });

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
            void app.close();
          }),
      });
    });
  });
};
