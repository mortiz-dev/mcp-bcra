# Security Policy

## Supported versions

Security fixes are provided for the latest major release only.

## Reporting a vulnerability

Do not open a public issue with exploit details, personal identifiers, credentials or BCRA response data. Use GitHub's private vulnerability reporting for this repository. Include the affected version, impact, reproduction steps with synthetic data and a proposed mitigation when available.

## Security model

The supported deployment is a local stdio process. It performs read-only GET requests to the fixed HTTPS origin `api.bcra.gob.ar`; it does not implement a remote authenticated service. Operators adding a network transport must supply authentication, authorization, TLS, host/origin validation and distributed rate limiting.

Never include real CUIT/CUIL/CDI values or financial responses in bug reports, tests or logs.
