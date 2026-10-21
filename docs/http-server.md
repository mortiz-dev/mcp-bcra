# HTTP server mode

`mcp-bcra` is a read-only MCP server for public BCRA APIs. The default process speaks stdio and does not authenticate callers. Companies that want a shared deployment can opt in to [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports) and run this process as an [OAuth 2.1 resource server](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

The server does not issue tokens, does not perform the authorization-code flow, and does not store a client secret. It validates bearer JWTs and tells clients where the authorization server is.

## What the process checks

For every MCP request when OIDC is configured:

- The token is a JWT signed by a key from the issuer's JWKS (discovered from OpenID Connect, unless `MCP_AUTH_JWKS_URI` overrides it).
- `iss` matches `MCP_AUTH_ISSUER` exactly, including a trailing slash when the provider uses one.
- `aud` contains one of the values in `MCP_AUTH_AUDIENCE`.
- `exp` is present and the token is not expired (30 seconds of clock skew).
- Symmetric algorithms and `none` are rejected. There is no shared signing secret.
- If `MCP_AUTH_REQUIRED_SCOPES` is set, every listed scope must appear in the `scope` claim or, for Microsoft Entra delegated tokens, the `scp` claim.
- If `MCP_AUTH_REQUIRED_ROLES` is set, every listed value must appear in the `roles` claim.

A missing or invalid token gets `401` with `WWW-Authenticate: Bearer ...`. A token that fails the scope or role check gets `403` and `error="insufficient_scope"`. Both challenges include `resource_metadata` pointing at the protected-resource metadata document.

That document is public (no token) at:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource<mcp-path>` (the path-inserted RFC 9728 alias, for example `/.well-known/oauth-protected-resource/mcp`)

`authorization_servers` is the configured issuer. `bearer_methods_supported` is `header`. Tokens in the query string are rejected.

`GET /healthz` returns `{"status":"ok"}` and does not require a token. It exposes no BCRA data.

The `Host` header must match the public resource host, localhost, or `MCP_ALLOWED_HOSTS`. A present `Origin` header on `/mcp` must match that same set or `MCP_ALLOWED_ORIGINS`, otherwise the response is `403`. Requests without `Origin` (typical non-browser MCP clients) are allowed through that check.

## Environment

| Variable | Required in HTTP mode | Purpose |
|---|---|---|
| `MCP_TRANSPORT` | yes, set to `http` | `stdio` (default) or `http` |
| `MCP_HOST` | no | Bind address. Default `127.0.0.1`. Use `0.0.0.0` inside a container |
| `MCP_PORT` | no | Default `8080` |
| `MCP_RESOURCE_URL` | yes, unless insecure dev | Public URL of this MCP endpoint, for example `https://mcp.example.com/mcp`. The path is the local MCP path. No query or fragment |
| `MCP_AUTH_ISSUER` | yes, unless insecure dev | OIDC issuer. Must equal the token `iss` claim |
| `MCP_AUTH_AUDIENCE` | yes, unless insecure dev | Expected `aud`. Comma-separated if you accept more than one |
| `MCP_AUTH_REQUIRED_SCOPES` | no | Space- or comma-separated scopes |
| `MCP_AUTH_REQUIRED_ROLES` | no | Space- or comma-separated `roles` claim values |
| `MCP_AUTH_JWKS_URI` | no | Skip the JWKS URI from discovery. Issuer discovery still runs |
| `MCP_ALLOWED_HOSTS` | no | Extra `Host` names. Hostnames only, not URLs |
| `MCP_ALLOWED_ORIGINS` | no | Extra `Origin` hostnames for browser clients |
| `MCP_AUTH_INSECURE_DEV` | no | `true` starts HTTP with no authentication. Refused when any OIDC variable is set. Never expose this |

HTTP issuers and resource URLs are rejected unless the host is localhost. Discovery redirects are not followed.

stdio ignores this table. A desktop client that launches `node dist/index.js` with no `MCP_TRANSPORT` behaves as before.

The existing `BCRA_HTTP_*` variables still tune the outbound client that calls `api.bcra.gob.ar` and `www.bcra.gob.ar`. They are per process. Several replicas share an egress IP and need an external limit in front of them.

## Run

```bash
export MCP_TRANSPORT=http
export MCP_HOST=127.0.0.1
export MCP_PORT=8080
export MCP_RESOURCE_URL=https://mcp.example.com/mcp
export MCP_AUTH_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
export MCP_AUTH_AUDIENCE=api://<api-application-client-id>
export MCP_AUTH_REQUIRED_SCOPES=mcp.access

node dist/index.js
```

Place TLS on a reverse proxy. Point it at `127.0.0.1:8080` and forward the original `Host`. The proxy should not log `Authorization`.

Confirm discovery:

```bash
curl -sS https://mcp.example.com/.well-known/oauth-protected-resource
curl -i -X POST https://mcp.example.com/mcp
```

The POST is `401`. `WWW-Authenticate` includes `resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"`.

### Container

From a clone of this repository:

```bash
docker build -t mcp-bcra .
docker run --rm -p 8080:8080 \
  -e MCP_TRANSPORT=http \
  -e MCP_HOST=0.0.0.0 \
  -e MCP_PORT=8080 \
  -e MCP_RESOURCE_URL=https://mcp.example.com/mcp \
  -e MCP_AUTH_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0 \
  -e MCP_AUTH_AUDIENCE=api://<api-application-client-id> \
  -e MCP_AUTH_REQUIRED_SCOPES=mcp.access \
  -e MCP_ALLOWED_HOSTS=mcp.example.com \
  mcp-bcra
```

`compose.yaml` is the same shape. The image does not enable insecure mode. It will exit if the issuer, audience, or resource URL is missing.

## Microsoft Entra ID

A typical company tenant uses **two app registrations**. The MCP server is only the first one, and only as an API that exposes a scope. The server never needs a client secret. It only validates tokens.

### 1. API registration (the resource server)

This registration represents mcp-bcra. It is not the interactive client.

1. In the Microsoft Entra admin center, open **App registrations** and choose **New registration**.
2. Name it something like `mcp-bcra`. Choose **Accounts in this organizational directory only**. Leave the redirect URI empty. Register.
3. Copy **Application (client) ID** and **Directory (tenant) ID**.
4. Open **Expose an API**.
5. Set the **Application ID URI** to `api://<application-client-id>` (the client id of this API registration). Entra often suggests that value.
6. **Add a scope**:
   - Scope name: `mcp.access`
   - Who can consent: admins and users, or admins only if that matches local policy
   - Admin consent display name: `Access BCRA MCP`
   - Admin consent description: `Call the read-only BCRA MCP server`
   - State: Enabled
7. Open the application **Manifest** and set `accessTokenAcceptedVersion` to `2`. Save.

`accessTokenAcceptedVersion` must be `2`. With that flag, access tokens use the v2 issuer:

```text
https://login.microsoftonline.com/<tenant-id>/v2.0
```

v1 tokens use `https://sts.windows.net/<tenant-id>/` and will be rejected when the server is configured with the v2 issuer.

The server audience is **this API registration's client id** or **its Application ID URI** (`api://<client-id>`), whichever appears in the token `aud` claim. Requesting the exposed scope usually sets `aud` to the Application ID URI. You can list both, comma-separated, in `MCP_AUTH_AUDIENCE` if you need to accept either. Decode a token your client actually receives and copy `aud` and `iss`. Do not paste raw tokens into tickets or logs.

Delegated tokens put the granted scope in `scp` (the value is `mcp.access`, not the fully qualified `api://.../mcp.access`). The server treats `scp` and `scope` as the same list. Set `MCP_AUTH_REQUIRED_SCOPES=mcp.access`.

Application-only tokens (client credentials) often have no `scp`. They carry app roles in `roles`. If you use that flow, define an app role on this API registration (for example value `MCP.User`, allowed member type Applications), assign it to the client, and set `MCP_AUTH_REQUIRED_ROLES=MCP.User`. Do not also require `mcp.access` unless those tokens contain that scope.

Server environment for the common delegated case:

```bash
MCP_TRANSPORT=http
MCP_RESOURCE_URL=https://mcp.example.com/mcp
MCP_AUTH_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
MCP_AUTH_AUDIENCE=api://<api-application-client-id>
MCP_AUTH_REQUIRED_SCOPES=mcp.access
```

No client secret, certificate, or client credential is read by this process.

### 2. MCP client registration

The program that connects to mcp-bcra (a desktop MCP host, a company agent, or another service) has **its own** app registration, or it reuses a registration the client vendor already operates in your tenant. That registration is the OAuth client. It is not configured on the server.

1. Register the client, or open its existing registration.
2. **API permissions** → **Add a permission** → **My APIs** → the `mcp-bcra` API → **Delegated permissions** → `mcp.access`.
3. Grant admin consent when your tenant requires it.
4. Configure that client to request the scope `api://<api-application-client-id>/mcp.access`.
5. Public clients (desktop and native apps) should use authorization code with PKCE and do not have a secret. Confidential clients may have a secret or certificate. That credential stays with the client. Do not copy it into the MCP server environment.

The server never sees the client's secret. It sees only the access token the client presents, and it checks the signature, issuer, audience, expiry, and optional scopes or roles.

## Okta

Create an authorization server (the org authorization server or a custom one) and a custom scope such as `mcp.access`.

- `MCP_AUTH_ISSUER` is the authorization server issuer, for example `https://<org>.okta.com/oauth2/default` or `https://<org>.okta.com/oauth2/<authorization-server-id>`. It must match `iss`.
- `MCP_AUTH_AUDIENCE` is the audience configured on that authorization server (often `api://default` or a custom identifier).
- `MCP_AUTH_REQUIRED_SCOPES` is the custom scope.
- Discovery is `{issuer}/.well-known/openid-configuration`. Leave `MCP_AUTH_JWKS_URI` unset.

Register the MCP client in Okta so it can request that audience and scope. The MCP server does not need an Okta client secret.

## Auth0

Create an API. Its **Identifier** is the audience.

- `MCP_AUTH_ISSUER` is `https://<tenant>.auth0.com/` **including the trailing slash**, because Auth0 `iss` includes it. A missing slash fails issuer comparison.
- `MCP_AUTH_AUDIENCE` is the API identifier.
- Add a permission on the API and set `MCP_AUTH_REQUIRED_SCOPES` to that permission name.
- Register the MCP client in Auth0 separately and authorize it for that API. The MCP server does not need an Auth0 client secret.

## Operational limits

Outbound calls still go only to `https://api.bcra.gob.ar` and `https://www.bcra.gob.ar`, with the per-process timeout, size, concurrency, and rate limits documented in the README. This mode does not add a shared rate limiter across replicas. Terminate TLS at the edge, keep the container on a private network, and do not enable `MCP_AUTH_INSECURE_DEV` there.
