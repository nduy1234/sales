import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicHost } from "../src/lib/net.ts";

test("blocks private, loopback, metadata and local hosts", () => {
  for (const u of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://172.20.1.1/", "http://192.168.1.1/", "http://169.254.169.254/latest", "http://[::1]/", "http://printer.local/", "http://intranet/", "file:///etc/passwd", "http://100.64.0.1/"])
    assert.equal(isPublicHost(new URL(u)), false, u);
});

test("allows normal public websites", () => {
  for (const u of ["https://example.com/", "http://8.8.8.8/", "https://shop.acme.co.uk/path", "http://172.32.0.1/"]) assert.equal(isPublicHost(new URL(u)), true, u);
});
