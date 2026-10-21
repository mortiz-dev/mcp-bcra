import { createHttpApp } from "./app.js";
import { resolveHttpConfig } from "./config.js";
import { type ListeningServer, listenHttp } from "./nodeServer.js";
import { createConfiguredVerifier } from "./oidc.js";

const bindHost = (host: string): string =>
  host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

/**
 * Start the opt-in Streamable HTTP server. Does not return until the socket
 * is listening. The caller keeps the process alive via the open socket.
 */
export const startHttpServer = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<ListeningServer> => {
  const settings = resolveHttpConfig(env);
  const verifier =
    settings.auth.kind === "oidc"
      ? await createConfiguredVerifier(settings.auth)
      : undefined;
  if (settings.auth.kind === "insecure") {
    console.error(
      "[mcp-bcra] WARNING: MCP_AUTH_INSECURE_DEV is enabled. HTTP requests are not authenticated. Do not expose this process to a network.",
    );
  } else {
    console.error(
      `[mcp-bcra] OIDC resource server issuer ${settings.auth.issuer}, audience ${settings.auth.audiences.join(", ")}`,
    );
    console.error(
      `[mcp-bcra] Protected resource metadata ${settings.auth.resourceMetadataUrl}`,
    );
  }

  const app = createHttpApp({ settings, verifier });
  const listening = await listenHttp(app, bindHost(settings.host), settings.port);
  console.error(
    `[mcp-bcra] Streamable HTTP listening on http://${settings.host}:${listening.port}${settings.mcpPath}`,
  );

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    console.error("[mcp-bcra] shutting down");
    void listening.close().then(
      () => process.exit(0),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : "shutdown failed";
        console.error(`[mcp-bcra] ${message}`);
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  const close = listening.close.bind(listening);
  listening.close = async () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    await close();
  };
  return listening;
};
