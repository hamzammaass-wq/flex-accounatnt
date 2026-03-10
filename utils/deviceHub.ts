import { toEnglishDigits } from './forceEnglishDigits';

export type DeviceHubType =
  | 'BARCODE_SCANNER'
  | 'RECEIPT_PRINTER'
  | 'LABEL_PRINTER'
  | 'CASH_DRAWER'
  | 'SCALE'
  | 'DOCUMENT_SCANNER'
  | 'FINGERPRINT_READER';

export type DeviceHubConnectionType =
  | 'LOCAL_AGENT'
  | 'NETWORK'
  | 'USB'
  | 'BLUETOOTH'
  | 'SERIAL'
  | 'MANUAL';

export type DeviceHubAction =
  | 'TEST'
  | 'PRINT_RECEIPT'
  | 'PRINT_LABEL'
  | 'OPEN_CASH_DRAWER'
  | 'READ_WEIGHT'
  | 'SCAN'
  | 'SYNC_FINGERPRINT';

export type DeviceHubLogStatus = 'SUCCESS' | 'ERROR' | 'QUEUED' | 'INFO';
export type DeviceHubQueueStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
export type DeviceHubAgentCommand = 'escpos.print' | 'cashdrawer.open' | 'scale.read';

export interface DeviceHubAgentRequest {
  requestId: string;
  command: DeviceHubAgentCommand;
  action: DeviceHubAction;
  jobId?: string;
  companyId?: string | null;
  timestamp: string;
  source?: string;
  device?: {
    id?: string;
    name?: string;
    type?: DeviceHubType;
    connectionType?: DeviceHubConnectionType;
    host?: string;
    port?: number;
    serialPort?: string;
    model?: string;
    branch?: string;
    location?: string;
  };
  payload?: Record<string, unknown>;
}

export interface DeviceHubAgentError {
  code?: string;
  message: string;
  details?: unknown;
}

export interface DeviceHubAgentResponse {
  ok: boolean;
  requestId?: string;
  message?: string;
  data?: unknown;
  error?: DeviceHubAgentError;
  raw?: unknown;
}

export interface ExecuteDeviceHubCommandParams {
  companyId?: string | null;
  action: DeviceHubAction;
  payload?: Record<string, unknown>;
  deviceId?: string;
  deviceType?: DeviceHubType;
  source?: string;
  enqueueOnFailure?: boolean;
  jobId?: string;
}

export interface ExecuteDeviceHubCommandResult {
  ok: boolean;
  queued?: boolean;
  state: DeviceHubState;
  message: string;
  device?: DeviceHubRecord;
  response?: DeviceHubAgentResponse;
}

export interface DeviceHubRecord {
  id: string;
  name: string;
  type: DeviceHubType;
  connectionType: DeviceHubConnectionType;
  branch?: string;
  location?: string;
  localAgentUrl?: string;
  host?: string;
  port?: number;
  serialPort?: string;
  model?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  lastTestAt?: string;
  lastTestStatus?: 'SUCCESS' | 'ERROR';
  lastError?: string;
  externalRefId?: string;
}

export interface DeviceHubLogEntry {
  id: string;
  timestamp: string;
  deviceId?: string;
  deviceName?: string;
  deviceType?: DeviceHubType;
  action: DeviceHubAction | 'QUEUE';
  status: DeviceHubLogStatus;
  message: string;
  errorCode?: string;
  requestId?: string;
  agentCommand?: DeviceHubAgentCommand;
  durationMs?: number;
  executeUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface DeviceHubQueueJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  deviceId?: string;
  deviceType?: DeviceHubType;
  action: DeviceHubAction;
  payload?: Record<string, unknown>;
  status: DeviceHubQueueStatus;
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
}

export interface DeviceHubState {
  localAgentBaseUrl: string;
  devices: DeviceHubRecord[];
  logs: DeviceHubLogEntry[];
  queue: DeviceHubQueueJob[];
}

const STORAGE_KEY = (companyId?: string | null) => `al_mohaseb_device_hub_${companyId || 'default'}`;
const MAX_LOGS = 300;

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const asNum = (value: unknown) => {
  const n = Number(toEnglishDigits(String(value ?? '')).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

const normalizeDevice = (input: Partial<DeviceHubRecord>): DeviceHubRecord => {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = nowIso();
  return {
    id: String(input.id || newId('dev')),
    name: String(input.name || '').trim() || 'Device',
    type: ([
      'BARCODE_SCANNER',
      'RECEIPT_PRINTER',
      'LABEL_PRINTER',
      'CASH_DRAWER',
      'SCALE',
      'DOCUMENT_SCANNER',
      'FINGERPRINT_READER'
    ] as const).includes(input.type as any)
      ? (input.type as DeviceHubType)
      : 'BARCODE_SCANNER',
    connectionType: ([
      'LOCAL_AGENT',
      'NETWORK',
      'USB',
      'BLUETOOTH',
      'SERIAL',
      'MANUAL'
    ] as const).includes(input.connectionType as any)
      ? (input.connectionType as DeviceHubConnectionType)
      : 'LOCAL_AGENT',
    branch: String(input.branch || '').trim(),
    location: String(input.location || '').trim(),
    localAgentUrl: String(input.localAgentUrl || '').trim(),
    host: String(input.host || '').trim(),
    port: typeof input.port === 'number' ? input.port : asNum(input.port),
    serialPort: String(input.serialPort || '').trim(),
    model: String(input.model || '').trim(),
    notes: String(input.notes || '').trim(),
    isActive: input.isActive !== false,
    createdAt,
    updatedAt,
    lastUsedAt: input.lastUsedAt,
    lastTestAt: input.lastTestAt,
    lastTestStatus: input.lastTestStatus === 'ERROR' ? 'ERROR' : input.lastTestStatus === 'SUCCESS' ? 'SUCCESS' : undefined,
    lastError: String(input.lastError || '').trim() || undefined,
    externalRefId: String(input.externalRefId || '').trim() || undefined
  };
};

const normalizeLog = (input: Partial<DeviceHubLogEntry>): DeviceHubLogEntry => ({
  id: String(input.id || newId('dlog')),
  timestamp: input.timestamp || nowIso(),
  deviceId: input.deviceId ? String(input.deviceId) : undefined,
  deviceName: input.deviceName ? String(input.deviceName) : undefined,
  deviceType: input.deviceType as DeviceHubType | undefined,
  action: (input.action as any) || 'QUEUE',
  status: (['SUCCESS', 'ERROR', 'QUEUED', 'INFO'] as const).includes(input.status as any)
    ? (input.status as DeviceHubLogStatus)
    : 'INFO',
  message: String(input.message || '').trim() || 'Device event',
  errorCode: input.errorCode ? String(input.errorCode).trim() || undefined : undefined,
  requestId: input.requestId ? String(input.requestId).trim() || undefined : undefined,
  agentCommand: (['escpos.print', 'cashdrawer.open', 'scale.read'] as const).includes(input.agentCommand as any)
    ? (input.agentCommand as DeviceHubAgentCommand)
    : undefined,
  durationMs: typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : undefined,
  executeUrl: input.executeUrl ? String(input.executeUrl).trim() || undefined : undefined,
  metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : undefined
});

const normalizeQueue = (input: Partial<DeviceHubQueueJob>): DeviceHubQueueJob => ({
  id: String(input.id || newId('dq')),
  createdAt: input.createdAt || nowIso(),
  updatedAt: nowIso(),
  deviceId: input.deviceId ? String(input.deviceId) : undefined,
  deviceType: input.deviceType as DeviceHubType | undefined,
  action: (input.action as DeviceHubAction) || 'TEST',
  payload: input.payload && typeof input.payload === 'object' ? input.payload : undefined,
  status: (['PENDING', 'RUNNING', 'DONE', 'FAILED'] as const).includes(input.status as any)
    ? (input.status as DeviceHubQueueStatus)
    : 'PENDING',
  attempts: Math.max(0, Math.floor(Number(input.attempts || 0))),
  lastAttemptAt: input.lastAttemptAt,
  error: input.error ? String(input.error) : undefined
});

const normalizeState = (input: Partial<DeviceHubState> | null | undefined): DeviceHubState => ({
  localAgentBaseUrl: String(input?.localAgentBaseUrl || '').trim(),
  devices: Array.isArray(input?.devices) ? input!.devices.map(normalizeDevice) : [],
  logs: Array.isArray(input?.logs) ? input!.logs.map(normalizeLog).slice(-MAX_LOGS) : [],
  queue: Array.isArray(input?.queue) ? input!.queue.map(normalizeQueue) : []
});

export const loadDeviceHubState = (companyId?: string | null): DeviceHubState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(companyId));
    if (!raw) return normalizeState(null);
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(null);
  }
};

export const saveDeviceHubState = (companyId: string | null | undefined, next: Partial<DeviceHubState>) => {
  const normalized = normalizeState(next);
  localStorage.setItem(STORAGE_KEY(companyId), JSON.stringify(normalized));
  return normalized;
};

export const patchDeviceHubState = (
  companyId: string | null | undefined,
  patch: Partial<DeviceHubState> | ((prev: DeviceHubState) => Partial<DeviceHubState>)
) => {
  const prev = loadDeviceHubState(companyId);
  const nextPatch = typeof patch === 'function' ? patch(prev) : patch;
  const next = normalizeState({ ...prev, ...nextPatch });
  localStorage.setItem(STORAGE_KEY(companyId), JSON.stringify(next));
  return next;
};

export const upsertDeviceHubDevice = (companyId: string | null | undefined, device: Partial<DeviceHubRecord>) => {
  return patchDeviceHubState(companyId, prev => {
    const normalized = normalizeDevice(device);
    const idx = prev.devices.findIndex(d => d.id === normalized.id || (!!normalized.externalRefId && d.externalRefId === normalized.externalRefId));
    const devices = [...prev.devices];
    if (idx >= 0) {
      const merged = normalizeDevice({ ...devices[idx], ...normalized, createdAt: devices[idx].createdAt });
      devices[idx] = merged;
      return { devices };
    }
    devices.push(normalized);
    return { devices };
  });
};

export const deleteDeviceHubDevice = (companyId: string | null | undefined, deviceId: string) => {
  return patchDeviceHubState(companyId, prev => ({
    devices: prev.devices.filter(d => d.id !== deviceId)
  }));
};

export const appendDeviceHubLog = (
  companyId: string | null | undefined,
  entry: Partial<DeviceHubLogEntry>
) => {
  return patchDeviceHubState(companyId, prev => {
    const log = normalizeLog(entry);
    const logs = [...prev.logs, log].slice(-MAX_LOGS);
    const devices = prev.devices.map(device => {
      if (!log.deviceId || device.id !== log.deviceId) return device;
      const patch: Partial<DeviceHubRecord> = {};
      if (log.action === 'TEST') {
        patch.lastTestAt = log.timestamp;
        patch.lastTestStatus = log.status === 'ERROR' ? 'ERROR' : 'SUCCESS';
        patch.lastError = log.status === 'ERROR' ? log.message : undefined;
      } else if (log.status === 'SUCCESS') {
        patch.lastUsedAt = log.timestamp;
      } else if (log.status === 'ERROR') {
        patch.lastError = log.message;
      }
      return { ...device, ...patch, updatedAt: nowIso() };
    });
    return { logs, devices };
  });
};

export const enqueueDeviceHubJob = (
  companyId: string | null | undefined,
  job: Partial<DeviceHubQueueJob>
) => {
  const next = patchDeviceHubState(companyId, prev => {
    const queueJob = normalizeQueue({ ...job, status: 'PENDING', attempts: 0 });
    const queue = [...prev.queue, queueJob];
    return { queue };
  });
  appendDeviceHubLog(companyId, {
    deviceId: job.deviceId,
    deviceType: job.deviceType,
    action: 'QUEUE',
    status: 'QUEUED',
    message: `Queued job: ${job.action || 'TEST'}`,
    metadata: { queueSize: next.queue.length }
  });
  return next;
};

export const updateDeviceHubQueueJob = (
  companyId: string | null | undefined,
  jobId: string,
  updates: Partial<DeviceHubQueueJob>
) => {
  return patchDeviceHubState(companyId, prev => ({
    queue: prev.queue.map(q => (q.id === jobId ? normalizeQueue({ ...q, ...updates, id: q.id, createdAt: q.createdAt }) : q))
  }));
};

export const clearDeviceHubQueueCompleted = (companyId: string | null | undefined) =>
  patchDeviceHubState(companyId, prev => ({
    queue: prev.queue.filter(q => q.status !== 'DONE')
  }));

const resolveDeviceTestUrl = (state: DeviceHubState, device: DeviceHubRecord) => {
  if (device.connectionType === 'LOCAL_AGENT') {
    return (device.localAgentUrl || state.localAgentBaseUrl || '').trim();
  }
  if (device.connectionType === 'NETWORK') {
    if (!device.host) return '';
    const port = device.port ? `:${device.port}` : '';
    return /^https?:\/\//i.test(device.host) ? `${device.host}${port}` : `http://${device.host}${port}`;
  }
  return '';
};

export const testDeviceHubDeviceConnection = async (
  companyId: string | null | undefined,
  deviceId: string
) => {
  const state = loadDeviceHubState(companyId);
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) {
    return { ok: false as const, message: 'Device not found.' };
  }
  if (device.connectionType === 'USB' || device.connectionType === 'BLUETOOTH' || device.connectionType === 'SERIAL' || device.connectionType === 'MANUAL') {
    const message = 'Direct browser-level connection test is not supported for this connection type.';
    appendDeviceHubLog(companyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: 'TEST',
      status: 'INFO',
      message
    });
    return { ok: true as const, message };
  }
  const url = resolveDeviceTestUrl(state, device);
  if (!url) {
    const message = 'Missing local agent URL / network host for device test.';
    appendDeviceHubLog(companyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: 'TEST',
      status: 'ERROR',
      message
    });
    return { ok: false as const, message };
  }
  try {
    const startedAt = Date.now();
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const durationMs = Date.now() - startedAt;
    const message = `Connection OK (${url})`;
    appendDeviceHubLog(companyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: 'TEST',
      status: 'SUCCESS',
      message,
      durationMs,
      executeUrl: url,
      metadata: { url }
    });
    return { ok: true as const, message };
  } catch (e) {
    const message = `Connection failed (${url})`;
    appendDeviceHubLog(companyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: 'TEST',
      status: 'ERROR',
      message,
      errorCode: e instanceof Error && /^HTTP_\d+$/i.test(e.message) ? e.message : 'TEST_CONNECTION_FAILED',
      executeUrl: url,
      metadata: { url, error: e instanceof Error ? e.message : String(e) }
    });
    return { ok: false as const, message };
  }
};

const resolveAgentExecuteUrl = (state: DeviceHubState, device?: DeviceHubRecord) => {
  const raw = (device?.localAgentUrl || state.localAgentBaseUrl || '').trim();
  if (!raw) return '';
  if (/\/execute\/?$/i.test(raw)) return raw;
  return raw.replace(/\/+$/, '') + '/execute';
};

const mapActionToAgentCommand = (action: DeviceHubAction): DeviceHubAgentCommand | null => {
  if (action === 'PRINT_RECEIPT' || action === 'PRINT_LABEL') return 'escpos.print';
  if (action === 'OPEN_CASH_DRAWER') return 'cashdrawer.open';
  if (action === 'READ_WEIGHT') return 'scale.read';
  return null;
};

const resolveCommandDevice = (
  state: DeviceHubState,
  params: Pick<ExecuteDeviceHubCommandParams, 'deviceId' | 'deviceType'>
) => {
  if (params.deviceId) {
    return state.devices.find(device => device.id === params.deviceId && device.isActive !== false);
  }
  if (params.deviceType) {
    return state.devices.find(device => device.type === params.deviceType && device.isActive !== false);
  }
  return undefined;
};

const toAgentError = (error: unknown): DeviceHubAgentError => {
  if (error && typeof error === 'object' && 'message' in (error as any)) {
    const maybeCode = typeof (error as any).code === 'string' ? (error as any).code : undefined;
    return {
      code: maybeCode,
      message: String((error as any).message || 'UNKNOWN_AGENT_ERROR'),
      details: error
    };
  }
  return {
    message: typeof error === 'string' ? error : 'UNKNOWN_AGENT_ERROR',
    details: error
  };
};

export const executeDeviceHubCommand = async (
  params: ExecuteDeviceHubCommandParams
): Promise<ExecuteDeviceHubCommandResult> => {
  const companyId = params.companyId;
  const state = loadDeviceHubState(companyId);
  const command = mapActionToAgentCommand(params.action);
  const device = resolveCommandDevice(state, params);

  if (!device) {
    const message = 'No active device configured for this command.';
    appendDeviceHubLog(companyId, {
      action: params.action,
      status: 'ERROR',
      message,
      errorCode: 'DEVICE_NOT_FOUND',
      metadata: {
        deviceId: params.deviceId || null,
        deviceType: params.deviceType || null,
        source: params.source || null
      }
    });
    return {
      ok: false,
      state: loadDeviceHubState(companyId),
      message
    };
  }

  if (!command) {
    const message = `Action ${params.action} is not mapped to local agent command.`;
    appendDeviceHubLog(companyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: params.action,
      status: 'ERROR',
      message,
      errorCode: 'ACTION_NOT_SUPPORTED'
    });
    return {
      ok: false,
      state: loadDeviceHubState(companyId),
      message,
      device
    };
  }

  const executeUrl = resolveAgentExecuteUrl(state, device);
  const requestId = newId('dagent');
  if (!executeUrl) {
    const message = 'Local agent URL is not configured.';
    appendDeviceHubLog(companyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: params.action,
      status: 'ERROR',
      message,
      errorCode: 'AGENT_URL_MISSING',
      requestId,
      agentCommand: command
    });
    if (params.enqueueOnFailure) {
      enqueueDeviceHubJob(companyId, {
        action: params.action,
        deviceId: device.id,
        deviceType: device.type,
        payload: {
          ...(params.payload || {}),
          _requestId: requestId,
          _source: params.source || null
        }
      });
      return {
        ok: false,
        queued: true,
        state: loadDeviceHubState(companyId),
        message,
        device
      };
    }
    return {
      ok: false,
      state: loadDeviceHubState(companyId),
      message,
      device
    };
  }

  const request: DeviceHubAgentRequest = {
    requestId,
    action: params.action,
    command,
    jobId: params.jobId,
    companyId: companyId || null,
    timestamp: nowIso(),
    source: params.source || 'ui',
    device: {
      id: device.id,
      name: device.name,
      type: device.type,
      connectionType: device.connectionType,
      host: device.host,
      port: device.port,
      serialPort: device.serialPort,
      model: device.model,
      branch: device.branch,
      location: device.location
    },
    payload: params.payload || {}
  };

  const startedAt = Date.now();
  try {
    const res = await fetch(executeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        // Backward-compatible fields for older local agents.
        legacy: {
          action: params.action,
          deviceId: device.id,
          deviceType: device.type,
          payload: params.payload || {}
        }
      })
    });

    const durationMs = Date.now() - startedAt;
    const rawText = await res.text();
    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const message = `HTTP_${res.status}`;
      const error: DeviceHubAgentError = {
        code: message,
        message: parsed?.error?.message || parsed?.message || message,
        details: parsed || rawText || null
      };
      appendDeviceHubLog(companyId, {
        deviceId: device.id,
        deviceName: device.name,
        deviceType: device.type,
        action: params.action,
        status: 'ERROR',
        message: error.message,
        errorCode: error.code,
        requestId,
        agentCommand: command,
        durationMs,
        executeUrl,
        metadata: { response: parsed || rawText || null, source: params.source || null, jobId: params.jobId || null }
      });
      if (params.enqueueOnFailure) {
        enqueueDeviceHubJob(companyId, {
          action: params.action,
          deviceId: device.id,
          deviceType: device.type,
          payload: {
            ...(params.payload || {}),
            _requestId: requestId,
            _source: params.source || null
          }
        });
      }
      return {
        ok: false,
        queued: params.enqueueOnFailure ? true : false,
        state: loadDeviceHubState(companyId),
        message: error.message,
        device,
        response: { ok: false, requestId, error, raw: parsed || rawText || null }
      };
    }

    const response: DeviceHubAgentResponse = {
      ok: parsed?.ok !== false,
      requestId: parsed?.requestId || requestId,
      message: parsed?.message || 'OK',
      data: parsed?.data,
      error: parsed?.ok === false
        ? {
          code: parsed?.error?.code,
          message: parsed?.error?.message || parsed?.message || 'Agent rejected command',
          details: parsed?.error?.details
        }
        : undefined,
      raw: parsed || rawText || null
    };

    if (!response.ok) {
      appendDeviceHubLog(companyId, {
        deviceId: device.id,
        deviceName: device.name,
        deviceType: device.type,
        action: params.action,
        status: 'ERROR',
        message: response.error?.message || 'Agent command failed',
        errorCode: response.error?.code,
        requestId: response.requestId || requestId,
        agentCommand: command,
        durationMs,
        executeUrl,
        metadata: { response: response.raw || null, source: params.source || null, jobId: params.jobId || null }
      });
      if (params.enqueueOnFailure) {
        enqueueDeviceHubJob(companyId, {
          action: params.action,
          deviceId: device.id,
          deviceType: device.type,
          payload: {
            ...(params.payload || {}),
            _requestId: requestId,
            _source: params.source || null
          }
        });
      }
      return {
        ok: false,
        queued: params.enqueueOnFailure ? true : false,
        state: loadDeviceHubState(companyId),
        message: response.error?.message || 'Agent command failed',
        device,
        response
      };
    }

    appendDeviceHubLog(companyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: params.action,
      status: 'SUCCESS',
      message: response.message || 'Command completed',
      requestId: response.requestId || requestId,
      agentCommand: command,
      durationMs,
      executeUrl,
      metadata: { response: response.raw || null, source: params.source || null, jobId: params.jobId || null }
    });

    return {
      ok: true,
      state: loadDeviceHubState(companyId),
      message: response.message || 'Command completed',
      device,
      response
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const normalized = toAgentError(error);
    appendDeviceHubLog(companyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: params.action,
      status: 'ERROR',
      message: normalized.message,
      errorCode: normalized.code,
      requestId,
      agentCommand: command,
      durationMs,
      executeUrl,
      metadata: { details: normalized.details || null, source: params.source || null, jobId: params.jobId || null }
    });
    if (params.enqueueOnFailure) {
      enqueueDeviceHubJob(companyId, {
        action: params.action,
        deviceId: device.id,
        deviceType: device.type,
        payload: {
          ...(params.payload || {}),
          _requestId: requestId,
          _source: params.source || null
        }
      });
    }
    return {
      ok: false,
      queued: params.enqueueOnFailure ? true : false,
      state: loadDeviceHubState(companyId),
      message: normalized.message,
      device,
      response: { ok: false, requestId, error: normalized }
    };
  }
};

const csvEsc = (value: unknown) => {
  const s = String(value ?? '');
  return `"${s.replace(/"/g, '""')}"`;
};

export const exportDeviceHubLogsCsv = (
  companyId: string | null | undefined,
  options?: { status?: DeviceHubLogStatus | 'ALL'; onlyErrors?: boolean; maxRows?: number; deviceId?: string }
) => {
  const state = loadDeviceHubState(companyId);
  const status = options?.status || 'ALL';
  const onlyErrors = options?.onlyErrors === true;
  let logs = [...state.logs];
  if (options?.deviceId) logs = logs.filter(log => log.deviceId === options.deviceId);
  if (status !== 'ALL') logs = logs.filter(log => log.status === status);
  if (onlyErrors) logs = logs.filter(log => log.status === 'ERROR');
  if (typeof options?.maxRows === 'number' && options.maxRows > 0) {
    logs = logs.slice(-Math.round(options.maxRows));
  }
  const header = [
    'timestamp',
    'status',
    'action',
    'deviceId',
    'deviceName',
    'deviceType',
    'requestId',
    'agentCommand',
    'durationMs',
    'errorCode',
    'executeUrl',
    'message',
    'metadata'
  ];
  const rows = logs.map(log => [
    log.timestamp,
    log.status,
    log.action,
    log.deviceId || '',
    log.deviceName || '',
    log.deviceType || '',
    log.requestId || '',
    log.agentCommand || '',
    log.durationMs ?? '',
    log.errorCode || '',
    log.executeUrl || '',
    log.message,
    log.metadata ? JSON.stringify(log.metadata) : ''
  ]);
  const csv = '\uFEFF' + [header, ...rows].map(cols => cols.map(csvEsc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  link.href = url;
  link.setAttribute('download', `device-hub-logs-${stamp}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return logs.length;
};

export const exportDeviceHubDevicesCsv = (
  companyId: string | null | undefined,
  options?: { onlyActive?: boolean; onlyWithErrors?: boolean }
) => {
  const state = loadDeviceHubState(companyId);
  let devices = [...state.devices];
  if (options?.onlyActive) devices = devices.filter(device => device.isActive !== false);
  if (options?.onlyWithErrors) devices = devices.filter(device => Boolean(device.lastError));

  const header = [
    'id',
    'name',
    'type',
    'connectionType',
    'isActive',
    'branch',
    'location',
    'localAgentUrl',
    'host',
    'port',
    'serialPort',
    'model',
    'lastUsedAt',
    'lastTestAt',
    'lastTestStatus',
    'lastError',
    'notes'
  ];

  const rows = devices.map(device => [
    device.id,
    device.name,
    device.type,
    device.connectionType,
    device.isActive ? '1' : '0',
    device.branch || '',
    device.location || '',
    device.localAgentUrl || '',
    device.host || '',
    device.port ?? '',
    device.serialPort || '',
    device.model || '',
    device.lastUsedAt || '',
    device.lastTestAt || '',
    device.lastTestStatus || '',
    device.lastError || '',
    device.notes || ''
  ]);

  const csv = '\uFEFF' + [header, ...rows].map(cols => cols.map(csvEsc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  link.href = url;
  link.setAttribute('download', `device-hub-devices-${stamp}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return devices.length;
};

export const printEscPosReceipt = (params: {
  companyId?: string | null;
  payload: Record<string, unknown>;
  deviceId?: string;
  source?: string;
  enqueueOnFailure?: boolean;
}) =>
  executeDeviceHubCommand({
    companyId: params.companyId,
    action: 'PRINT_RECEIPT',
    payload: params.payload,
    deviceId: params.deviceId,
    deviceType: 'RECEIPT_PRINTER',
    source: params.source || 'escpos-print',
    enqueueOnFailure: params.enqueueOnFailure ?? true
  });

export const openCashDrawer = (params: {
  companyId?: string | null;
  payload?: Record<string, unknown>;
  deviceId?: string;
  source?: string;
  enqueueOnFailure?: boolean;
}) =>
  executeDeviceHubCommand({
    companyId: params.companyId,
    action: 'OPEN_CASH_DRAWER',
    payload: params.payload || {},
    deviceId: params.deviceId,
    deviceType: 'CASH_DRAWER',
    source: params.source || 'cash-drawer-open',
    enqueueOnFailure: params.enqueueOnFailure ?? true
  });

export const readScaleWeight = (params: {
  companyId?: string | null;
  payload?: Record<string, unknown>;
  deviceId?: string;
  source?: string;
  enqueueOnFailure?: boolean;
}) =>
  executeDeviceHubCommand({
    companyId: params.companyId,
    action: 'READ_WEIGHT',
    payload: params.payload || {},
    deviceId: params.deviceId,
    deviceType: 'SCALE',
    source: params.source || 'scale-read',
    enqueueOnFailure: params.enqueueOnFailure ?? true
  });

export const runDeviceHubOfflineQueue = async (companyId: string | null | undefined) => {
  const pending = loadDeviceHubState(companyId).queue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of pending) {
    processed += 1;
    const state = loadDeviceHubState(companyId);
    const device = job.deviceId ? state.devices.find(d => d.id === job.deviceId) : undefined;
    if (device && device.isActive === false) {
      updateDeviceHubQueueJob(companyId, job.id, {
        status: 'FAILED',
        attempts: job.attempts + 1,
        lastAttemptAt: nowIso(),
        error: 'Device is inactive.'
      });
      failed += 1;
      continue;
    }
    updateDeviceHubQueueJob(companyId, job.id, { status: 'RUNNING', lastAttemptAt: nowIso(), attempts: job.attempts + 1 });
    const result = await executeDeviceHubCommand({
      companyId,
      action: job.action,
      payload: job.payload || {},
      deviceId: job.deviceId,
      deviceType: job.deviceType,
      source: 'offline-queue',
      enqueueOnFailure: false,
      jobId: job.id
    });
    if (result.ok) {
      updateDeviceHubQueueJob(companyId, job.id, { status: 'DONE', error: undefined });
      succeeded += 1;
    } else {
      updateDeviceHubQueueJob(companyId, job.id, {
        status: 'FAILED',
        error: result.message || 'Queue execution failed'
      });
      failed += 1;
    }
  }

  return { processed, succeeded, failed, state: loadDeviceHubState(companyId) };
};
