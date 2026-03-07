# GEMINI.md - MCP BCRA Project Context

This project is a Model Context Protocol (MCP) server that provides access to various APIs from the Banco Central de la República Argentina (BCRA). It is built with a focus on modularity, type safety, and robust error handling.

## Project Overview

*   **Purpose:** Expose BCRA financial data (Debtor central, rejected checks, monetary variables) to LLMs via the MCP protocol.
*   **Main Technologies:**
    *   **Runtime/Package Manager:** [Bun](https://bun.sh/) (recommended).
    *   **Language:** TypeScript.
    *   **Core Library:** `@modelcontextprotocol/sdk`.
    *   **Validation:** [Zod](https://github.com/colinhacks/zod).
    *   **Testing:** [Vitest](https://vitest.dev/).
*   **Architecture:** Modular domain-driven design.
    *   `src/domains/`: Contains domain-specific logic (e.g., `centralDeudores`, `cheques`, `estadisticas`). Each domain typically has:
        *   `api.ts`: API client definitions and implementation.
        *   `schemas.ts`: Zod input/output schemas.
        *   `tools.ts`: MCP tool registration logic.
    *   `src/shared/`: Reusable utilities.
        *   `http/`: `BcraHttpClient` with centralized error handling and timeout management.
        *   `mcp/`: Standardized MCP response helpers (`toolSuccess`, `toolError`).
        *   `validation/`: Shared Zod validators.
    *   `src/tools/`: Central orchestrator for registering all tools from different domains.

## Building and Running

*   **Install Dependencies:** `bun install`
*   **Build Project:** `bun run build` (uses `tsc`)
*   **Run Server (Production):** `bun run start` (uses `StdioServerTransport`)
*   **Run in Development Mode:** `bun run dev` (uses `bun --watch`)
*   **Run Tests:** `bun run test`

## Development Conventions

*   **Functional Style:** Prefer factory functions (e.g., `createBcraHttpClient`, `createCentralDeudoresApi`) over classes.
*   **Strong Typing:** Use TypeScript interfaces and Zod schemas for all data boundaries. Do not use `any` in domain or infrastructure code.
*   **Architectural Separation:**
    *   `api.ts` (Domain layer) should not be aware of MCP; it only interacts with the `BcraHttpClient`.
    *   `tools.ts` (Application layer) handles input validation (via Zod) and transforms API output/errors into the standardized MCP response format.
*   **Error Handling:**
    *   Use `DomainApiError` for all API-related failures.
    *   The `BcraHttpClient` handles timeouts, empty bodies, and invalid JSON.
    *   Tools should catch errors and return them using the `toolError` helper to maintain a consistent MCP response format.
*   **Security & Best Practices:**
    *   Never disable or bypass TLS.
    *   Do not duplicate HTTP logic between domains.
    *   All new tools must use the shared logic for errors, responses, and common validations.
*   **Adding a New Tool:**
    1.  Define the input schema in the domain's `schemas.ts`.
    2.  Add the corresponding API call in the domain's `api.ts`.
    3.  Register the tool in the domain's `tools.ts` using `server.tool`.
    4.  Update `src/tools/registerAllTools.ts` if adding a new domain.
    5.  Add unit tests in the `test/` directory.

## Testing Practices

*   Tests are located in the `test/` directory.
*   Mocking: Use Vitest's `vi.fn()` to mock the `BcraHttpClient` and verify URL construction and query parameters.
*   Domain tests verify that API calls map to the correct BCRA endpoints.
*   Tool tests verify that the MCP server correctly handles successful and failed API responses.

## Key Files

*   `package.json`: Project metadata, scripts, and dependencies.
*   `src/index.ts`: Application entry point.
*   `src/server.ts`: MCP server initialization.
*   `src/shared/http/bcraClient.ts`: Core HTTP client with resilience features.
*   `src/manifest.ts`: Server metadata (name, version, description).
