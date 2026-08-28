import assert from "node:assert/strict";
import { once } from "node:events";
import { connect, Socket } from "node:net";
import { Duplex, PassThrough } from "node:stream";
import test from "node:test";
import {
  bufferPendingTunnel,
  destroyUpstreamOnClientDisconnect,
  PinnedAddressBook,
  startPinnedBrowserProxy,
} from "../src/pinned-browser-proxy.js";

test("a hostname is resolved once and remains pinned to its validated address", async () => {
  let calls = 0;
  const addresses = new PinnedAddressBook(async () => {
    calls += 1;
    return calls === 1
      ? [{ address: "203.0.113.20", family: 4 }]
      : [{ address: "127.0.0.1", family: 4 }];
  });

  assert.deepEqual(await addresses.resolve("example.test"), {
    address: "203.0.113.20",
    family: 4,
  });
  assert.deepEqual(await addresses.resolve("EXAMPLE.test."), {
    address: "203.0.113.20",
    family: 4,
  });
  assert.equal(calls, 1);
});

test("private or mixed DNS answers are never approved", async () => {
  const privateOnly = new PinnedAddressBook(async () => [
    { address: "192.168.1.10", family: 4 },
  ]);
  await assert.rejects(
    privateOnly.resolve("private.example"),
    /UNSAFE_SCREENSHOT_DESTINATION/,
  );

  const mixed = new PinnedAddressBook(async () => [
    { address: "203.0.113.20", family: 4 },
    { address: "10.0.0.5", family: 4 },
  ]);
  await assert.rejects(
    mixed.resolve("rebinding.example"),
    /UNSAFE_SCREENSHOT_DESTINATION/,
  );

  const mapped = new PinnedAddressBook(async () => [
    { address: "::ffff:8.8.8.8", family: 6 },
    { address: "::ffff:192.168.1.10", family: 6 },
  ]);
  await assert.rejects(
    mapped.resolve("mapped-rebinding.example"),
    /UNSAFE_SCREENSHOT_DESTINATION/,
  );
});

test("public IPv4 and IPv6 DNS answers remain approved", async () => {
  const ipv4 = new PinnedAddressBook(async () => [
    { address: "8.8.8.8", family: 4 },
  ]);
  assert.deepEqual(await ipv4.resolve("ipv4.example"), {
    address: "8.8.8.8",
    family: 4,
  });

  const ipv6 = new PinnedAddressBook(async () => [
    { address: "2001:4860:4860::8888", family: 6 },
  ]);
  assert.deepEqual(await ipv6.resolve("ipv6.example"), {
    address: "2001:4860:4860::8888",
    family: 6,
  });
});

test("closing a CONNECT client destroys its still-pending upstream socket", async () => {
  const client = new PassThrough();
  const upstream = new Socket();
  destroyUpstreamOnClientDisconnect(client, upstream);

  const upstreamClosed = once(upstream, "close");
  client.destroy();
  await upstreamClosed;
  assert.equal(upstream.destroyed, true);
});

test("an upstream socket is destroyed when its client already disconnected", async () => {
  const client = new PassThrough();
  const clientClosed = once(client, "close");
  client.destroy();
  await clientClosed;
  const upstream = new Socket();
  const upstreamClosed = once(upstream, "close");

  destroyUpstreamOnClientDisconnect(client, upstream);

  await upstreamClosed;
  assert.equal(upstream.destroyed, true);
});

test("CONNECT bytes received before the upstream connection are buffered in order", async () => {
  const client = new PassThrough();
  const received: Buffer[] = [];
  const upstream = new Duplex({
    read() {},
    write(chunk: Buffer, _encoding, callback) {
      received.push(Buffer.from(chunk));
      callback();
    },
  });
  const connectTunnel = bufferPendingTunnel(
    client,
    upstream,
    Buffer.from("head-"),
  );
  client.write("after-head");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received.length, 0);

  connectTunnel();

  assert.equal(Buffer.concat(received).toString(), "head-after-head");
  client.destroy();
  upstream.destroy();
});

test("an idle proxy closes without missing the server close event", async () => {
  const proxy = await startPinnedBrowserProxy(
    new PinnedAddressBook(async () => [
      { address: "203.0.113.20", family: 4 },
    ]),
  );
  await proxy.close();
});

test("closing the proxy destroys clients that still keep tunnels open", async () => {
  const proxy = await startPinnedBrowserProxy(
    new PinnedAddressBook(async () => [
      { address: "203.0.113.20", family: 4 },
    ]),
  );
  const proxyUrl = new URL(proxy.url);
  const client = connect(Number(proxyUrl.port), proxyUrl.hostname);
  await once(client, "connect");
  const clientClosed = once(client, "close");

  await proxy.close();
  await clientClosed;
  assert.equal(client.destroyed, true);
});
