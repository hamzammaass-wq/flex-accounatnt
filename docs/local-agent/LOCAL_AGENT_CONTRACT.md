# Smart Accountant Local Agent Contract

Version: `1.0.0`  
Date: `2026-02-27`

This contract defines the HTTP integration between the frontend `Device Hub` and a local agent service.

## 1) Base URL Rules

1. Device Hub stores a `baseUrl` per device (or global).
2. Health check uses `GET {baseUrl}`.
3. Command execution uses `POST {baseUrl}/execute`.
4. If `baseUrl` already ends with `/execute`, Device Hub will call it directly.

## 2) Endpoints

## `GET /` (Health / Reachability)

Purpose: connection test from Device Hub.

Success response (recommended):

```json
{
  "ok": true,
  "service": "smart-accountant-local-agent",
  "version": "1.0.0",
  "timestamp": "2026-02-27T18:10:00.000Z"
}
```

Notes:

1. Any `2xx` status is treated as reachable by current client.
2. Response body is optional for client behavior, but recommended for diagnostics.

## `POST /execute`

Purpose: execute a mapped device command.

Request schema:

1. File: [schemas/execute.request.schema.json](./schemas/execute.request.schema.json)
2. Content-Type: `application/json`

Response schema:

1. File: [schemas/execute.response.schema.json](./schemas/execute.response.schema.json)
2. Content-Type: `application/json`

## 3) Command Mapping

| action | command |
| --- | --- |
| `PRINT_RECEIPT` | `escpos.print` |
| `PRINT_LABEL` | `escpos.print` |
| `OPEN_CASH_DRAWER` | `cashdrawer.open` |
| `READ_WEIGHT` | `scale.read` |

Other actions are currently unsupported by Device Hub local-agent bridge.

## 4) Standard Response Envelope

Success:

```json
{
  "ok": true,
  "requestId": "dagent_ab12cd34",
  "message": "Printed successfully",
  "data": {
    "jobId": "job_1001",
    "durationMs": 245
  }
}
```

Business failure (HTTP 200 with `ok=false`):

```json
{
  "ok": false,
  "requestId": "dagent_ab12cd34",
  "message": "Printer is offline",
  "error": {
    "code": "DEVICE_OFFLINE",
    "message": "Printer is offline",
    "details": {
      "deviceId": "dev_printer_main"
    }
  }
}
```

Transport or validation failure (HTTP 4xx/5xx):

```json
{
  "ok": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "command is required",
    "details": {
      "field": "command"
    }
  }
}
```

## 5) Error Codes

## Request/Validation

| code | meaning | suggested http |
| --- | --- | --- |
| `INVALID_JSON` | Request body is not valid JSON | `400` |
| `VALIDATION_ERROR` | Schema validation failed | `400` |
| `ACTION_NOT_SUPPORTED` | Action is not supported by backend | `422` |
| `COMMAND_NOT_SUPPORTED` | Command is not implemented | `422` |

## Device/Execution

| code | meaning | suggested http |
| --- | --- | --- |
| `DEVICE_NOT_FOUND` | Device id/type cannot be resolved | `404` |
| `DEVICE_OFFLINE` | Device reachable state is offline | `409` |
| `DEVICE_BUSY` | Device is busy and cannot accept job | `409` |
| `TIMEOUT` | Device did not respond in expected time | `504` |
| `EXECUTION_FAILED` | Command reached device but failed | `500` |

## Agent/Internal

| code | meaning | suggested http |
| --- | --- | --- |
| `AGENT_INTERNAL_ERROR` | Unexpected backend exception | `500` |
| `UPSTREAM_NETWORK_ERROR` | Backend failed to reach network device | `502` |
| `NOT_IMPLEMENTED` | Endpoint/command not implemented yet | `501` |

## 6) Compatibility Notes

1. Frontend sends a `legacy` object for backward compatibility:
   - `legacy.action`
   - `legacy.deviceId`
   - `legacy.deviceType`
   - `legacy.payload`
2. Backend should echo `requestId` when available.
3. Frontend treats any non-2xx as failed command and may enqueue retries.

