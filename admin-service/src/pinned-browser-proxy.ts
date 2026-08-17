import { lookup as dnsLookup } from "node:dns/promises";
import { once } from "node:events";
import {
  createServer,
  request as createHttpRequest,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import { connect as createSocket } from "node:net";
import type { Duplex } from "node:stream";
import { isPrivateHost } from "./urls.js";

export type PinnedAddress = {
  address: string;
  family: 4 | 6;
};

type Lookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

const normalizedHost = (hostname: string): string =>
  hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

export class PinnedAddressBook {
  private readonly addresses = new Map<string, Promise<PinnedAddress>>();

  constructor(private readonly lookup: Lookup = dnsLookup) {}

  resolve(hostname: string): Promise<PinnedAddress> {
    const host = normalizedHost(hostname);
    if (isPrivateHost(host)) return Promise.reject(new Error("PRIVATE_HOST"));
    let resolution = this.addresses.get(host);
    if (!resolution) {
      resolution = this.resolveOnce(host);
      this.addresses.set(host, resolution);
    }
    return resolution;
  }

  private async resolveOnce(host: string): Promise<PinnedAddress> {
    const results = await this.lookup(host, { all: true, verbatim: true });
    if (
      !results.length ||
      results.some(
        ({ address, family }) =>
          (family !== 4 && family !== 6) || isPrivateHost(address),
      )
    ) {
      throw new Error("UNSAFE_SCREENSHOT_DESTINATION");
    }
    const selected = results.find(({ family }) => family === 4) ?? results[0]!;
    return {
      address: selected.address,
      family: selected.family as 4 | 6,
    };
  }
}

const reject = (response: ServerResponse, status: number): void => {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Proxy request rejected");
};

const httpTarget = (request: IncomingMessage): URL | null => {
  try {
    const target = new URL(request.url || "");
    if (target.protocol !== "http:" || (target.port && target.port !== "80")) {
      return null;
    }
    return target;
  } catch {
    return null;
  }
};

const handleHttp = async (
  addressBook: PinnedAddressBook,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const target = httpTarget(request);
  if (!target) return reject(response, 403);
  try {
    const pinned = await addressBook.resolve(target.hostname);
    const headers: OutgoingHttpHeaders = {
      ...request.headers,
      host: target.host,
    };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const upstream = createHttpRequest({
      hostname: pinned.address,
      family: pinned.family,
      port: 80,
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers,
    });
    upstream.on("response", (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    });
    upstream.on("error", () => reject(response, 502));
    request.pipe(upstream);
  } catch {
    reject(response, 403);
  }
};

const connectTarget = (authority: string | undefined): URL | null => {
  try {
    const target = new URL(`https://${authority || ""}`);
    if (target.port && target.port !== "443") return null;
    return target;
  } catch {
    return null;
  }
};

const handleConnect = async (
  addressBook: PinnedAddressBook,
  request: IncomingMessage,
  client: Duplex,
  head: Buffer,
): Promise<void> => {
  const target = connectTarget(request.url);
  if (!target) {
    client.destroy();
    return;
  }
  try {
    const pinned = await addressBook.resolve(target.hostname);
    const upstream = createSocket({
      host: pinned.address,
      family: pinned.family,
      port: 443,
    });
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.once("error", () => client.destroy());
    client.once("error", () => upstream.destroy());
  } catch {
    client.destroy();
  }
};

export type PinnedBrowserProxy = {
  url: string;
  close: () => Promise<void>;
};

export const startPinnedBrowserProxy = async (
  addressBook: PinnedAddressBook,
): Promise<PinnedBrowserProxy> => {
  const server = createServer((request, response) => {
    void handleHttp(addressBook, request, response);
  });
  server.on("connect", (request, socket, head) => {
    void handleConnect(addressBook, request, socket, head);
  });
  server.on("clientError", (_error, socket) => {
    socket.destroy();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("SCREENSHOT_PROXY_UNAVAILABLE");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
};
