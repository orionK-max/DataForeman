Connectivity Contracts (Step 0)

# Connectivity Spec v1

This folder contains the JSON Schema definitions and example fixtures for the Connectivity service's contracts.

## ⚠️ Important: Schemas Are Used at Runtime

**These schemas are NOT just documentation.** They are actively loaded and used for message validation in production by the connectivity, core, and ingestor services.

**See [SCHEMA_MAINTENANCE.md](./SCHEMA_MAINTENANCE.md) for critical information about keeping schemas in sync with code changes.**

## Purpose

Define the v1 contracts for the Connectivity control and data planes, ensuring proper message formatting and validation across services.

Contents:
- schemas/: JSON Schemas for message payloads
- fixtures/: Example messages that validate against the schemas

Subjects (NATS):
- df.connectivity.config.v1               (Core → Connectivity)
- df.connectivity.command.v1.<connId>     (Core → Connectivity) — not schematized here (simple commands)
- df.connectivity.status.v1.<connId>      (Connectivity → Core/UI)
- df.telemetry.batch.v1                   (Connectivity → Ingestor)
- df.telemetry.write.v1.<connId>          (Core/UI → Connectivity)

Schema identity field:
- Each payload includes a string field "schema" with the value like "connectivity.config@v1" to aid routing and validation.

Validation tool:
- See ../../tools/schema-validate for a simple runner using Ajv that validates fixtures against these schemas.
