# ADR-0001: Verified dependency-light vertical slice

## Status
Accepted for Phase 0 only.

## Decision
The first executable slice uses Node 22 built-ins and browser TypeScript without third-party runtime dependencies. This allows deterministic verification in the current build environment while preserving the service boundaries required by the product specification.

## Consequences
- The API key settings, authentication, audit, PWA and AI provider boundary are executable now.
- The production migration target remains React + Vite, PostgreSQL, object storage, queueing and generated OpenAPI clients.
- The JSON data store is development-only and must not hold real patient information.
