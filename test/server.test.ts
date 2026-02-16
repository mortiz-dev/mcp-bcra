import { describe, expect, it } from "vitest";
import createServer from "../src/server.js";

describe("server factory", () => {
  it("createServer returns a server-like object", () => {
    const server = createServer();
    expect(server).toBeTruthy();
    expect(typeof server.tool).toBe("function");
    expect(typeof server.connect).toBe("function");
  });
});
