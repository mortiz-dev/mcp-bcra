import { describe, expect, it } from "vitest";
import { registerAllTools } from "../src/tools/registerAllTools.js";
import { FakeServer } from "./helpers/fakeServer.js";

describe("registerAllTools", () => {
  it("registers every expected tool", () => {
    const fakeServer = new FakeServer();
    registerAllTools(fakeServer as never);

    expect([...fakeServer.tools.keys()].sort()).toEqual([
      "get-bcra-cheque-denunciado",
      "get-bcra-client-central-deudores",
      "get-bcra-client-central-deudores-historical",
      "get-bcra-client-cheques-rechazados",
      "get-bcra-entities",
      "get-bcra-fx-currencies",
      "get-bcra-fx-quote-by-currency",
      "get-bcra-fx-quotes",
      "get-bcra-transparencia-producto",
      "get-bcra-var-hist",
      "get-bcra-variables",
    ]);
  });
});
