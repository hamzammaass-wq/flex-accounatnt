import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Cpu, Plus, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import {
  FingerprintAttendanceBatch,
  FingerprintAttendanceEntry,
  FingerprintBatchSource,
  FingerprintDeviceMode,
  FingerprintDeviceProtocol,
  FingerprintDeviceVendor,
  FingerprintPunchType,
  FingerprintReaderDevice
} from '../types';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { appendDeviceHubLog, enqueueDeviceHubJob } from '../utils/deviceHub';

type FormState = {
  name: string;
  vendor: FingerprintDeviceVendor;
  mode: FingerprintDeviceMode;
  protocol: FingerprintDeviceProtocol;
  model: string;
  serialNumber: string;
  host: string;
  port: string;
  localAgentUrl: string;
  location: string;
  notes: string;
  isActive: boolean;
};

type ParsedRow = Record<string, unknown>;

const EMPTY_FORM: FormState = {
  name: '',
  vendor: 'ZKTECO',
  mode: 'MANUAL',
  protocol: 'FILE',
  model: '',
  serialNumber: '',
  host: '',
  port: '',
  localAgentUrl: '',
  location: '',
  notes: '',
  isActive: true
};

const norm = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./:]+/g, '');

const toDigits = (value: unknown) =>
  toEnglishDigits(String(value ?? ''))
    .replace(/\u066B/g, '.')
    .replace(/[\u066C\u060C]/g, ',');

const parseMaybeNumber = (value: string) => {
  const cleaned = toDigits(value).replace(/[^\d.]/g, '');
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

const toIsoDateTime = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 1000) {
    const parseDateCode = (XLSX as any)?.SSF?.parse_date_code;
    if (typeof parseDateCode === 'function') {
      const parsed = parseDateCode(value);
      if (parsed?.y && parsed?.m && parsed?.d) {
        const hh = String(parsed.H || 0).padStart(2, '0');
        const mm = String(parsed.M || 0).padStart(2, '0');
        const ss = String(parsed.S || 0).padStart(2, '0');
        const y = String(parsed.y).padStart(4, '0');
        const m = String(parsed.m).padStart(2, '0');
        const d = String(parsed.d).padStart(2, '0');
        return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`).toISOString();
      }
    }
  }

  const raw = toDigits(value).trim();
  if (!raw) return '';

  const isoFirstMatch = raw.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (isoFirstMatch) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = isoFirstMatch;
    const dt = new Date(
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    );
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  const dmyMatch = raw.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (dmyMatch) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = dmyMatch;
    const dt = new Date(
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    );
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  const native = new Date(raw);
  return Number.isNaN(native.getTime()) ? '' : native.toISOString();
};

const mapPunchType = (value: unknown): FingerprintPunchType => {
  const n = norm(value);
  if (
    [
      'in',
      'checkin',
      'entry',
      'punchin',
      'attin',
      'دخول',
      'حضور',
      'بصمةدخول'
    ]
      .map(norm)
      .includes(n)
  ) {
    return 'IN';
  }
  if (
    [
      'out',
      'checkout',
      'exit',
      'punchout',
      'attout',
      'خروج',
      'انصراف',
      'بصمةخروج'
    ]
      .map(norm)
      .includes(n)
  ) {
    return 'OUT';
  }
  return 'UNKNOWN';
};

const makeRowId = (prefix: string, index: number) =>
  `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;

const FingerprintReadersManager: React.FC = () => {
  const {
    currentCompanyId,
    companySettings,
    fingerprintDevices,
    addFingerprintDevice,
    updateFingerprintDevice,
    deleteFingerprintDevice,
    fingerprintAttendanceBatches,
    addFingerprintAttendanceBatch,
    updateFingerprintAttendanceBatch,
    deleteFingerprintAttendanceBatch
  } = useAccounting();

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [manualDeviceId, setManualDeviceId] = useState('');
  const [manualRows, setManualRows] = useState<FingerprintAttendanceEntry[]>([]);
  const [manualFileName, setManualFileName] = useState('');
  const [manualMsg, setManualMsg] = useState('');

  const [directDeviceId, setDirectDeviceId] = useState('');
  const [directBusy, setDirectBusy] = useState(false);
  const [directMsg, setDirectMsg] = useState('');

  const directDevices = useMemo(
    () => fingerprintDevices.filter(device => device.mode === 'DIRECT' && device.isActive !== false),
    [fingerprintDevices]
  );

  const findDevice = (id?: string) => fingerprintDevices.find(device => device.id === id);

  const parseRows = (
    rows: ParsedRow[],
    source: FingerprintBatchSource,
    deviceId?: string
  ): FingerprintAttendanceEntry[] => {
    if (!rows.length) return [];

    const keys = Array.from(
      new Set(rows.flatMap(row => Object.keys(row || {})))
    );
    const keyLookup = Object.fromEntries(keys.map(key => [norm(key), key]));
    const pick = (...aliases: string[]) =>
      aliases.map(alias => keyLookup[norm(alias)]).find(Boolean) || '';

    const codeKey = pick('employeeCode', 'empCode', 'userId', 'user_id', 'code', 'رقم الموظف', 'كود الموظف');
    const nameKey = pick('employeeName', 'employee', 'name', 'اسم الموظف', 'اسم');
    const dateTimeKey = pick('datetime', 'timestamp', 'punchTime', 'punch_time', 'وقت البصمة');
    const dateKey = dateTimeKey ? '' : pick('date', 'attDate', 'attendanceDate', 'تاريخ');
    const timeKey = dateTimeKey ? '' : pick('time', 'attTime', 'attendanceTime', 'وقت');
    const typeKey = pick('type', 'status', 'punchType', 'نوع', 'الحالة');

    return rows.flatMap((row, index) => {
      const employeeCode = codeKey ? String(row[codeKey] ?? '').trim() : '';
      const employeeName = nameKey ? String(row[nameKey] ?? '').trim() : '';

      let punchAt = dateTimeKey ? toIsoDateTime(row[dateTimeKey]) : '';
      if (!punchAt && dateKey) {
        const d = toDigits(row[dateKey]).trim();
        const t = timeKey ? toDigits(row[timeKey]).trim() : '00:00';
        punchAt = toIsoDateTime(`${d} ${t}`);
      }

      if (!punchAt || (!employeeCode && !employeeName)) return [];

      return [
        {
          id: makeRowId('fprow', index),
          deviceId,
          employeeCode: employeeCode || undefined,
          employeeName: employeeName || undefined,
          punchAt,
          punchType: mapPunchType(typeKey ? row[typeKey] : ''),
          source,
          raw: row
        }
      ];
    });
  };

  const resetDeviceForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSaveDevice = () => {
    if (!form.name.trim()) {
      alert(tr('اسم الجهاز مطلوب', 'Device name is required'));
      return;
    }

    const port = form.port ? parseMaybeNumber(form.port) : undefined;
    const payload = {
      ...form,
      port: typeof port === 'number' ? Math.max(1, Math.trunc(port)) : undefined
    };

    const result = editingId
      ? updateFingerprintDevice(editingId, payload)
      : addFingerprintDevice(payload);

    if (!result.ok) {
      alert(result.message);
      appendDeviceHubLog(currentCompanyId, {
        deviceId: manualDeviceId || undefined,
        deviceType: 'FINGERPRINT_READER',
        action: 'SYNC_FINGERPRINT',
        status: 'ERROR',
        message: `Manual attendance upload failed: ${result.message}`
      });
      return;
    }

    resetDeviceForm();
    alert(tr('تم حفظ جهاز البصمة بنجاح', 'Fingerprint device saved successfully'));
  };

  const handleEditDevice = (device: FingerprintReaderDevice) => {
    setEditingId(device.id);
    setForm({
      name: device.name,
      vendor: device.vendor,
      mode: device.mode,
      protocol: device.protocol,
      model: device.model || '',
      serialNumber: device.serialNumber || '',
      host: device.host || '',
      port: device.port ? String(device.port) : '',
      localAgentUrl: device.localAgentUrl || '',
      location: device.location || '',
      notes: device.notes || '',
      isActive: device.isActive !== false
    });
  };

  const handleDeleteDevice = (device: FingerprintReaderDevice) => {
    if (!window.confirm(tr('هل تريد حذف هذا الجهاز؟', 'Delete this device?'))) return;
    const result = deleteFingerprintDevice(device.id);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    if (editingId === device.id) resetDeviceForm();
  };

  const handleManualFile = async (file: File | null) => {
    setManualMsg('');
    setManualRows([]);
    setManualFileName('');

    if (!file) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        cellDates: true
      });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('NO_SHEET');
      const rows = XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, { defval: '' });
      const parsed = parseRows(rows, 'MANUAL_UPLOAD', manualDeviceId || undefined);
      setManualRows(parsed);
      setManualFileName(file.name);
      setManualMsg(
        parsed.length
          ? tr(`تم تحليل ${parsed.length} سجل`, `Parsed ${parsed.length} rows`)
          : tr('لم يتم العثور على سجلات صالحة', 'No valid attendance rows found')
      );
    } catch {
      setManualMsg(tr('فشل تحليل ملف الحضور', 'Failed to parse attendance file'));
    }
  };

  const handleSaveManualBatch = () => {
    if (!manualRows.length) {
      alert(tr('لا توجد سجلات جاهزة للرفع', 'No rows ready to upload'));
      return;
    }

    const result = addFingerprintAttendanceBatch({
      deviceId: manualDeviceId || undefined,
      fileName: manualFileName || undefined,
      source: 'MANUAL_UPLOAD',
      status: 'STAGED',
      rows: manualRows
    });
    if (!result.ok) {
      alert(result.message);
      appendDeviceHubLog(currentCompanyId, {
        deviceId: manualDeviceId || undefined,
        deviceName: findDevice(manualDeviceId)?.name,
        deviceType: 'FINGERPRINT_READER',
        action: 'SYNC_FINGERPRINT',
        status: 'ERROR',
        message: `Manual upload failed: ${result.message}`,
        metadata: {
          source: 'MANUAL_UPLOAD',
          rows: manualRows.length,
          fileName: manualFileName || undefined
        }
      });
      return;
    }

    appendDeviceHubLog(currentCompanyId, {
      deviceId: manualDeviceId || undefined,
      deviceName: findDevice(manualDeviceId)?.name,
      deviceType: 'FINGERPRINT_READER',
      action: 'SYNC_FINGERPRINT',
      status: 'SUCCESS',
      message: `Manual attendance upload saved ${manualRows.length} rows`,
      metadata: {
        source: 'MANUAL_UPLOAD',
        rows: manualRows.length,
        fileName: manualFileName || undefined
      }
    });

    setManualRows([]);
    setManualFileName('');
    setManualMsg('');
    alert(tr('تم رفع سجلات البصمة يدويًا', 'Manual fingerprint attendance uploaded'));
  };

  const handleDirectSync = async (testOnly = false) => {
    setDirectMsg('');

    const device = directDevices.find(d => d.id === directDeviceId);
    if (!device) {
      setDirectMsg(tr('اختر جهازًا مباشرًا أولًا', 'Select a direct device first'));
      return;
    }
    if (!device.localAgentUrl?.trim()) {
      setDirectMsg(tr('أدخل رابط الوكيل المحلي للجهاز', 'Set local agent URL for the device'));
      return;
    }

    setDirectBusy(true);
    try {
      const response = await fetch(device.localAgentUrl.trim());
      if (!response.ok) throw new Error(`HTTP_${response.status}`);

      if (testOnly) {
        appendDeviceHubLog(currentCompanyId, {
          deviceId: device.id,
          deviceName: device.name,
          deviceType: 'FINGERPRINT_READER',
          action: 'TEST',
          status: 'SUCCESS',
          message: 'Fingerprint local agent reachable',
          metadata: { url: device.localAgentUrl.trim() }
        });
        setDirectMsg(tr('تم الاتصال بالجهاز/الوكيل بنجاح', 'Local agent is reachable'));
        return;
      }

      const data = await response.json();
      const rows: ParsedRow[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data?.data)
            ? data.data
            : [];
      const parsed = parseRows(rows, 'DIRECT_SYNC', device.id);
      if (!parsed.length) {
        appendDeviceHubLog(currentCompanyId, {
          deviceId: device.id,
          deviceName: device.name,
          deviceType: 'FINGERPRINT_READER',
          action: 'SYNC_FINGERPRINT',
          status: 'INFO',
          message: 'Direct sync returned no parsable rows',
          metadata: { url: device.localAgentUrl.trim() }
        });
        setDirectMsg(
          tr(
            'تم الاتصال لكن لا توجد سجلات حضور قابلة للقراءة',
            'Connected, but no parsable attendance rows were returned'
          )
        );
        return;
      }

      const saveResult = addFingerprintAttendanceBatch({
        deviceId: device.id,
        source: 'DIRECT_SYNC',
        status: 'STAGED',
        rows: parsed
      });
      if (!saveResult.ok) {
        appendDeviceHubLog(currentCompanyId, {
          deviceId: device.id,
          deviceName: device.name,
          deviceType: 'FINGERPRINT_READER',
          action: 'SYNC_FINGERPRINT',
          status: 'ERROR',
          message: `Direct sync save failed: ${saveResult.message}`,
          metadata: { rows: parsed.length }
        });
        setDirectMsg(saveResult.message);
        return;
      }

      updateFingerprintDevice(device.id, { lastSyncAt: new Date().toISOString() });
      appendDeviceHubLog(currentCompanyId, {
        deviceId: device.id,
        deviceName: device.name,
        deviceType: 'FINGERPRINT_READER',
        action: 'SYNC_FINGERPRINT',
        status: 'SUCCESS',
        message: `Direct sync saved ${parsed.length} rows`,
        metadata: { rows: parsed.length }
      });
      setDirectMsg(
        tr(
          `تمت القراءة المباشرة وحفظ ${parsed.length} سجل`,
          `Direct sync saved ${parsed.length} rows`
        )
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendDeviceHubLog(currentCompanyId, {
        deviceId: device.id,
        deviceName: device.name,
        deviceType: 'FINGERPRINT_READER',
        action: testOnly ? 'TEST' : 'SYNC_FINGERPRINT',
        status: 'ERROR',
        message: testOnly ? 'Fingerprint device test failed' : 'Direct fingerprint sync failed',
        metadata: { error: errorMessage, url: device.localAgentUrl.trim() }
      });
      if (!testOnly) {
        enqueueDeviceHubJob(currentCompanyId, {
          deviceId: device.id,
          deviceType: 'FINGERPRINT_READER',
          action: 'SYNC_FINGERPRINT',
          payload: {
            url: device.localAgentUrl.trim(),
            source: 'DIRECT_SYNC'
          }
        });
      }
      setDirectMsg(
        tr(
          'فشل الاتصال/القراءة المباشرة. يمكنك استخدام الرفع اليدوي.',
          'Direct sync failed. You can use manual upload instead.'
        )
      );
    } finally {
      setDirectBusy(false);
    }
  };

  const setBatchStatus = (batch: FingerprintAttendanceBatch) => {
    const nextStatus = batch.status === 'APPLIED' ? 'STAGED' : 'APPLIED';
    const result = updateFingerprintAttendanceBatch(batch.id, { status: nextStatus });
    if (!result.ok) alert(result.message);
  };

  const removeBatch = (batch: FingerprintAttendanceBatch) => {
    if (!window.confirm(tr('هل تريد حذف دفعة الحضور؟', 'Delete attendance batch?'))) return;
    const result = deleteFingerprintAttendanceBatch(batch.id);
    if (!result.ok) alert(result.message);
  };

  const batchStatusLabel = (status: FingerprintAttendanceBatch['status']) =>
    status === 'APPLIED' ? tr('معتمد', 'Applied') : tr('معلّق', 'Staged');

  const sourceLabel = (source: FingerprintBatchSource) =>
    source === 'DIRECT_SYNC' ? tr('قراءة مباشرة', 'Direct sync') : tr('رفع يدوي', 'Manual upload');

  const sortedBatches = useMemo(
    () =>
      [...fingerprintAttendanceBatches].sort(
        (a, b) => +new Date(b.importedAt) - +new Date(a.importedAt)
      ),
    [fingerprintAttendanceBatches]
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-black text-gray-800">
              {tr('قارئ البصمة (الأجهزة والحضور)', 'Fingerprint Reader (Devices & Attendance)')}
            </div>
            <div className="text-xs font-bold text-gray-500 mt-1">
              {tr(
                'تعريف أجهزة البصمة، القراءة المباشرة عبر وكيل محلي (إن وجد)، والرفع اليدوي لملفات الحضور.',
                'Register devices, direct sync using a local agent (if available), and manual attendance file upload.'
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="text-sm font-black text-gray-800">
          {tr('تعريف جهاز بصمة', 'Fingerprint Device Setup')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder={tr('اسم الجهاز', 'Device name')}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
          />

          <select
            value={form.vendor}
            onChange={e => setForm(prev => ({ ...prev, vendor: e.target.value as FingerprintDeviceVendor }))}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
          >
            <option value="ZKTECO">ZKTeco</option>
            <option value="ANVIZ">Anviz</option>
            <option value="SUPREMA">Suprema</option>
            <option value="OTHER">{tr('أخرى', 'Other')}</option>
          </select>

          <select
            value={form.mode}
            onChange={e =>
              setForm(prev => ({
                ...prev,
                mode: e.target.value as FingerprintDeviceMode,
                protocol: e.target.value === 'DIRECT' ? 'TCP' : 'FILE'
              }))
            }
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
          >
            <option value="DIRECT">{tr('مباشر', 'Direct')}</option>
            <option value="MANUAL">{tr('يدوي', 'Manual')}</option>
          </select>

          <select
            value={form.protocol}
            onChange={e => setForm(prev => ({ ...prev, protocol: e.target.value as FingerprintDeviceProtocol }))}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
          >
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
            <option value="HTTP">HTTP</option>
            <option value="FILE">FILE</option>
          </select>

          <input
            value={form.model}
            onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
            placeholder={tr('موديل الجهاز', 'Device model')}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
          />

          <input
            value={form.serialNumber}
            onChange={e => setForm(prev => ({ ...prev, serialNumber: e.target.value }))}
            placeholder={tr('الرقم التسلسلي', 'Serial number')}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none dir-ltr"
            lang="en"
          />

          <input
            value={form.host}
            onChange={e => setForm(prev => ({ ...prev, host: toDigits(e.target.value) }))}
            placeholder={tr('عنوان الجهاز / IP', 'Device host / IP')}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none dir-ltr"
            lang="en"
          />

          <input
            value={form.port}
            onChange={e =>
              setForm(prev => ({
                ...prev,
                port: toDigits(e.target.value).replace(/[^\d]/g, '')
              }))
            }
            placeholder={tr('المنفذ', 'Port')}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none dir-ltr"
            lang="en"
          />

          <input
            value={form.location}
            onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
            placeholder={tr('الموقع / الفرع', 'Location / Branch')}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
          />

          <div className="md:col-span-2">
            <input
              value={form.localAgentUrl}
              onChange={e => setForm(prev => ({ ...prev, localAgentUrl: e.target.value }))}
              placeholder={tr('رابط الوكيل المحلي للقراءة المباشرة', 'Local agent URL for direct sync')}
              className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none dir-ltr"
              lang="en"
            />
          </div>

          <textarea
            value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
            placeholder={tr('ملاحظات', 'Notes')}
            className="md:col-span-2 p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none resize-none"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-black text-gray-700">
            {tr('الجهاز نشط', 'Device active')}
          </div>
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
            className={`w-14 h-8 rounded-full relative ${form.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
                form.isActive ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveDevice}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {editingId ? tr('حفظ التعديل', 'Save changes') : tr('إضافة جهاز', 'Add device')}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetDeviceForm}
              className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 text-xs font-black"
            >
              {tr('إلغاء', 'Cancel')}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2">
        <div className="text-sm font-black text-gray-800">{tr('الأجهزة المضافة', 'Registered devices')}</div>

        {fingerprintDevices.map(device => (
          <div
            key={device.id}
            className="rounded-xl border border-gray-100 p-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-black text-gray-800 truncate">{device.name}</div>
              <div className="text-xs font-bold text-gray-500">
                {device.vendor} - {device.mode === 'DIRECT' ? tr('مباشر', 'Direct') : tr('يدوي', 'Manual')} -{' '}
                {device.isActive ? tr('نشط', 'Active') : tr('موقوف', 'Inactive')}
              </div>
              <div className="text-[11px] text-gray-400 dir-ltr" lang="en">
                {device.localAgentUrl || [device.host, device.port].filter(Boolean).join(':') || '-'}
              </div>
              {device.lastSyncAt && (
                <div className="text-[11px] text-emerald-600 font-bold" lang="en">
                  {tr('آخر مزامنة: ', 'Last sync: ')}
                  {new Date(device.lastSyncAt).toLocaleString('en-GB')}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleEditDevice(device)}
                className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-black"
              >
                {tr('تعديل', 'Edit')}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDevice(device)}
                className="p-2 rounded-xl bg-rose-50 text-rose-700"
                title={tr('حذف', 'Delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {fingerprintDevices.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm font-bold text-gray-400">
            {tr('لا توجد أجهزة بصمة مضافة', 'No fingerprint devices added')}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="text-sm font-black text-gray-800">{tr('القراءة المباشرة', 'Direct Sync')}</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={directDeviceId}
            onChange={e => setDirectDeviceId(e.target.value)}
            className="md:col-span-2 p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
          >
            <option value="">{tr('اختر جهازًا مباشرًا', 'Select direct device')}</option>
            {directDevices.map(device => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={directBusy}
              onClick={() => handleDirectSync(true)}
              className="flex-1 px-3 py-3 rounded-xl border border-blue-200 text-blue-700 bg-white text-xs font-black"
            >
              {tr('فحص', 'Test')}
            </button>
            <button
              type="button"
              disabled={directBusy}
              onClick={() => handleDirectSync(false)}
              className="flex-1 px-3 py-3 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${directBusy ? 'animate-spin' : ''}`} />
              {tr('مزامنة', 'Sync')}
            </button>
          </div>
        </div>

        {directMsg && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
            {directMsg}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="text-sm font-black text-gray-800">
          {tr('رفع يدوي لسجلات الحضور (Excel/CSV)', 'Manual Attendance Upload (Excel/CSV)')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={manualDeviceId}
            onChange={e => setManualDeviceId(e.target.value)}
            className="p-3 rounded-xl border border-gray-200 bg-gray-50 outline-none"
          >
            <option value="">{tr('بدون تحديد جهاز', 'No device selected')}</option>
            {fingerprintDevices.map(device => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>

          <label className="md:col-span-2 cursor-pointer flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 text-indigo-700 text-xs font-black">
            <Upload className="w-4 h-4" />
            {manualFileName || tr('اختر ملف Excel/CSV', 'Choose Excel/CSV file')}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => handleManualFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {manualMsg && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
            {manualMsg}
          </div>
        )}

        {manualRows.length > 0 && (
          <>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 flex items-center justify-between gap-3">
              <div className="text-xs font-black text-emerald-700" lang="en">
                {tr('سجلات جاهزة للرفع', 'Rows ready to upload')}: {manualRows.length}
              </div>
              <button
                type="button"
                onClick={handleSaveManualBatch}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {tr('رفع إلى البرنامج', 'Upload to program')}
              </button>
            </div>

            <div className="rounded-xl border border-gray-100 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-right">{tr('كود الموظف', 'Employee Code')}</th>
                    <th className="px-3 py-2 text-right">{tr('اسم الموظف', 'Employee Name')}</th>
                    <th className="px-3 py-2 text-right">{tr('وقت البصمة', 'Punch Time')}</th>
                    <th className="px-3 py-2 text-right">{tr('النوع', 'Type')}</th>
                  </tr>
                </thead>
                <tbody>
                  {manualRows.slice(0, 8).map(row => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-3 py-2" lang="en">{row.employeeCode || '-'}</td>
                      <td className="px-3 py-2">{row.employeeName || '-'}</td>
                      <td className="px-3 py-2" lang="en">
                        {new Date(row.punchAt).toLocaleString('en-GB')}
                      </td>
                      <td className="px-3 py-2" lang="en">{row.punchType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2">
        <div className="text-sm font-black text-gray-800">
          {tr('دفعات سجلات البصمة المرفوعة', 'Uploaded Fingerprint Batches')}
        </div>

        {sortedBatches.map(batch => {
          const deviceName = findDevice(batch.deviceId)?.name || tr('غير محدد', 'Not selected');
          return (
            <div
              key={batch.id}
              className="rounded-xl border border-gray-100 p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-black text-gray-800">
                  {batch.fileName || sourceLabel(batch.source)}
                </div>
                <div className="text-xs font-bold text-gray-500" lang="en">
                  {tr('السجلات', 'Rows')}: {batch.rows.length} - {new Date(batch.importedAt).toLocaleString('en-GB')}
                </div>
                <div className="text-[11px] text-gray-400">
                  {sourceLabel(batch.source)} - {deviceName}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setBatchStatus(batch)}
                  className={`px-3 py-2 rounded-xl text-xs font-black ${
                    batch.status === 'APPLIED'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-indigo-50 text-indigo-700'
                  }`}
                >
                  {batchStatusLabel(batch.status)}
                </button>

                <button
                  type="button"
                  onClick={() => removeBatch(batch)}
                  className="p-2 rounded-xl bg-rose-50 text-rose-700"
                  title={tr('حذف', 'Delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {sortedBatches.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm font-bold text-gray-400">
            {tr('لا توجد دفعات حضور مرفوعة بعد', 'No attendance batches uploaded yet')}
          </div>
        )}
      </div>
    </div>
  );
};

export default FingerprintReadersManager;

