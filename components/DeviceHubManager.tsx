import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Cable,
  HardDrive,
  Download,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ScanBarcode,
  Scale,
  Trash2,
  Wifi,
  Fingerprint,
  ListChecks,
  RotateCw,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import {
  appendDeviceHubLog,
  clearDeviceHubQueueCompleted,
  deleteDeviceHubDevice,
  DeviceHubAction,
  DeviceHubConnectionType,
  DeviceHubRecord,
  DeviceHubState,
  DeviceHubType,
  enqueueDeviceHubJob,
  exportDeviceHubDevicesCsv,
  exportDeviceHubLogsCsv,
  loadDeviceHubState,
  patchDeviceHubState,
  runDeviceHubOfflineQueue,
  testDeviceHubDeviceConnection,
  upsertDeviceHubDevice,
  updateDeviceHubQueueJob
} from '../utils/deviceHub';
import {
  ThermalDocumentType,
  ThermalTemplateCustomizationMap,
  ThermalTemplatePreferences,
  buildThermalTemplatePreview,
  getSelectedThermalTemplate,
  loadThermalTemplateCustomizations,
  getThermalTemplateOptions,
  saveThermalTemplateCustomization,
  loadThermalTemplatePreferences,
  saveThermalTemplatePreferences
} from '../utils/thermalPrintTemplates';

const defaultForm = (): Partial<DeviceHubRecord> => ({
  id: '',
  name: '',
  type: 'BARCODE_SCANNER',
  connectionType: 'LOCAL_AGENT',
  branch: '',
  location: '',
  localAgentUrl: '',
  host: '',
  port: undefined,
  serialPort: '',
  model: '',
  notes: '',
  isActive: true
});

const DeviceHubManager: React.FC = () => {
  const { currentCompanyId, companySettings, fingerprintDevices } = useAccounting();
  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);

  const [state, setState] = useState<DeviceHubState>(() => loadDeviceHubState(currentCompanyId));
  const [form, setForm] = useState<Partial<DeviceHubRecord>>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [busyTestId, setBusyTestId] = useState<string | null>(null);
  const [busyRunQueue, setBusyRunQueue] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'SUCCESS' | 'ERROR' | 'QUEUED' | 'INFO'>('ALL');
  const [logDeviceFilter, setLogDeviceFilter] = useState<string>('ALL');
  const [onlyErrorDetails, setOnlyErrorDetails] = useState(false);
  const [thermalPrefs, setThermalPrefs] = useState<ThermalTemplatePreferences>(
    () => loadThermalTemplatePreferences(currentCompanyId)
  );
  const [thermalCustomizations, setThermalCustomizations] = useState<ThermalTemplateCustomizationMap>(
    () => loadThermalTemplateCustomizations(currentCompanyId)
  );
  const [activeThermalType, setActiveThermalType] = useState<ThermalDocumentType>('INVOICE');

  useEffect(() => {
    setState(loadDeviceHubState(currentCompanyId));
    setForm(defaultForm());
    setEditingId(null);
    setThermalPrefs(loadThermalTemplatePreferences(currentCompanyId));
    setThermalCustomizations(loadThermalTemplateCustomizations(currentCompanyId));
  }, [currentCompanyId]);

  const refresh = () => setState(loadDeviceHubState(currentCompanyId));

  const updateForm = <K extends keyof DeviceHubRecord>(key: K, value: DeviceHubRecord[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const saveDevice = () => {
    const normalizedName = String(form.name || '').trim();
    if (!normalizedName) {
      setStatusMsg(tr('أدخل اسم الجهاز أولاً.', 'Enter a device name first.'));
      return;
    }
    const next = upsertDeviceHubDevice(currentCompanyId, {
      ...form,
      id: editingId || undefined,
      name: normalizedName
    });
    setState(next);
    setStatusMsg(tr('تم حفظ الجهاز بنجاح.', 'Device saved successfully.'));
    setForm(defaultForm());
    setEditingId(null);
  };

  const editDevice = (device: DeviceHubRecord) => {
    setEditingId(device.id);
    setForm({ ...device });
    setStatusMsg('');
  };

  const removeDevice = (device: DeviceHubRecord) => {
    if (!window.confirm(tr('هل تريد حذف هذا الجهاز؟', 'Delete this device?'))) return;
    const next = deleteDeviceHubDevice(currentCompanyId, device.id);
    appendDeviceHubLog(currentCompanyId, {
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      action: 'QUEUE',
      status: 'INFO',
      message: tr('تم حذف تعريف الجهاز', 'Device definition deleted')
    });
    setState(next);
    if (editingId === device.id) {
      setEditingId(null);
      setForm(defaultForm());
    }
  };

  const setGlobalAgent = (url: string) => {
    const next = patchDeviceHubState(currentCompanyId, prev => ({ ...prev, localAgentBaseUrl: String(url || '').trim() }));
    setState(next);
  };

  const setThermalTemplate = (type: ThermalDocumentType, templateId: string) => {
    const next = saveThermalTemplatePreferences(currentCompanyId, { [type]: templateId });
    setThermalPrefs(next);
    setStatusMsg(tr('تم حفظ قالب الطباعة الحرارية.', 'Thermal print template saved.'));
  };

  const updateThermalCustomization = (
    type: ThermalDocumentType,
    patch: Partial<ThermalTemplateCustomizationMap[ThermalDocumentType]>
  ) => {
    setThermalCustomizations(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        ...patch
      }
    }));
  };

  const saveThermalCustomization = (type: ThermalDocumentType) => {
    const next = saveThermalTemplateCustomization(currentCompanyId, type, thermalCustomizations[type]);
    setThermalCustomizations(next);
    setStatusMsg(tr('تم حفظ تعديلات القالب الحراري.', 'Thermal template edits saved.'));
  };

  const handleTest = async (device: DeviceHubRecord) => {
    setBusyTestId(device.id);
    setStatusMsg('');
    const result = await testDeviceHubDeviceConnection(currentCompanyId, device.id);
    refresh();
    setStatusMsg(result.ok ? tr('تم اختبار الاتصال بنجاح.', 'Connection test succeeded.') : tr('فشل اختبار الاتصال.', 'Connection test failed.'));
    setBusyTestId(null);
  };

  const queueAction = (device: DeviceHubRecord, action: DeviceHubAction) => {
    const next = enqueueDeviceHubJob(currentCompanyId, {
      deviceId: device.id,
      deviceType: device.type,
      action,
      payload: {
        requestedAt: new Date().toISOString(),
        requestedFrom: 'DeviceHubManager'
      }
    });
    setState(next);
    setStatusMsg(tr('تمت إضافة المهمة إلى طابور الأوفلاين.', 'Job added to offline queue.'));
  };

  const runQueue = async () => {
    setBusyRunQueue(true);
    setStatusMsg('');
    try {
      const result = await runDeviceHubOfflineQueue(currentCompanyId);
      setState(result.state);
      setStatusMsg(
        tr(
          `تمت معالجة ${result.processed} مهمة (نجاح ${result.succeeded} / فشل ${result.failed})`,
          `Processed ${result.processed} jobs (success ${result.succeeded} / failed ${result.failed})`
        )
      );
    } finally {
      setBusyRunQueue(false);
    }
  };

  const markQueuePending = (jobId: string) => {
    const next = updateDeviceHubQueueJob(currentCompanyId, jobId, { status: 'PENDING', error: undefined });
    setState(next);
  };

  const clearDoneQueue = () => {
    const next = clearDeviceHubQueueCompleted(currentCompanyId);
    setState(next);
  };

  const syncFingerprintDevicesToHub = () => {
    let count = 0;
    fingerprintDevices.forEach(fp => {
      upsertDeviceHubDevice(currentCompanyId, {
        externalRefId: `fp:${fp.id}`,
        name: fp.name,
        type: 'FINGERPRINT_READER',
        connectionType: fp.mode === 'DIRECT' ? 'LOCAL_AGENT' : 'MANUAL',
        localAgentUrl: fp.localAgentUrl || '',
        host: fp.host || '',
        port: fp.port,
        model: fp.model || '',
        location: fp.location || '',
        notes: fp.notes || '',
        isActive: fp.isActive !== false,
        lastUsedAt: fp.lastSyncAt
      });
      count += 1;
    });
    appendDeviceHubLog(currentCompanyId, {
      action: 'SYNC_FINGERPRINT',
      status: 'INFO',
      message: tr(`تمت مزامنة ${count} جهاز بصمة إلى مركز الأجهزة`, `Synced ${count} fingerprint devices into device hub`)
    });
    refresh();
    setStatusMsg(tr('تمت مزامنة أجهزة البصمة إلى مركز الأجهزة.', 'Fingerprint devices synced to device hub.'));
  };

  const seedCommonDevices = () => {
    const templates: Array<Partial<DeviceHubRecord>> = [
      { externalRefId: 'tpl:barcode_scanner', name: tr('قارئ باركود', 'Barcode Scanner'), type: 'BARCODE_SCANNER', connectionType: 'USB' },
      { externalRefId: 'tpl:receipt_printer', name: tr('طابعة فواتير حرارية', 'Thermal Receipt Printer'), type: 'RECEIPT_PRINTER', connectionType: 'LOCAL_AGENT' },
      { externalRefId: 'tpl:label_printer', name: tr('طابعة ملصقات باركود', 'Barcode Label Printer'), type: 'LABEL_PRINTER', connectionType: 'LOCAL_AGENT' },
      { externalRefId: 'tpl:cash_drawer', name: tr('درج نقدي', 'Cash Drawer'), type: 'CASH_DRAWER', connectionType: 'LOCAL_AGENT' },
      { externalRefId: 'tpl:scale', name: tr('ميزان إلكتروني', 'Electronic Scale'), type: 'SCALE', connectionType: 'LOCAL_AGENT' }
    ];
    templates.forEach(t => upsertDeviceHubDevice(currentCompanyId, { isActive: true, ...t }));
    appendDeviceHubLog(currentCompanyId, {
      action: 'QUEUE',
      status: 'INFO',
      message: tr('تمت إضافة الأجهزة الشائعة الافتراضية.', 'Common device templates added.')
    });
    refresh();
  };

  const filteredLogs = useMemo(
    () => {
      let logs = logFilter === 'ALL' ? state.logs : state.logs.filter(l => l.status === logFilter);
      if (logDeviceFilter !== 'ALL') logs = logs.filter(l => l.deviceId === logDeviceFilter);
      if (onlyErrorDetails) logs = logs.filter(l => l.status === 'ERROR');
      return logs.slice().reverse();
    },
    [state.logs, logFilter, logDeviceFilter, onlyErrorDetails]
  );

  const deviceErrorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    state.logs.forEach(log => {
      if (log.status !== 'ERROR' || !log.deviceId) return;
      counts[log.deviceId] = (counts[log.deviceId] || 0) + 1;
    });
    return state.devices
      .map(device => ({ device, errors: counts[device.id] || 0 }))
      .filter(item => item.errors > 0)
      .sort((a, b) => b.errors - a.errors);
  }, [state.logs, state.devices]);

  const deviceTypeLabel = (type: DeviceHubType) => {
    switch (type) {
      case 'BARCODE_SCANNER': return tr('قارئ باركود', 'Barcode Scanner');
      case 'RECEIPT_PRINTER': return tr('طابعة فواتير', 'Receipt Printer');
      case 'LABEL_PRINTER': return tr('طابعة ملصقات', 'Label Printer');
      case 'CASH_DRAWER': return tr('درج نقدي', 'Cash Drawer');
      case 'SCALE': return tr('ميزان', 'Scale');
      case 'DOCUMENT_SCANNER': return tr('ماسح مستندات', 'Document Scanner');
      case 'FINGERPRINT_READER': return tr('قارئ بصمة', 'Fingerprint Reader');
      default: return type;
    }
  };

  const connectionLabel = (type: DeviceHubConnectionType) => {
    switch (type) {
      case 'LOCAL_AGENT': return tr('وكيل محلي', 'Local Agent');
      case 'NETWORK': return tr('شبكي', 'Network');
      case 'USB': return 'USB';
      case 'BLUETOOTH': return tr('بلوتوث', 'Bluetooth');
      case 'SERIAL': return tr('منفذ تسلسلي', 'Serial');
      case 'MANUAL': return tr('يدوي', 'Manual');
      default: return type;
    }
  };

  const renderDeviceIcon = (type: DeviceHubType) => {
    switch (type) {
      case 'BARCODE_SCANNER': return <ScanBarcode className="w-4 h-4" />;
      case 'RECEIPT_PRINTER':
      case 'LABEL_PRINTER': return <Printer className="w-4 h-4" />;
      case 'CASH_DRAWER': return <HardDrive className="w-4 h-4" />;
      case 'SCALE': return <Scale className="w-4 h-4" />;
      case 'FINGERPRINT_READER': return <Fingerprint className="w-4 h-4" />;
      default: return <Cable className="w-4 h-4" />;
    }
  };

  const exportLogsCsv = () => {
    const count = exportDeviceHubLogsCsv(currentCompanyId, {
      status: logFilter,
      onlyErrors: onlyErrorDetails,
      deviceId: logDeviceFilter !== 'ALL' ? logDeviceFilter : undefined
    });
    setStatusMsg(
      tr(
        `تم تصدير ${count} سجل إلى CSV.`,
        `Exported ${count} log rows to CSV.`
      )
    );
  };

  const exportDevicesCsv = () => {
    const count = exportDeviceHubDevicesCsv(currentCompanyId);
    setStatusMsg(tr(`تم تصدير ${count} جهاز إلى CSV.`, `Exported ${count} devices to CSV.`));
  };

  const thermalOptions = useMemo(
    () => ({
      INVOICE: getThermalTemplateOptions('INVOICE'),
      VOUCHER: getThermalTemplateOptions('VOUCHER'),
      RECEIPT: getThermalTemplateOptions('RECEIPT')
    }),
    []
  );

  const selectedThermalOption = useMemo(() => {
    const selectedId = thermalPrefs[activeThermalType];
    return thermalOptions[activeThermalType].find(option => option.id === selectedId)
      || getSelectedThermalTemplate(currentCompanyId, activeThermalType);
  }, [activeThermalType, thermalPrefs, thermalOptions, currentCompanyId]);

  const thermalPreviewLines = useMemo(() => {
    return buildThermalTemplatePreview({
      type: activeThermalType,
      template: selectedThermalOption,
      customization: thermalCustomizations[activeThermalType],
      isEnglish,
      companyName: companySettings.name
    });
  }, [activeThermalType, selectedThermalOption, thermalCustomizations, isEnglish, companySettings.name]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-slate-100 text-slate-700"><Cable className="w-5 h-5" /></div>
            <div>
              <h3 className="text-sm font-black text-gray-800">{tr('مركز إدارة الأجهزة', 'Device Management Center')}</h3>
              <p className="text-xs font-bold text-gray-400">
                {tr('تعريف الأجهزة، اختبار الاتصال، سجل العمليات، وطابور الأوفلاين', 'Define devices, test connectivity, device logs, and offline queue')}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={seedCommonDevices} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {tr('إضافة أجهزة شائعة', 'Seed Common Devices')}
            </button>
            <button type="button" onClick={syncFingerprintDevicesToHub} className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-black text-indigo-700 inline-flex items-center gap-2">
              <Fingerprint className="w-4 h-4" />
              {tr('مزامنة أجهزة البصمة', 'Sync Fingerprint Devices')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs font-black text-gray-700 block mb-1">{tr('رابط الوكيل المحلي الموحد (اختياري)', 'Unified local agent URL (optional)')}</label>
            <input
              value={state.localAgentBaseUrl || ''}
              onChange={(e) => setGlobalAgent(e.target.value)}
              placeholder="http://127.0.0.1:8765"
              className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold dir-ltr"
            />
            <div className="text-[11px] text-gray-400 font-bold mt-1">
              {tr('يستخدم كافتراضي لاختبار/تنفيذ مهام الأجهزة إذا لم يتم تحديد رابط خاص للجهاز.', 'Used as default for device tests/jobs when no per-device URL is set.')}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-gray-400 font-black">{tr('الأجهزة', 'Devices')}</div>
              <div className="text-lg font-black text-slate-800">{state.devices.length}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-gray-400 font-black">{tr('الطابور', 'Queue')}</div>
              <div className="text-lg font-black text-amber-700">{state.queue.filter(q => q.status !== 'DONE').length}</div>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
            {statusMsg}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="text-sm font-black text-gray-800">{tr('قوالب الطباعة الحرارية', 'Thermal Print Templates')}</h4>
            <p className="text-[11px] font-bold text-gray-500">
              {tr('اختيار قالب افتراضي لطباعة الفاتورة والسند والإيصال على الطابعة الحرارية.', 'Select default template for invoice, voucher, and receipt thermal printing.')}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <label className="text-xs font-black text-gray-700 block mb-2">{tr('قالب الفاتورة', 'Invoice Template')}</label>
            <select
              value={thermalPrefs.INVOICE}
              onChange={(e) => setThermalTemplate('INVOICE', e.target.value)}
              className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-xs font-black"
            >
              {thermalOptions.INVOICE.map(option => (
                <option key={option.id} value={option.id}>
                  {isEnglish ? option.nameEn : option.nameAr} - {isEnglish ? option.descriptionEn : option.descriptionAr}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <label className="text-xs font-black text-gray-700 block mb-2">{tr('قالب السند', 'Voucher Template')}</label>
            <select
              value={thermalPrefs.VOUCHER}
              onChange={(e) => setThermalTemplate('VOUCHER', e.target.value)}
              className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-xs font-black"
            >
              {thermalOptions.VOUCHER.map(option => (
                <option key={option.id} value={option.id}>
                  {isEnglish ? option.nameEn : option.nameAr} - {isEnglish ? option.descriptionEn : option.descriptionAr}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <label className="text-xs font-black text-gray-700 block mb-2">{tr('قالب الإيصال', 'Receipt Template')}</label>
            <select
              value={thermalPrefs.RECEIPT}
              onChange={(e) => setThermalTemplate('RECEIPT', e.target.value)}
              className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-xs font-black"
            >
              {thermalOptions.RECEIPT.map(option => (
                <option key={option.id} value={option.id}>
                  {isEnglish ? option.nameEn : option.nameAr} - {isEnglish ? option.descriptionEn : option.descriptionAr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {(['INVOICE', 'VOUCHER', 'RECEIPT'] as ThermalDocumentType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveThermalType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black border ${activeThermalType === type
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700'
                  }`}
              >
                {type === 'INVOICE'
                  ? tr('الفاتورة', 'Invoice')
                  : type === 'VOUCHER'
                    ? tr('السند', 'Voucher')
                    : tr('الإيصال', 'Receipt')}
              </button>
            ))}
            <span className="text-[11px] font-bold text-gray-500">
              {tr('معاينة وتعديل القالب المحدد', 'Preview and edit selected template')}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-3">
              <div className="text-xs font-black text-gray-700">
                {(isEnglish ? selectedThermalOption.nameEn : selectedThermalOption.nameAr)}
                <span className="text-gray-400 font-bold"> - {(isEnglish ? selectedThermalOption.descriptionEn : selectedThermalOption.descriptionAr)}</span>
              </div>
              <div>
                <label className="text-[11px] font-black text-gray-600 block mb-1">{tr('عنوان أعلى الإيصال (اختياري)', 'Receipt header (optional)')}</label>
                <input
                  value={thermalCustomizations[activeThermalType].headerText}
                  onChange={(e) => updateThermalCustomization(activeThermalType, { headerText: e.target.value })}
                  placeholder={tr('مثال: فرع رام الله - نقطة بيع 1', 'e.g. Ramallah Branch - POS 1')}
                  className="w-full p-2.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-gray-600 block mb-1">{tr('تذييل أسفل الإيصال (اختياري)', 'Receipt footer (optional)')}</label>
                <input
                  value={thermalCustomizations[activeThermalType].footerText}
                  onChange={(e) => updateThermalCustomization(activeThermalType, { footerText: e.target.value })}
                  placeholder={tr('مثال: شكراً لتعاملكم معنا', 'e.g. Thank you for your business')}
                  className="w-full p-2.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-black text-gray-600 block mb-1">{tr('عرض الورق', 'Paper width')}</label>
                  <select
                    value={thermalCustomizations[activeThermalType].paperWidthMm}
                    onChange={(e) => updateThermalCustomization(activeThermalType, { paperWidthMm: Number(e.target.value) as 58 | 80 })}
                    className="w-full p-2.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-black"
                  >
                    <option value={80}>80mm</option>
                    <option value={58}>58mm</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-black text-gray-600 block mb-1">{tr('حد البنود المختصرة', 'Compact line limit')}</label>
                  <input
                    value={thermalCustomizations[activeThermalType].compactMaxItems}
                    onChange={(e) => {
                      const value = Number(toEnglishDigits(String(e.target.value || '')).replace(/[^\d]/g, ''));
                      if (!Number.isFinite(value)) return;
                      updateThermalCustomization(activeThermalType, { compactMaxItems: Math.max(3, Math.min(20, Math.floor(value))) });
                    }}
                    className="w-full p-2.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-black dir-ltr"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 px-2 py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs font-black text-gray-700">
                <input
                  type="checkbox"
                  checked={thermalCustomizations[activeThermalType].showPrintedAt}
                  onChange={(e) => updateThermalCustomization(activeThermalType, { showPrintedAt: e.target.checked })}
                />
                <span>{tr('إظهار وقت الطباعة', 'Show printed timestamp')}</span>
              </label>
              <button
                type="button"
                onClick={() => saveThermalCustomization(activeThermalType)}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-black inline-flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                {tr('حفظ تعديلات القالب', 'Save Template Edits')}
              </button>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-3">
              <div className="text-xs font-black text-gray-700 mb-2">
                {tr('معاينة الإخراج الحراري', 'Thermal output preview')}
                <span className="text-gray-400 font-bold"> ({thermalCustomizations[activeThermalType].paperWidthMm}mm)</span>
              </div>
              <pre className="bg-slate-900 text-emerald-300 rounded-lg p-3 text-[11px] leading-5 overflow-auto h-[320px] font-mono whitespace-pre-wrap">
                {thermalPreviewLines.join('\n')}
              </pre>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="text-sm font-black text-gray-800">{editingId ? tr('تعديل جهاز', 'Edit Device') : tr('إضافة جهاز', 'Add Device')}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black text-gray-700 block mb-1">{tr('اسم الجهاز', 'Device name')}</label>
            <input value={String(form.name || '')} onChange={(e) => updateForm('name', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-700 block mb-1">{tr('نوع الجهاز', 'Device type')}</label>
            <select value={(form.type as string) || 'BARCODE_SCANNER'} onChange={(e) => updateForm('type', e.target.value as DeviceHubType)} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold">
              {(['BARCODE_SCANNER','RECEIPT_PRINTER','LABEL_PRINTER','CASH_DRAWER','SCALE','DOCUMENT_SCANNER','FINGERPRINT_READER'] as DeviceHubType[]).map(type => (
                <option key={type} value={type}>{deviceTypeLabel(type)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-gray-700 block mb-1">{tr('طريقة الاتصال', 'Connection type')}</label>
            <select value={(form.connectionType as string) || 'LOCAL_AGENT'} onChange={(e) => updateForm('connectionType', e.target.value as DeviceHubConnectionType)} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold">
              {(['LOCAL_AGENT','NETWORK','USB','BLUETOOTH','SERIAL','MANUAL'] as DeviceHubConnectionType[]).map(type => (
                <option key={type} value={type}>{connectionLabel(type)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-gray-700 block mb-1">{tr('الفرع / الموقع', 'Branch / Location')}</label>
            <div className="grid grid-cols-2 gap-2">
              <input value={String(form.branch || '')} onChange={(e) => updateForm('branch', e.target.value)} placeholder={tr('الفرع', 'Branch')} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold" />
              <input value={String(form.location || '')} onChange={(e) => updateForm('location', e.target.value)} placeholder={tr('الموقع', 'Location')} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold" />
            </div>
          </div>
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-2">
            <input value={String(form.localAgentUrl || '')} onChange={(e) => updateForm('localAgentUrl', e.target.value)} placeholder={tr('رابط الوكيل المحلي (اختياري)', 'Local agent URL (optional)')} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold dir-ltr md:col-span-2" />
            <div className="grid grid-cols-2 gap-2">
              <input value={String(form.host || '')} onChange={(e) => updateForm('host', e.target.value)} placeholder={tr('Host', 'Host')} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold dir-ltr" />
              <input value={form.port == null ? '' : String(form.port)} onChange={(e) => updateForm('port', (Number(toEnglishDigits(e.target.value).replace(/[^\d]/g, '')) || undefined) as any)} placeholder={tr('Port', 'Port')} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-center dir-ltr" />
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-gray-700 block mb-1">{tr('الموديل / المنفذ', 'Model / Port')}</label>
            <div className="grid grid-cols-2 gap-2">
              <input value={String(form.model || '')} onChange={(e) => updateForm('model', e.target.value)} placeholder={tr('موديل', 'Model')} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold" />
              <input value={String(form.serialPort || '')} onChange={(e) => updateForm('serialPort', e.target.value)} placeholder={tr('COM3 / ttyUSB0', 'COM3 / ttyUSB0')} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold dir-ltr" />
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-gray-700 block mb-1">{tr('ملاحظات', 'Notes')}</label>
            <input value={String(form.notes || '')} onChange={(e) => updateForm('notes', e.target.value)} className="w-full p-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold" />
          </div>
          <label className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex items-center justify-between gap-2 text-sm font-black text-gray-700">
            <span>{tr('الجهاز نشط', 'Device active')}</span>
            <input type="checkbox" checked={form.isActive !== false} onChange={(e) => updateForm('isActive', e.target.checked as any)} />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(defaultForm()); }} className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-700">
              {tr('إلغاء التعديل', 'Cancel Edit')}
            </button>
          )}
          <button type="button" onClick={saveDevice} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black inline-flex items-center gap-2">
            <Save className="w-4 h-4" />
            {editingId ? tr('حفظ التعديل', 'Save Changes') : tr('إضافة الجهاز', 'Add Device')}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-black text-gray-800">{tr('الأجهزة المعرفة', 'Configured Devices')}</div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-gray-400">{state.devices.filter(d => d.isActive).length} {tr('نشط', 'active')}</div>
            <button
              type="button"
              onClick={exportDevicesCsv}
              className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-[11px] font-black text-indigo-700 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {tr('تصدير CSV', 'Export CSV')}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {state.devices.map(device => (
            <div key={device.id} className="rounded-xl border border-gray-100 p-3 bg-white">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${device.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                    {renderDeviceIcon(device.type)}
                  </div>
                  <div>
                    <div className="text-sm font-black text-gray-800 flex items-center gap-2 flex-wrap">
                      <span>{device.name}</span>
                      <span className="text-[10px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{deviceTypeLabel(device.type)}</span>
                      <span className="text-[10px] px-2 py-1 rounded-lg bg-blue-50 text-blue-700">{connectionLabel(device.connectionType)}</span>
                      {!device.isActive && <span className="text-[10px] px-2 py-1 rounded-lg bg-rose-50 text-rose-700">{tr('موقوف', 'Inactive')}</span>}
                    </div>
                    <div className="text-xs text-gray-400 font-bold mt-1">
                      {[device.branch, device.location].filter(Boolean).join(' • ') || tr('بدون موقع محدد', 'No location specified')}
                    </div>
                    <div className="text-[11px] text-gray-400 font-bold mt-1 dir-ltr text-left">
                      {device.localAgentUrl || [device.host, device.port].filter(Boolean).join(':') || device.serialPort || '-'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 min-w-[260px]">
                  <button type="button" onClick={() => editDevice(device)} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-black text-slate-700">{tr('تعديل', 'Edit')}</button>
                  <button type="button" onClick={() => handleTest(device)} disabled={busyTestId === device.id} className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[11px] font-black text-blue-700 inline-flex items-center justify-center gap-1 disabled:opacity-60">
                    {busyTestId === device.id ? <RotateCw className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                    {tr('فحص', 'Test')}
                  </button>
                  <button
                    type="button"
                    onClick={() => queueAction(device, device.type === 'RECEIPT_PRINTER' ? 'PRINT_RECEIPT' : device.type === 'LABEL_PRINTER' ? 'PRINT_LABEL' : device.type === 'CASH_DRAWER' ? 'OPEN_CASH_DRAWER' : device.type === 'SCALE' ? 'READ_WEIGHT' : device.type === 'FINGERPRINT_READER' ? 'SYNC_FINGERPRINT' : 'SCAN')}
                    className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-black text-amber-700"
                  >
                    {tr('إضافة للطابور', 'Queue')}
                  </button>
                  <button type="button" onClick={() => removeDevice(device)} className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-black text-rose-700 inline-flex items-center justify-center gap-1">
                    <Trash2 className="w-3 h-3" />
                    {tr('حذف', 'Delete')}
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1">
                  <span className="text-gray-400 font-black">{tr('آخر استخدام', 'Last use')}</span>
                  <div className="font-black text-slate-700">{device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleString('en-GB') : '-'}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1">
                  <span className="text-gray-400 font-black">{tr('آخر فحص', 'Last test')}</span>
                  <div className="font-black text-slate-700">{device.lastTestAt ? new Date(device.lastTestAt).toLocaleString('en-GB') : '-'}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1">
                  <span className="text-gray-400 font-black">{tr('نتيجة الفحص', 'Test result')}</span>
                  <div className={`font-black ${device.lastTestStatus === 'ERROR' ? 'text-rose-700' : device.lastTestStatus === 'SUCCESS' ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {device.lastTestStatus === 'ERROR' ? tr('فشل', 'Failed') : device.lastTestStatus === 'SUCCESS' ? tr('نجاح', 'Success') : '-'}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1">
                  <span className="text-gray-400 font-black">{tr('آخر خطأ', 'Last error')}</span>
                  <div className="font-black text-rose-700 truncate" title={device.lastError || ''}>{device.lastError || '-'}</div>
                </div>
              </div>
            </div>
          ))}
          {state.devices.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-black text-gray-500">
              {tr('لا توجد أجهزة معرفة بعد. أضف جهازًا أو استخدم زر الأجهزة الشائعة.', 'No devices configured yet. Add one or seed common devices.')}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700"><ListChecks className="w-4 h-4" /></div>
            <div className="text-sm font-black text-gray-800">{tr('طابور الأجهزة (Offline Queue)', 'Device Offline Queue')}</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={clearDoneQueue} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-700">{tr('مسح المنفذ', 'Clear Done')}</button>
            <button type="button" onClick={runQueue} disabled={busyRunQueue} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black inline-flex items-center gap-2 disabled:opacity-60">
              {busyRunQueue ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
              {tr('تشغيل الطابور', 'Run Queue')}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 overflow-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-right font-black text-gray-500">{tr('الحالة', 'Status')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('الإجراء', 'Action')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('الجهاز', 'Device')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('المحاولات', 'Attempts')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('آخر محاولة', 'Last attempt')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('الخطأ', 'Error')}</th>
                <th className="p-2 text-center font-black text-gray-500">{tr('إجراء', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {[...state.queue].reverse().map(job => {
                const device = job.deviceId ? state.devices.find(d => d.id === job.deviceId) : null;
                return (
                  <tr key={job.id} className="border-t border-gray-100">
                    <td className="p-2 font-black"><span className={`px-2 py-1 rounded-lg ${job.status === 'DONE' ? 'bg-emerald-50 text-emerald-700' : job.status === 'FAILED' ? 'bg-rose-50 text-rose-700' : job.status === 'RUNNING' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{job.status}</span></td>
                    <td className="p-2 font-black text-gray-700">{job.action}</td>
                    <td className="p-2 font-bold text-gray-600">{device?.name || '-'}</td>
                    <td className="p-2 font-black text-gray-700">{job.attempts}</td>
                    <td className="p-2 font-bold text-gray-500">{job.lastAttemptAt ? new Date(job.lastAttemptAt).toLocaleString('en-GB') : '-'}</td>
                    <td className="p-2 font-bold text-rose-600 max-w-[280px] truncate" title={job.error || ''}>{job.error || '-'}</td>
                    <td className="p-2 text-center">{job.status === 'FAILED' && <button type="button" onClick={() => markQueuePending(job.id)} className="px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[10px]">{tr('إعادة للمعلق', 'Reset to Pending')}</button>}</td>
                  </tr>
                );
              })}
              {state.queue.length === 0 && <tr><td colSpan={7} className="p-5 text-center text-sm font-black text-gray-500">{tr('لا توجد مهام في الطابور.', 'Queue is empty.')}</td></tr>}
            </tbody>
          </table>
        </div>
        {deviceErrorCounts.length > 0 && (
          <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
            <div className="text-xs font-black text-rose-700 mb-2">{tr('أخطاء الأجهزة حسب كل جهاز', 'Device error count by device')}</div>
            <div className="flex flex-wrap gap-2">
              {deviceErrorCounts.map(item => (
                <button
                  key={item.device.id}
                  type="button"
                  onClick={() => {
                    setLogDeviceFilter(item.device.id);
                    setOnlyErrorDetails(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-[11px] font-black text-rose-700"
                >
                  {item.device.name}: {item.errors}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700"><Activity className="w-4 h-4" /></div>
            <div className="text-sm font-black text-gray-800">{tr('سجل عمليات الأجهزة', 'Device Logs')}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={logFilter} onChange={(e) => setLogFilter(e.target.value as any)} className="p-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-black">
              <option value="ALL">{tr('الكل', 'All')}</option>
              <option value="SUCCESS">{tr('نجاح', 'Success')}</option>
              <option value="ERROR">{tr('فشل', 'Error')}</option>
              <option value="QUEUED">{tr('معلّق/طابور', 'Queued')}</option>
              <option value="INFO">{tr('معلومة', 'Info')}</option>
            </select>
            <select value={logDeviceFilter} onChange={(e) => setLogDeviceFilter(e.target.value)} className="p-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-black">
              <option value="ALL">{tr('كل الأجهزة', 'All devices')}</option>
              {state.devices.map(device => (
                <option key={device.id} value={device.id}>{device.name}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 px-2 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-black text-gray-600">
              <input type="checkbox" checked={onlyErrorDetails} onChange={(e) => setOnlyErrorDetails(e.target.checked)} />
              <span>{tr('أخطاء فقط', 'Errors only')}</span>
            </label>
            <button type="button" onClick={exportLogsCsv} className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-black text-indigo-700 inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" />
              {tr('تصدير CSV', 'Export CSV')}
            </button>
            <button type="button" onClick={() => { patchDeviceHubState(currentCompanyId, prev => ({ ...prev, logs: [] })); refresh(); }} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-700">{tr('مسح السجل', 'Clear Logs')}</button>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 overflow-auto">
          <table className="w-full min-w-[1320px] text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-right font-black text-gray-500">{tr('الوقت', 'Time')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('الحالة', 'Status')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('الإجراء', 'Action')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('الجهاز', 'Device')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('المعرّف', 'Request ID')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('الأمر', 'Command')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('المدة', 'Duration')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('رمز الخطأ', 'Error Code')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('عنوان التنفيذ', 'Execute URL')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('الرسالة', 'Message')}</th>
                <th className="p-2 text-right font-black text-gray-500">{tr('تفاصيل', 'Details')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice(0, 120).map(log => (
                <tr key={log.id} className="border-t border-gray-100">
                  <td className="p-2 font-bold text-gray-500">{new Date(log.timestamp).toLocaleString('en-GB')}</td>
                  <td className="p-2 font-black">
                    <span className={`px-2 py-1 rounded-lg ${log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : log.status === 'ERROR' ? 'bg-rose-50 text-rose-700' : log.status === 'QUEUED' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                      {log.status === 'SUCCESS' ? <CheckCircle2 className="w-3 h-3 inline me-1" /> : log.status === 'ERROR' ? <AlertTriangle className="w-3 h-3 inline me-1" /> : null}
                      {log.status}
                    </span>
                  </td>
                  <td className="p-2 font-black text-gray-700">{log.action}</td>
                  <td className="p-2 font-bold text-gray-600">{log.deviceName || log.deviceId || '-'}</td>
                  <td className="p-2 font-mono text-[10px] text-slate-600">{log.requestId || '-'}</td>
                  <td className="p-2 font-mono text-[10px] text-slate-600">{log.agentCommand || '-'}</td>
                  <td className="p-2 font-black text-slate-700">{typeof log.durationMs === 'number' ? `${log.durationMs}ms` : '-'}</td>
                  <td className="p-2 font-mono text-[10px] text-rose-700">{log.errorCode || '-'}</td>
                  <td className="p-2 font-mono text-[10px] text-slate-500 max-w-[220px] truncate" title={log.executeUrl || ''}>{log.executeUrl || '-'}</td>
                  <td className="p-2 font-bold text-gray-600">{log.message}</td>
                  <td className="p-2 font-mono text-[10px] text-slate-500 max-w-[300px] truncate" title={log.metadata ? JSON.stringify(log.metadata) : ''}>{log.metadata ? JSON.stringify(log.metadata) : '-'}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && <tr><td colSpan={11} className="p-5 text-center text-sm font-black text-gray-500">{tr('لا توجد سجلات مطابقة.', 'No matching logs.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DeviceHubManager;
