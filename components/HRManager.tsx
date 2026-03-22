import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useAccounting } from '../contexts/AccountingContext';
import { Employee, Department, TransactionType, Account, EmployeeContract, SalaryHistoryEntry, EmployeeLeaveRequest, EmployeeRecurringDeduction, EmployeePayBasis, FingerprintAttendanceBatch, FingerprintAttendanceEntry } from '../types';
import EnglishDateInput from './EnglishDateInput';
import DocumentActions from './DocumentActions';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { getDisplayAccountName } from '../utils/displayNames';
import { downloadElementAsPdf, downloadWorkbookFile, exportElementAsCsv, extractElementReadableText, settleElementBeforeSnapshot } from '../utils/documentExport';
import { toEnglishDigits } from '../utils/forceEnglishDigits';
import { getCurrentFiscalYearRange } from '../utils/fiscalYear';
import {
    Users, UserPlus, Briefcase, Landmark, Plus, Trash2,
    Edit2, Check, X, Search, FileText, DollarSign,
    Calendar, Building2, UserCircle, Calculator, TrendingUp, Clock, Zap, AlertCircle,
    ChevronDown, User as UserIcon, CalendarRange, ArrowLeft, Printer, Settings,
    Coins, Percent, CalendarCheck, Timer, LogIn, LogOut, ArrowRight, CheckCircle, RefreshCw,
    UserCheck, UserMinus, History, ChevronUp, Receipt, ArrowDownLeft, CheckCircle2,
    HandCoins, ShoppingBag, Wallet, Banknote, ListChecks
} from 'lucide-react';

interface MonthlyPayrollRow {
    employeeId: string;
    customBaseSalary: number;
    totalHours: number;
    hours: number;
    overtimeHours: number;
    bonus: number;
    latePenaltyDeduction: number;
    latePenaltyAccountId?: string;
    duesSettlementDeduction: number;
    duesSettlementAccountId?: string;
    deductions?: number; // Legacy field for migration
    deductionAccountId?: string; // Legacy field for migration
}

interface AttendanceRecord {
    inTime: string;
    outTime: string;
    note: string;
}

type AttendanceBatchPreviewIssueReason = 'MISSING_PUNCH_AT' | 'INVALID_PUNCH_DATE' | 'EMPLOYEE_NOT_MATCHED';

interface AttendanceBatchPreviewIssue {
    issueKey: string;
    rowIndex: number;
    rowId?: string;
    employeeCode?: string;
    employeeName?: string;
    punchAt?: string;
    punchType?: FingerprintAttendanceEntry['punchType'];
    reason: AttendanceBatchPreviewIssueReason;
}

interface AttendanceBatchResolvedRow {
    rowIndex: number;
    employeeId: string;
    dateKey: string;
    timeValue: string;
    punchType: FingerprintAttendanceEntry['punchType'];
    noteSuffix: string;
    matchSource: 'CODE' | 'NAME' | 'MANUAL';
}

interface AttendanceBatchMatchBreakdown {
    code: number;
    name: number;
    manual: number;
}

interface AttendanceBatchPreviewResult {
    batchId: string;
    totalRows: number;
    matchedRows: number;
    issueRows: number;
    matchBreakdown: AttendanceBatchMatchBreakdown;
    issues: AttendanceBatchPreviewIssue[];
    resolvedRows: AttendanceBatchResolvedRow[];
}

interface StatementRange {
    startDate: string;
    endDate: string;
}

interface PayrollAutoDeductionLine {
    source: 'leave' | 'recurring';
    key: string;
    label: string;
    amount: number;
    accountId?: string;
    leaveId?: string;
    recurringDeductionId?: string;
}

type PayrollRunStatus = 'DRAFT' | 'REVIEWED' | 'POSTED' | 'LOCKED';
type PayrollPaymentBatchStatus = 'DRAFT' | 'POSTED';
type PayrollPeriodPreset = 'CUSTOM' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface PayrollRunPaymentBatchLine {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    amount: number;
    bankName?: string;
    iban?: string;
}

interface PayrollRunPaymentBatch {
    id: string;
    batchNumber: string;
    runId: string;
    status: PayrollPaymentBatchStatus;
    paymentDate: string;
    paymentAccountId?: string;
    createdAt: string;
    postedAt?: string;
    exportedCsvAt?: string;
    exportedExcelAt?: string;
    postedCount?: number;
    lines: PayrollRunPaymentBatchLine[];
}

interface PayrollRunLine {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    gross: number;
    deductions: number;
    net: number;
    rowSnapshot: MonthlyPayrollRow;
}

interface PayrollRunRecord {
    id: string;
    runNumber: string;
    periodStart: string;
    periodEnd: string;
    postingDate: string;
    status: PayrollRunStatus;
    createdAt: string;
    reviewedAt?: string;
    postedAt?: string;
    lockedAt?: string;
    notes?: string;
    employeeIds: string[];
    lines: PayrollRunLine[];
    totals: {
        gross: number;
        deductions: number;
        net: number;
    };
    paymentBatch?: PayrollRunPaymentBatch;
}

const parseLocalizedNumberInput = (value: string): number => {
    const normalized = toEnglishDigits(String(value || ''))
        .replace(/\u066B/g, '.')
        .replace(/[\u066C\u060C,]/g, '')
        .trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeEmployeePayBasis = (emp: Pick<Employee, 'salaryType' | 'payBasis'>): EmployeePayBasis => {
    if (emp.payBasis) return emp.payBasis;
    return emp.salaryType === 'HOURLY' ? 'HOURLY' : 'FIXED_MONTHLY';
};

const legacySalaryTypeFromPayBasis = (basis: EmployeePayBasis): 'FIXED' | 'HOURLY' => (
    basis === 'HOURLY' ? 'HOURLY' : 'FIXED'
);

type EmployeeReportView =
    | 'MENU'
    | 'ATTENDANCE_SUMMARY'
    | 'DAILY_ATTENDANCE'
    | 'PAYROLL_STATEMENTS'
    | 'UNPAID_ACCRUALS'
    | 'ADVANCES_SETTLEMENTS';

const HRManager: React.FC = () => {
    const {
        employees, addEmployee, updateEmployee, deleteEmployee, employeeContracts, addEmployeeContract, updateEmployeeContract, deleteEmployeeContract, salaryHistory,
        employeeLeaveRequests, addEmployeeLeaveRequest, updateEmployeeLeaveRequest, deleteEmployeeLeaveRequest,
        employeeRecurringDeductions, addEmployeeRecurringDeduction, updateEmployeeRecurringDeduction, deleteEmployeeRecurringDeduction,
        departments, addDepartment, deleteDepartment,
        accounts, addTransaction, baseCurrency, transactions, companySettings, currentCompanyId, setTransactions,
        invoices, contacts, addContact, fingerprintAttendanceBatches, updateFingerprintAttendanceBatch
    } = useAccounting();

    const [activeTab, setActiveTab] = useState<'EMPLOYEES' | 'LEAVES' | 'DEDUCTIONS' | 'PAYROLL' | 'ATTENDANCE' | 'REPORTS'>('EMPLOYEES');
    const [searchTerm, setSearchTerm] = useState('');
    const [showEmpForm, setShowEmpForm] = useState(false);
    const [showDeptForm, setShowDeptForm] = useState(false);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
    const tr = (ar: string, en: string) => (isEnglish ? en : ar);
    const displayAccountName = (account?: { id: string; name: string } | null) => getDisplayAccountName(account || undefined, isEnglish);
    const currentFiscalYearRange = useMemo(() => getCurrentFiscalYearRange(), []);
    const employeeStatementContentRef = useRef<HTMLDivElement | null>(null);
    const employeeStatementExportTableRef = useRef<HTMLTableElement | null>(null);
    const getPayBasisLabel = (basis: EmployeePayBasis) => {
        switch (basis) {
            case 'DAILY': return tr('أجر يومي', 'Daily Wage');
            case 'WEEKLY': return tr('أجر أسبوعي', 'Weekly Wage');
            case 'MONTHLY_PRORATED': return tr('أجر شهري (نسبي)', 'Monthly (Prorated)');
            case 'MONTHLY_BY_HOURS': return tr('راتب شهري حسب ساعات العمل', 'Monthly Salary by Worked Hours');
            case 'HOURLY': return tr('أجر بالساعة', 'Hourly Wage');
            case 'COMMISSION': return tr('راتب ثابت + نسبة من العمل', 'Fixed Salary + Commission');
            default: return tr('راتب شهري ثابت', 'Fixed Monthly Salary');
        }
    };
    const getPayBasisInputLabel = (basis: EmployeePayBasis) => {
        switch (basis) {
            case 'DAILY': return tr('أجر اليوم', 'Daily Rate');
            case 'WEEKLY': return tr('أجر الأسبوع', 'Weekly Rate');
            case 'MONTHLY_PRORATED': return tr('الأجر الشهري (أساس النسبة)', 'Monthly Salary (Prorated Base)');
            case 'MONTHLY_BY_HOURS': return tr('الراتب الشهري (أساس الساعات)', 'Monthly Salary (Hours-based Base)');
            case 'HOURLY': return tr('معدل الأجر (ساعة)', 'Hourly Rate');
            case 'COMMISSION': return tr('نسبة العمولة %', 'Commission Rate %');
            default: return tr('الراتب الأساسي (شهري ثابت)', 'Base Salary (Fixed Monthly)');
        }
    };
    const getEmployeePayBasis = (emp: Pick<Employee, 'salaryType' | 'payBasis'>): EmployeePayBasis => normalizeEmployeePayBasis(emp);
    const getPayrollCustomBaseDefault = (emp: Pick<Employee, 'salaryType' | 'payBasis' | 'basicSalary'>): number => {
        const basis = getEmployeePayBasis(emp);
        if (basis === 'COMMISSION') return 0;
        return Number(emp.basicSalary) || 0;
    };
    const formatEmployeeCompensationSummary = (emp: Employee) => {
        const basis = getEmployeePayBasis(emp);
        switch (basis) {
            case 'DAILY':
                return `${Number(emp.dailyRate || 0).toLocaleString()} / ${tr('يوم', 'day')}`;
            case 'WEEKLY':
                return `${Number(emp.weeklyRate || 0).toLocaleString()} / ${tr('أسبوع', 'week')}`;
            case 'MONTHLY_PRORATED':
                return `${Number(emp.basicSalary || 0).toLocaleString()} ${tr('شهري نسبي', 'Monthly prorated')}`;
            case 'MONTHLY_BY_HOURS':
                return `${Number(emp.basicSalary || 0).toLocaleString()} ${tr('شهري حسب الساعات', 'Monthly by hours')}`;
            case 'HOURLY':
                return `${Number(emp.hourlyRate || 0).toLocaleString()} / ${tr('ساعة', 'hour')}`;
            case 'COMMISSION':
                return `${Number(emp.basicSalary || 0).toLocaleString()} + ${Number(emp.commissionRatePercent || 0).toLocaleString()}% ${tr('من العمل', 'of work')}`;
            default:
                return `${Number(emp.basicSalary || 0).toLocaleString()} ${baseCurrency}`;
        }
    };
    const getCompanyDefaultLeaveEntitlementDays = (type: 'FIXED_TERM' | 'OPEN_ENDED' = 'OPEN_ENDED') => {
        const raw = type === 'FIXED_TERM'
            ? companySettings.annualLeaveDefaultFixedTermDays
            : companySettings.annualLeaveDefaultOpenEndedDays;
        const fallback = type === 'FIXED_TERM' ? 14 : 21;
        return Math.max(0, Number(raw) || fallback);
    };
    const getCompanyLeaveAccrualPolicy = () => companySettings.leaveAccrualPolicy === 'MONTHLY' ? 'MONTHLY' as const : 'ANNUAL' as const;
    const getCompanyMonthlyLeaveAccrualDays = () => Math.max(0, Number(companySettings.monthlyLeaveAccrualDays) || 1.75);

    // Employee Form State
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [deptId, setDeptId] = useState('');
    const [position, setPosition] = useState('');
    const [employeePhone, setEmployeePhone] = useState('');
    const [employeeBankName, setEmployeeBankName] = useState('');
    const [employeeIban, setEmployeeIban] = useState('');
    const [employeeInitialContractType, setEmployeeInitialContractType] = useState<'FIXED_TERM' | 'OPEN_ENDED'>('OPEN_ENDED');
    const [employeePayBasis, setEmployeePayBasis] = useState<EmployeePayBasis>('FIXED_MONTHLY');
    const [salaryType, setSalaryType] = useState<'FIXED' | 'HOURLY'>('FIXED');
    const [basicSalary, setBasicSalary] = useState('');
    const [dailyHours, setDailyHours] = useState('8');
    const [housing, setHousing] = useState('');
    const [transport, setTransport] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [dailyRate, setDailyRate] = useState('');
    const [weeklyRate, setWeeklyRate] = useState('');
    const [commissionRatePercent, setCommissionRatePercent] = useState('');
    const [overtimeHourlyRate, setOvertimeHourlyRate] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [contractsEmployeeId, setContractsEmployeeId] = useState<string | null>(null);
    const [showContractForm, setShowContractForm] = useState(false);
    const [editingContractId, setEditingContractId] = useState<string | null>(null);
    const [contractType, setContractType] = useState<'FIXED_TERM' | 'OPEN_ENDED'>('OPEN_ENDED');
    const [contractStartDate, setContractStartDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [contractEndDate, setContractEndDate] = useState('');
    const [contractTitle, setContractTitle] = useState('');
    const [contractNotes, setContractNotes] = useState('');
    const [contractPayBasis, setContractPayBasis] = useState<EmployeePayBasis>('FIXED_MONTHLY');
    const [contractSalaryType, setContractSalaryType] = useState<'FIXED' | 'HOURLY'>('FIXED');
    const [contractBasicSalary, setContractBasicSalary] = useState('');
    const [contractDailyHours, setContractDailyHours] = useState('8');
    const [contractHourlyRate, setContractHourlyRate] = useState('');
    const [contractDailyRate, setContractDailyRate] = useState('');
    const [contractWeeklyRate, setContractWeeklyRate] = useState('');
    const [contractCommissionRatePercent, setContractCommissionRatePercent] = useState('');
    const [contractOvertimeHourlyRate, setContractOvertimeHourlyRate] = useState('');
    const [contractHousingAllowance, setContractHousingAllowance] = useState('');
    const [contractTransportAllowance, setContractTransportAllowance] = useState('');
    const [contractOtherAllowances, setContractOtherAllowances] = useState('');
    const [contractAnnualLeaveEntitlementDays, setContractAnnualLeaveEntitlementDays] = useState(() => String(getCompanyDefaultLeaveEntitlementDays('OPEN_ENDED')));
    const [applyContractToEmployeeProfile, setApplyContractToEmployeeProfile] = useState(true);
    const [viewStatementId, setViewStatementId] = useState<string | null>(null);
    const [statementRanges, setStatementRanges] = useState<Record<string, StatementRange>>({});
    const [statementPayrollSummaryVisibility, setStatementPayrollSummaryVisibility] = useState<Record<string, boolean>>({});
    const [employeePayrollRanges, setEmployeePayrollRanges] = useState<Record<string, StatementRange>>({});
    const [payrollFocusEmployeeId, setPayrollFocusEmployeeId] = useState('');



    // Payroll Dates & Setup
    const [payrollStartDate, setPayrollStartDate] = useState(() => {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
    });
    const [payrollEndDate, setPayrollEndDate] = useState(() => {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
    });
    const [payrollPeriodPreset, setPayrollPeriodPreset] = useState<PayrollPeriodPreset>('MONTHLY');
    const [payrollPayBasisFilter, setPayrollPayBasisFilter] = useState<'ALL' | EmployeePayBasis>('ALL');
    const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0]);
    const [monthlyWorkingDays, setMonthlyWorkingDays] = useState(30);
    const [paymentAccountId, setPaymentAccountId] = useState('');
    const [expenseAccountId, setExpenseAccountId] = useState(''); // State for expense account
    const [payrollRows, setPayrollRows] = useState<Record<string, MonthlyPayrollRow>>({});
    const [payrollRuns, setPayrollRuns] = useState<PayrollRunRecord[]>([]);
    const [selectedPayrollRunId, setSelectedPayrollRunId] = useState<string | null>(null);
    const [editingPayrollRunId, setEditingPayrollRunId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Attendance State
    const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
    const [attendanceLog, setAttendanceLog] = useState<Record<string, Record<string, AttendanceRecord>>>({});
    const [attendanceBatchToApplyId, setAttendanceBatchToApplyId] = useState('');
    const [attendanceBatchApplyMsg, setAttendanceBatchApplyMsg] = useState('');
    const [attendanceBatchPreview, setAttendanceBatchPreview] = useState<AttendanceBatchPreviewResult | null>(null);
    const [attendanceBatchManualAssignments, setAttendanceBatchManualAssignments] = useState<Record<string, string>>({});
    const [reportStartDate, setReportStartDate] = useState(() => {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
    });
    const [reportEndDate, setReportEndDate] = useState(() => {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
    });
    const [reportEmployeeId, setReportEmployeeId] = useState('');
    const [activeEmployeeReport, setActiveEmployeeReport] = useState<EmployeeReportView>('MENU');
    const [leaveEmployeeId, setLeaveEmployeeId] = useState('');
    const [leaveType, setLeaveType] = useState<'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER'>('ANNUAL');
    const [leaveStatusFilter, setLeaveStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('ALL');
    const [leaveStartDate, setLeaveStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [leaveEndDate, setLeaveEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [leaveNote, setLeaveNote] = useState('');
    const [leaveDeductFromPayroll, setLeaveDeductFromPayroll] = useState(false);
    const [leaveDeductionAccountId, setLeaveDeductionAccountId] = useState('');
    const [leaveEntitlementDrafts, setLeaveEntitlementDrafts] = useState<Record<string, string>>({});
    const [leaveEntitlementSavingId, setLeaveEntitlementSavingId] = useState<string | null>(null);
    const [recurringEmployeeId, setRecurringEmployeeId] = useState('');
    const [recurringType, setRecurringType] = useState<'ADVANCE' | 'LOAN' | 'INSURANCE' | 'SUBSCRIPTION' | 'OTHER'>('ADVANCE');
    const [recurringStatusFilter, setRecurringStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'>('ALL');
    const [recurringLabel, setRecurringLabel] = useState('');
    const [recurringAmount, setRecurringAmount] = useState('');
    const [recurringAccountId, setRecurringAccountId] = useState('');
    const [recurringStartDate, setRecurringStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [recurringEndDate, setRecurringEndDate] = useState('');
    const [recurringInstallments, setRecurringInstallments] = useState('');
    const [recurringNotes, setRecurringNotes] = useState('');

    const populateContractForm = (emp: Employee, contract?: EmployeeContract | null) => {
        const contractSource = contract || null;
        setContractType(contractSource?.contractType || 'OPEN_ENDED');
        setContractStartDate(contractSource?.startDate || emp.hireDate || new Date().toISOString().slice(0, 10));
        setContractEndDate(contractSource?.endDate || '');
        setContractTitle(contractSource?.title || emp.position || '');
        setContractNotes(contractSource?.notes || '');
        setContractPayBasis(contractSource?.payBasis || getEmployeePayBasis(emp));
        setContractSalaryType(contractSource?.salaryType || emp.salaryType || 'FIXED');
        setContractBasicSalary(String(contractSource?.basicSalary ?? emp.basicSalary ?? 0));
        setContractDailyHours(String(contractSource?.dailyWorkHours ?? emp.dailyWorkHours ?? 8));
        setContractHourlyRate(String(contractSource?.hourlyRate ?? emp.hourlyRate ?? 0));
        setContractDailyRate(String(contractSource?.dailyRate ?? (emp as any).dailyRate ?? 0));
        setContractWeeklyRate(String(contractSource?.weeklyRate ?? (emp as any).weeklyRate ?? 0));
        setContractCommissionRatePercent(String(contractSource?.commissionRatePercent ?? (emp as any).commissionRatePercent ?? 0));
        setContractOvertimeHourlyRate(String(contractSource?.overtimeHourlyRate ?? emp.overtimeHourlyRate ?? 0));
        setContractHousingAllowance(String(contractSource?.housingAllowance ?? emp.housingAllowance ?? 0));
        setContractTransportAllowance(String(contractSource?.transportAllowance ?? emp.transportAllowance ?? 0));
        setContractOtherAllowances(String(contractSource?.otherAllowances ?? emp.otherAllowances ?? 0));
        setContractAnnualLeaveEntitlementDays(String(
            contractSource?.annualLeaveEntitlementDays
            ?? emp.annualLeaveEntitlementDays
            ?? getCompanyDefaultLeaveEntitlementDays(contractSource?.contractType || 'OPEN_ENDED')
        ));
        setApplyContractToEmployeeProfile(contractSource?.status !== 'CLOSED');
    };

    const openContractsManager = (emp: Employee) => {
        setContractsEmployeeId(emp.id);
        setShowContractForm(false);
        setEditingContractId(null);
        populateContractForm(emp);
    };

    const startAddContract = () => {
        if (!contractsEmployee) return;
        setEditingContractId(null);
        populateContractForm(contractsEmployee);
        setShowContractForm(true);
    };

    const handleEditEmployeeContract = (contract: EmployeeContract) => {
        if (!contractsEmployee) return;
        setEditingContractId(contract.id);
        populateContractForm(contractsEmployee, contract);
        setShowContractForm(true);
    };

    const closeContractsManager = () => {
        setContractsEmployeeId(null);
        setShowContractForm(false);
        setEditingContractId(null);
    };

    const handleContractTypeChange = (nextType: 'FIXED_TERM' | 'OPEN_ENDED') => {
        setContractType(nextType);
        if (nextType !== 'FIXED_TERM') {
            setContractEndDate('');
        }
        setContractAnnualLeaveEntitlementDays(String(getCompanyDefaultLeaveEntitlementDays(nextType)));
    };

    const handleEmployeeInitialContractTypeChange = (nextType: 'FIXED_TERM' | 'OPEN_ENDED') => {
        setEmployeeInitialContractType(nextType);
    };

    const handleEmployeePayBasisChange = (nextBasis: EmployeePayBasis) => {
        setEmployeePayBasis(nextBasis);
        setSalaryType(legacySalaryTypeFromPayBasis(nextBasis));
    };

    const handleContractPayBasisChange = (nextBasis: EmployeePayBasis) => {
        setContractPayBasis(nextBasis);
        setContractSalaryType(legacySalaryTypeFromPayBasis(nextBasis));
    };

    const applyPayrollPeriodPreset = (preset: PayrollPeriodPreset) => {
        setPayrollPeriodPreset(preset);
        const now = new Date();
        const todayIso = now.toISOString().slice(0, 10);
        if (preset === 'CUSTOM') return;
        if (preset === 'DAILY') {
            setPayrollStartDate(todayIso);
            setPayrollEndDate(todayIso);
            setPostingDate(todayIso);
            return;
        }
        if (preset === 'WEEKLY') {
            const day = now.getDay(); // 0=Sun
            const offsetToMonday = (day + 6) % 7;
            const monday = new Date(now);
            monday.setDate(now.getDate() - offsetToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            setPayrollStartDate(monday.toISOString().slice(0, 10));
            setPayrollEndDate(sunday.toISOString().slice(0, 10));
            setPostingDate(sunday.toISOString().slice(0, 10));
            return;
        }
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setPayrollStartDate(monthStart.toISOString().slice(0, 10));
        setPayrollEndDate(monthEnd.toISOString().slice(0, 10));
        setPostingDate(monthEnd.toISOString().slice(0, 10));
    };

    const payrollRunStorageKey = `al_mohaseb_hr_payroll_runs_${currentCompanyId || 'default'}`;
    const attendanceStorageKey = `al_mohaseb_hr_attendance_log_${currentCompanyId || 'default'}`;

    useEffect(() => {
        try {
            const raw = localStorage.getItem(payrollRunStorageKey);
            if (!raw) {
                setPayrollRuns([]);
                setSelectedPayrollRunId(null);
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setPayrollRuns(parsed as PayrollRunRecord[]);
                setSelectedPayrollRunId(prev => (parsed.some((r: PayrollRunRecord) => r.id === prev) ? prev : null));
            } else {
                setPayrollRuns([]);
                setSelectedPayrollRunId(null);
            }
        } catch {
            setPayrollRuns([]);
            setSelectedPayrollRunId(null);
        }
    }, [payrollRunStorageKey]);

    useEffect(() => {
        try {
            localStorage.setItem(payrollRunStorageKey, JSON.stringify(payrollRuns));
        } catch {
            // Ignore local storage quota errors in UI layer
        }
    }, [payrollRunStorageKey, payrollRuns]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(attendanceStorageKey);
            if (!raw) {
                setAttendanceLog({});
                return;
            }
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                setAttendanceLog(parsed as Record<string, Record<string, AttendanceRecord>>);
            } else {
                setAttendanceLog({});
            }
        } catch {
            setAttendanceLog({});
        }
    }, [attendanceStorageKey]);

    useEffect(() => {
        try {
            localStorage.setItem(attendanceStorageKey, JSON.stringify(attendanceLog));
        } catch {
            // Ignore local storage quota errors in UI layer
        }
    }, [attendanceStorageKey, attendanceLog]);

    const contractsEmployee = useMemo(
        () => employees.find(e => e.id === contractsEmployeeId) || null,
        [employees, contractsEmployeeId]
    );
    const employeeContractsList = useMemo(
        () => employeeContracts
            .filter(c => c.employeeId === contractsEmployeeId)
            .slice()
            .sort((a, b) => b.startDate.localeCompare(a.startDate)),
        [employeeContracts, contractsEmployeeId]
    );
    const employeeSalaryHistoryList = useMemo(
        () => salaryHistory
            .filter(h => h.employeeId === contractsEmployeeId)
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date)),
        [salaryHistory, contractsEmployeeId]
    );

    // Set Default Expense Account (521)
    useEffect(() => {
        if (!expenseAccountId) {
            const defaultExp = accounts.find(a => a.code === '521');
            if (defaultExp) setExpenseAccountId(defaultExp.id);
        }
    }, [accounts]);

    useEffect(() => {
        if (!leaveDeductionAccountId) {
            const fallback = getDefaultPayrollPenaltyAccountId();
            if (fallback) setLeaveDeductionAccountId(fallback);
        }
        if (!recurringAccountId) {
            const fallback = getDefaultPayrollSettlementAccountId();
            if (fallback) setRecurringAccountId(fallback);
        }
    }, [accounts]);

    // Auto-sync employees as contacts (so they appear in sales invoices)
    useEffect(() => {
        const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
        employees.forEach(emp => {
            const employeeName = normalizeName(emp.name || '');
            const exists = contacts.some(c => c.type === 'EMPLOYEE' && normalizeName(c.name || '') === employeeName);
            if (!exists) {
                addContact({ name: emp.name, type: 'EMPLOYEE' as const, phone: emp.phone });
            }
        });
    }, [employees, contacts]);

    // Auto-calculate Hourly Rates
    useEffect(() => {
        const basic = parseFloat(basicSalary) || 0;
        const hours = parseFloat(dailyHours) || 8;
        if (basic > 0 && hours > 0 && (!editingId || hourlyRate === '' || hourlyRate === '0')) {
            const hourly = (basic / 30) / hours;
            setHourlyRate(hourly.toFixed(2));
            setOvertimeHourlyRate((hourly * 1.5).toFixed(2));
        }
    }, [basicSalary, dailyHours, editingId]);

    const getDefaultPayrollPenaltyAccountId = () => {
        const defaultPayrollPenaltyAccount = accounts.find(a => a.id === 'acc_payroll_deductions_payable' && !a.isGroup)
            || accounts.find(a => a.code === '214' && !a.isGroup)
            || accounts.find(a => a.id === 'acc_exp_salaries' && !a.isGroup)
            || accounts.find(a => a.code === '521' && !a.isGroup)
            || accounts.find(a => !a.isGroup && a.type === 'LIABILITY')
            || accounts.find(a => !a.isGroup && a.type === 'EXPENSE');
        return defaultPayrollPenaltyAccount?.id || '';
    };
    const getDefaultPayrollSettlementAccountId = () => {
        const defaultPayrollDeductionAccount = accounts.find(a => a.id === 'acc_employee_advances' && !a.isGroup)
            || accounts.find(a => a.code === '117' && !a.isGroup)
            || accounts.find(a => a.id === 'acc_receivable' && !a.isGroup)
            || accounts.find(a => a.id === 'acc_payable' && !a.isGroup)
            || accounts.find(a => !a.isGroup && a.id !== 'acc_accrued_salaries');
        return defaultPayrollDeductionAccount?.id || '';
    };

    // Initialize rows
    useEffect(() => {
        setPayrollRows(prev => {
            const next = { ...prev };
            const defaultPenaltyAccountId = getDefaultPayrollPenaltyAccountId();
            const defaultSettlementAccountId = getDefaultPayrollSettlementAccountId();
            employees.forEach(emp => {
                if (!next[emp.id]) {
                    next[emp.id] = {
                        employeeId: emp.id,
                        customBaseSalary: getPayrollCustomBaseDefault(emp),
                        totalHours: 0, hours: 0, overtimeHours: 0, bonus: 0,
                        latePenaltyDeduction: 0,
                        latePenaltyAccountId: defaultPenaltyAccountId,
                        duesSettlementDeduction: 0,
                        duesSettlementAccountId: defaultSettlementAccountId
                    };
                } else {
                    const legacyDeductions = next[emp.id].deductions || 0;
                    const legacyAccountId = next[emp.id].deductionAccountId || defaultSettlementAccountId;
                    const currentPenaltyAccountId = next[emp.id].latePenaltyAccountId;
                    const isCurrentPenaltyLegacyReceivable = !!currentPenaltyAccountId && (() => {
                        const account = accounts.find(a => a.id === currentPenaltyAccountId);
                        return !!account && (account.id === 'acc_receivable' || account.parentId === 'acc_receivable_group');
                    })();
                    next[emp.id] = {
                        ...next[emp.id],
                        customBaseSalary: Number.isFinite(Number(next[emp.id].customBaseSalary))
                            ? Math.max(0, Number(next[emp.id].customBaseSalary))
                            : getPayrollCustomBaseDefault(emp),
                        latePenaltyDeduction: next[emp.id].latePenaltyDeduction ?? 0,
                        latePenaltyAccountId: !currentPenaltyAccountId || isCurrentPenaltyLegacyReceivable ? defaultPenaltyAccountId : currentPenaltyAccountId,
                        duesSettlementDeduction: next[emp.id].duesSettlementDeduction ?? legacyDeductions,
                        duesSettlementAccountId: next[emp.id].duesSettlementAccountId || legacyAccountId
                    };
                }
            });
            return next;
        });
    }, [employees, accounts]);

    const normalizeRange = (range: StatementRange): StatementRange => {
        if (!range.startDate || !range.endDate) return { startDate: payrollStartDate, endDate: payrollEndDate };
        return range.startDate <= range.endDate
            ? range
            : { startDate: range.endDate, endDate: range.startDate };
    };

    const getEmployeePayrollRange = (employeeId: string): StatementRange => {
        const employeeRange = employeePayrollRanges[employeeId] || { startDate: payrollStartDate, endDate: payrollEndDate };
        return normalizeRange(employeeRange);
    };

    const updateEmployeePayrollRange = (employeeId: string, patch: Partial<StatementRange>) => {
        setEmployeePayrollRanges(prev => {
            const current = prev[employeeId] || { startDate: payrollStartDate, endDate: payrollEndDate };
            return {
                ...prev,
                [employeeId]: { ...current, ...patch }
            };
        });
    };

    const calculateDailyHours = (inT: string, outT: string): number => {
        if (!inT || !outT) return 0;
        const start = new Date(`2000-01-01T${inT}`);
        const end = new Date(`2000-01-01T${outT}`);
        let diff = (end.getTime() - start.getTime()) / 3600000;
        if (diff < 0) diff += 24;
        return parseFloat(diff.toFixed(2));
    };

    const updateAttendanceByDate = (date: string, empId: string, field: keyof AttendanceRecord, value: string) => {
        setAttendanceLog(prev => ({
            ...prev,
            [date]: {
                ...(prev[date] || {}),
                [empId]: { ...(prev[date]?.[empId] || { inTime: '', outTime: '', note: '' }), [field]: value }
            }
        }));
    };

    const updateAttendance = (empId: string, field: keyof AttendanceRecord, value: string) => {
        updateAttendanceByDate(attendanceDate, empId, field, value);
    };

    const normalizePersonName = (value: string) =>
        String(value || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();

    const getAttendanceIssueKey = (row: FingerprintAttendanceEntry | undefined, index: number) =>
        row?.id ? `row-${row.id}` : `idx-${index + 1}`;

    const stagedFingerprintBatches = useMemo(
        () => fingerprintAttendanceBatches
            .slice()
            .sort((a, b) => `${b.importedAt}`.localeCompare(`${a.importedAt}`)),
        [fingerprintAttendanceBatches]
    );

    const getBatchDisplayName = (batch: FingerprintAttendanceBatch) => {
        const importedAt = new Date(batch.importedAt).toLocaleString('en-GB');
        const sourceLabel = batch.source === 'DIRECT_SYNC'
            ? tr('مزامنة مباشرة', 'Direct Sync')
            : tr('رفع يدوي', 'Manual Upload');
        const stateLabel = batch.status === 'APPLIED'
            ? tr('مطبقة', 'Applied')
            : tr('معلقة', 'Staged');
        return `${sourceLabel} • ${batch.fileName || batch.id} • ${batch.rows.length} ${tr('سجل', 'rows')} • ${stateLabel} • ${importedAt}`;
    };

    const getAttendanceBatchIssueReasonLabel = (reason: AttendanceBatchPreviewIssueReason) => {
        switch (reason) {
            case 'MISSING_PUNCH_AT':
                return tr('السجل بدون وقت بصمة', 'Missing punch timestamp');
            case 'INVALID_PUNCH_DATE':
                return tr('تاريخ/وقت بصمة غير صالح', 'Invalid punch date/time');
            default:
                return tr('تعذر مطابقة الموظف', 'Employee not matched');
        }
    };

    const buildFingerprintAttendanceBatchPreview = (
        batchId: string,
        manualAssignments: Record<string, string> = attendanceBatchManualAssignments
    ): AttendanceBatchPreviewResult | null => {
        const batch = fingerprintAttendanceBatches.find(b => b.id === batchId);
        if (!batch) {
            alert(tr('تعذر العثور على دفعة البصمة.', 'Fingerprint batch not found.'));
            return null;
        }
        if (!batch.rows?.length) {
            alert(tr('الدفعة لا تحتوي سجلات حضور.', 'Batch has no attendance rows.'));
            return null;
        }

        const employeesByCode = new Map<string, Employee>(
            employees.map(emp => [toEnglishDigits(String(emp.code || '')).trim().toLowerCase(), emp] as [string, Employee])
        );
        const employeesByName = new Map<string, Employee>(
            employees.map(emp => [normalizePersonName(emp.name || ''), emp] as [string, Employee])
        );
        const employeesById = new Map<string, Employee>(
            employees.map(emp => [emp.id, emp] as [string, Employee])
        );

        const issues: AttendanceBatchPreviewIssue[] = [];
        const resolvedRows: AttendanceBatchResolvedRow[] = [];
        const matchBreakdown: AttendanceBatchMatchBreakdown = { code: 0, name: 0, manual: 0 };
        const noteSuffix = batch.fileName || (batch.source === 'DIRECT_SYNC' ? tr('مزامنة بصمة', 'Fingerprint sync') : tr('رفع بصمة يدوي', 'Manual fingerprint upload'));

        batch.rows.forEach((row, index) => {
            const issueKey = getAttendanceIssueKey(row, index);
            if (!row?.punchAt) {
                issues.push({
                    issueKey,
                    rowIndex: index + 1,
                    rowId: row?.id,
                    employeeCode: row?.employeeCode,
                    employeeName: row?.employeeName,
                    punchAt: row?.punchAt,
                    punchType: row?.punchType,
                    reason: 'MISSING_PUNCH_AT'
                });
                return;
            }
            const dt = new Date(row.punchAt);
            if (Number.isNaN(dt.getTime())) {
                issues.push({
                    issueKey,
                    rowIndex: index + 1,
                    rowId: row.id,
                    employeeCode: row.employeeCode,
                    employeeName: row.employeeName,
                    punchAt: row.punchAt,
                    punchType: row.punchType,
                    reason: 'INVALID_PUNCH_DATE'
                });
                return;
            }

            const codeKey = toEnglishDigits(String(row.employeeCode || '')).trim().toLowerCase();
            const nameKey = normalizePersonName(String(row.employeeName || ''));
            const manuallyAssignedEmployeeId = manualAssignments[issueKey];
            let employee: Employee | undefined;
            let matchSource: AttendanceBatchResolvedRow['matchSource'] | null = null;
            if (codeKey && employeesByCode.get(codeKey)) {
                employee = employeesByCode.get(codeKey);
                matchSource = 'CODE';
            } else if (nameKey && employeesByName.get(nameKey)) {
                employee = employeesByName.get(nameKey);
                matchSource = 'NAME';
            } else if (manuallyAssignedEmployeeId && employeesById.get(manuallyAssignedEmployeeId)) {
                employee = employeesById.get(manuallyAssignedEmployeeId);
                matchSource = 'MANUAL';
            }
            if (!employee) {
                issues.push({
                    issueKey,
                    rowIndex: index + 1,
                    rowId: row.id,
                    employeeCode: row.employeeCode,
                    employeeName: row.employeeName,
                    punchAt: row.punchAt,
                    punchType: row.punchType,
                    reason: 'EMPLOYEE_NOT_MATCHED'
                });
                return;
            }

            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const d = String(dt.getDate()).padStart(2, '0');
            const dateKey = `${y}-${m}-${d}`;
            const timeValue = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

            resolvedRows.push({
                rowIndex: index + 1,
                employeeId: employee.id,
                dateKey,
                timeValue,
                punchType: row.punchType,
                noteSuffix,
                matchSource: matchSource || 'MANUAL'
            });
            if (matchSource === 'CODE') matchBreakdown.code += 1;
            else if (matchSource === 'NAME') matchBreakdown.name += 1;
            else if (matchSource === 'MANUAL') matchBreakdown.manual += 1;
        });

        return {
            batchId: batch.id,
            totalRows: batch.rows.length,
            matchedRows: resolvedRows.length,
            issueRows: issues.length,
            matchBreakdown,
            issues,
            resolvedRows
        };
    };

    const getAttendancePreviewSummaryMessage = (preview: AttendanceBatchPreviewResult) => tr(
        `المعاينة: مطابق ${preview.matchedRows}، غير مطابق/متجاوز ${preview.issueRows} من أصل ${preview.totalRows} (بالكود ${preview.matchBreakdown.code} / بالاسم ${preview.matchBreakdown.name} / يدوي ${preview.matchBreakdown.manual})`,
        `Preview: matched ${preview.matchedRows}, unmatched/skipped ${preview.issueRows} of ${preview.totalRows} (by code ${preview.matchBreakdown.code} / by name ${preview.matchBreakdown.name} / manual ${preview.matchBreakdown.manual})`
    );

    const previewFingerprintAttendanceBatch = (batchId: string) => {
        const preview = buildFingerprintAttendanceBatchPreview(batchId);
        if (!preview) return;
        setAttendanceBatchPreview(preview);
        setAttendanceBatchApplyMsg(getAttendancePreviewSummaryMessage(preview));
    };

    const setManualAttendanceIssueAssignment = (issueKey: string, employeeId: string) => {
        const nextAssignments = { ...attendanceBatchManualAssignments };
        const trimmedId = String(employeeId || '').trim();
        if (trimmedId) nextAssignments[issueKey] = trimmedId;
        else delete nextAssignments[issueKey];
        setAttendanceBatchManualAssignments(nextAssignments);
        if (!attendanceBatchToApplyId) return;
        const nextPreview = buildFingerprintAttendanceBatchPreview(attendanceBatchToApplyId, nextAssignments);
        if (!nextPreview) return;
        setAttendanceBatchPreview(nextPreview);
        setAttendanceBatchApplyMsg(getAttendancePreviewSummaryMessage(nextPreview));
    };

    const exportAttendanceBatchPreviewIssuesCsv = () => {
        if (!attendanceBatchPreview?.issues?.length) return;
        const headers = ['rowIndex', 'employeeCode', 'employeeName', 'punchAt', 'punchType', 'reason'];
        const lines = [
            headers.join(','),
            ...attendanceBatchPreview.issues.map(issue => [
                issue.rowIndex,
                JSON.stringify(issue.employeeCode || ''),
                JSON.stringify(issue.employeeName || ''),
                JSON.stringify(issue.punchAt || ''),
                JSON.stringify(issue.punchType || ''),
                JSON.stringify(getAttendanceBatchIssueReasonLabel(issue.reason))
            ].join(','))
        ];
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-batch-match-errors-${attendanceBatchPreview.batchId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const printAttendanceBatchIssuesReport = () => {
        if (!attendanceBatchPreview?.issues?.length) {
            alert(tr('لا يوجد أخطاء مطابقة للطباعة.', 'No match errors to print.'));
            return;
        }
        const escapeHtml = (value: unknown) =>
            String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        const now = new Date().toLocaleString('en-GB');
        const rowsHtml = attendanceBatchPreview.issues.map(issue => `
            <tr>
                <td>${escapeHtml(issue.rowIndex)}</td>
                <td>${escapeHtml(issue.employeeCode || '-')}</td>
                <td>${escapeHtml(issue.employeeName || '-')}</td>
                <td>${escapeHtml(issue.punchAt || '-')}</td>
                <td>${escapeHtml(issue.punchType || '-')}</td>
                <td>${escapeHtml(getAttendanceBatchIssueReasonLabel(issue.reason))}</td>
            </tr>
        `).join('');
        const html = `
            <!doctype html>
            <html lang="${isEnglish ? 'en' : 'ar'}" dir="${isEnglish ? 'ltr' : 'rtl'}">
            <head>
                <meta charset="utf-8" />
                <title>${escapeHtml(tr('تقرير أخطاء الدوام', 'Attendance Errors Report'))}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
                    h1 { margin: 0 0 6px; font-size: 20px; }
                    .meta { font-size: 12px; color: #6b7280; margin-bottom: 12px; }
                    .summary { margin: 12px 0; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px; display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 8px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: ${isEnglish ? 'left' : 'right'}; }
                    th { background: #f9fafb; }
                </style>
            </head>
            <body>
                <h1>${escapeHtml(tr('تقرير أخطاء الدوام', 'Attendance Errors Report'))}</h1>
                <div class="meta">${escapeHtml(tr('تاريخ التقرير', 'Generated at'))}: ${escapeHtml(now)} • Batch: ${escapeHtml(attendanceBatchPreview.batchId)}</div>
                <div class="summary">
                    <div>${escapeHtml(tr('إجمالي السجلات', 'Total Rows'))}: <b>${escapeHtml(attendanceBatchPreview.totalRows.toLocaleString('en-US'))}</b></div>
                    <div>${escapeHtml(tr('مطابق', 'Matched'))}: <b>${escapeHtml(attendanceBatchPreview.matchedRows.toLocaleString('en-US'))}</b></div>
                    <div>${escapeHtml(tr('غير مطابق/متجاوز', 'Unmatched/Skipped'))}: <b>${escapeHtml(attendanceBatchPreview.issueRows.toLocaleString('en-US'))}</b></div>
                    <div>${escapeHtml(tr('نسبة المطابقة', 'Match Rate'))}: <b>${escapeHtml(attendanceBatchPreview.totalRows > 0 ? ((attendanceBatchPreview.matchedRows / attendanceBatchPreview.totalRows) * 100).toFixed(1) : '0.0')}%</b></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>${escapeHtml(tr('كود الموظف', 'Employee Code'))}</th>
                            <th>${escapeHtml(tr('اسم الموظف', 'Employee Name'))}</th>
                            <th>${escapeHtml(tr('وقت البصمة', 'Punch Time'))}</th>
                            <th>${escapeHtml(tr('النوع', 'Type'))}</th>
                            <th>${escapeHtml(tr('سبب الخطأ', 'Error Reason'))}</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <script>window.print();</script>
            </body>
            </html>
        `;
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (!printWindow) return;
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const applyFingerprintAttendanceBatchToLog = (batchId: string, mode: 'STRICT' | 'PARTIAL' = 'PARTIAL') => {
        const batch = fingerprintAttendanceBatches.find(b => b.id === batchId);
        const preview = buildFingerprintAttendanceBatchPreview(batchId, attendanceBatchManualAssignments);
        if (!batch || !preview) return;

        if (mode === 'STRICT' && preview.issueRows > 0) {
            const msg = tr(
                `لا يمكن التطبيق الكامل قبل معالجة الأخطاء. يوجد ${preview.issueRows} سجل غير مطابق/متجاوز.`,
                `Cannot fully apply before fixing errors. There are ${preview.issueRows} unmatched/skipped rows.`
            );
            setAttendanceBatchApplyMsg(msg);
            alert(msg);
            setAttendanceBatchPreview(preview);
            return;
        }

        let appliedRows = 0;
        setAttendanceLog(prev => {
            const next = { ...prev };
            preview.resolvedRows.forEach((resolved) => {
                const current = next[resolved.dateKey]?.[resolved.employeeId] || { inTime: '', outTime: '', note: '' };
                const merged: AttendanceRecord = { ...current };

                if (resolved.punchType === 'IN') {
                    if (!merged.inTime || resolved.timeValue < merged.inTime) merged.inTime = resolved.timeValue;
                } else if (resolved.punchType === 'OUT') {
                    if (!merged.outTime || resolved.timeValue > merged.outTime) merged.outTime = resolved.timeValue;
                } else {
                    if (!merged.inTime) merged.inTime = resolved.timeValue;
                    else if (!merged.outTime || resolved.timeValue > merged.outTime) merged.outTime = resolved.timeValue;
                }

                if (!merged.note?.includes(resolved.noteSuffix)) {
                    merged.note = [merged.note, resolved.noteSuffix].filter(Boolean).join(' | ');
                }

                next[resolved.dateKey] = {
                    ...(next[resolved.dateKey] || {}),
                    [resolved.employeeId]: merged
                };
                appliedRows++;
            });
            return next;
        });

        const updateResult = updateFingerprintAttendanceBatch(batch.id, { status: 'APPLIED' });
        if (!updateResult.ok) {
            alert(updateResult.message);
            return;
        }

        setAttendanceBatchPreview(preview);
        const msg = tr(
            mode === 'PARTIAL'
                ? `تم التطبيق الجزئي للدفعة: ${appliedRows} سجل مطابق، وتم تجاهل ${preview.issueRows} سجل غير مطابق/متجاوز.`
                : `تم التطبيق الكامل للدفعة: ${appliedRows} سجل.`,
            mode === 'PARTIAL'
                ? `Batch partially applied: ${appliedRows} matched row(s), ${preview.issueRows} unmatched/skipped row(s) ignored.`
                : `Batch fully applied: ${appliedRows} row(s).`
        );
        setAttendanceBatchApplyMsg(msg);
        alert(msg);
    };

    const getAttendanceHoursForEmployee = (empId: string, range: StatementRange) => {
        let total = 0;
        Object.keys(attendanceLog).forEach(dateStr => {
            if (dateStr >= range.startDate && dateStr <= range.endDate) {
                const rec = attendanceLog[dateStr]?.[empId];
                if (rec?.inTime && rec?.outTime) total += calculateDailyHours(rec.inTime, rec.outTime);
            }
        });
        return total;
    };

    const importSingleEmployeeHoursFromAttendance = (emp: Employee, range?: StatementRange) => {
        const targetRange = range || getEmployeePayrollRange(emp.id);
        const totalHours = getAttendanceHoursForEmployee(emp.id, targetRange);
        const stdMonthly = (emp.dailyWorkHours || 8) * monthlyWorkingDays;

        setPayrollRows(prev => ({
            ...prev,
            [emp.id]: {
                ...(prev[emp.id] || {
                    employeeId: emp.id,
                    bonus: 0,
                    latePenaltyDeduction: 0,
                    latePenaltyAccountId: getDefaultPayrollPenaltyAccountId(),
                    duesSettlementDeduction: 0,
                    duesSettlementAccountId: getDefaultPayrollSettlementAccountId(),
                    customBaseSalary: getPayrollCustomBaseDefault(emp),
                }),
                totalHours,
                hours: Math.min(totalHours, stdMonthly),
                overtimeHours: Math.max(0, totalHours - stdMonthly)
            }
        }));

        return totalHours;
    };

    const importHoursFromAttendance = () => {
        const nextRows = { ...payrollRows };
        let count = 0;

        employees.forEach(emp => {
            const range = getEmployeePayrollRange(emp.id);
            const total = getAttendanceHoursForEmployee(emp.id, range);
            if (total > 0) count++;

            const stdMonthly = (emp.dailyWorkHours || 8) * monthlyWorkingDays;
            nextRows[emp.id] = {
                ...(nextRows[emp.id] || {
                    employeeId: emp.id,
                    bonus: 0,
                    latePenaltyDeduction: 0,
                    latePenaltyAccountId: getDefaultPayrollPenaltyAccountId(),
                    duesSettlementDeduction: 0,
                    duesSettlementAccountId: getDefaultPayrollSettlementAccountId(),
                    customBaseSalary: getPayrollCustomBaseDefault(emp),
                }),
                totalHours: total,
                hours: Math.min(total, stdMonthly),
                overtimeHours: Math.max(0, total - stdMonthly)
            };
        });
        setPayrollRows(nextRows);
        alert(tr(`تم تحديث ساعات العمل لـ ${count} موظف بنجاح بناءً على فترة كل موظف ?`, `Updated work hours for ${count} employee(s) using each employee period ?`));
    };

    const calculateEmployeeBreakdown = (emp: Employee) => {
        // Fixed error in file components/HRManager.tsx: Added employeeId and totalHours to satisfy MonthlyPayrollRow interface
        const row = payrollRows[emp.id] || {
            employeeId: emp.id,
            customBaseSalary: getPayrollCustomBaseDefault(emp),
            totalHours: 0,
            hours: 0,
            overtimeHours: 0,
            bonus: 0,
            latePenaltyDeduction: 0,
            latePenaltyAccountId: getDefaultPayrollPenaltyAccountId(),
            duesSettlementDeduction: 0,
            duesSettlementAccountId: getDefaultPayrollSettlementAccountId()
        };
        const payBasis = getEmployeePayBasis(emp);
        const baseRate = emp.hourlyRate || 0;
        const otRate = emp.overtimeHourlyRate || (baseRate * 1.5);
        const range = getEmployeePayrollRange(emp.id);
        const periodDays = countOverlapDaysInclusive(range.startDate, range.endDate, range.startDate, range.endDate);
        const dailyWorkHoursValue = Math.max(1, Number(emp.dailyWorkHours) || 8);
        const workedDaysFromHours = (Number(row.hours) || 0) > 0 ? (Number(row.hours) || 0) / dailyWorkHoursValue : 0;
        const periodDaysBasis = Math.max(1, periodDays || monthlyWorkingDays || 30);

        // Calculate Regular Pay based on Salary Type
        let regularPay = 0;
        if (payBasis === 'HOURLY') {
            regularPay = (row.hours || 0) * baseRate;
        } else if (payBasis === 'DAILY') {
            const rate = Math.max(0, Number((emp as any).dailyRate) || 0);
            const daysWorked = workedDaysFromHours > 0 ? workedDaysFromHours : periodDaysBasis;
            regularPay = rate * daysWorked;
        } else if (payBasis === 'WEEKLY') {
            const rate = Math.max(0, Number((emp as any).weeklyRate) || 0);
            const weeksWorked = (workedDaysFromHours > 0 ? workedDaysFromHours : periodDaysBasis) / 7;
            regularPay = rate * weeksWorked;
        } else if (payBasis === 'MONTHLY_PRORATED') {
            const monthlyRate = Math.max(0, Number(row.customBaseSalary) || Number(emp.basicSalary) || 0);
            regularPay = monthlyRate * (periodDaysBasis / Math.max(1, monthlyWorkingDays || 30));
        } else if (payBasis === 'MONTHLY_BY_HOURS') {
            const monthlyRate = Math.max(0, Number(row.customBaseSalary) || Number(emp.basicSalary) || 0);
            const standardMonthlyHours = Math.max(1, dailyWorkHoursValue * Math.max(1, monthlyWorkingDays || 30));
            const workedHours = Math.max(0, Number(row.hours) || 0);
            regularPay = monthlyRate * (workedHours / standardMonthlyHours);
        } else if (payBasis === 'COMMISSION') {
            const commissionPct = Math.max(0, Number((emp as any).commissionRatePercent) || 0);
            const workValue = Math.max(0, Number(row.customBaseSalary) || 0);
            const fixedSalary = Math.max(0, Number(emp.basicSalary) || 0);
            regularPay = fixedSalary + (workValue * (commissionPct / 100));
        } else {
            // Fixed monthly salary
            regularPay = row.customBaseSalary;
        }
        regularPay = Math.max(0, parseFloat((regularPay || 0).toFixed(2)));

        const allowances = (emp.housingAllowance || 0) + (emp.transportAllowance || 0);
        const overtimePay = (row.overtimeHours || 0) * otRate;
        const grossBeforeDeductions = regularPay + allowances + overtimePay + row.bonus;
        const latePenaltyDeduction = Math.max(0, row.latePenaltyDeduction || 0);
        const duesSettlementDeduction = Math.max(0, row.duesSettlementDeduction || 0);
        const autoLeaveDeductionLine = getUnpaidLeaveAutoDeductionLine(emp, range, row);
        const recurringAutoDeductionLines = getRecurringAutoDeductionLines(emp, range);
        const autoLeaveDeduction = autoLeaveDeductionLine?.amount || 0;
        const recurringDeductionsTotal = recurringAutoDeductionLines.reduce((sum, line) => sum + line.amount, 0);
        const deductions = latePenaltyDeduction + duesSettlementDeduction + autoLeaveDeduction + recurringDeductionsTotal;
        const net = grossBeforeDeductions - deductions;

        return {
            regularPay,
            allowances,
            overtimePay,
            grossBeforeDeductions,
            latePenaltyDeduction,
            duesSettlementDeduction,
            autoLeaveDeduction,
            recurringDeductionsTotal,
            autoLeaveDeductionLine,
            recurringAutoDeductionLines,
            deductions,
            net,
            row,
            range,
            payBasis,
            periodDays: periodDaysBasis,
            workedDaysFromHours
        };
    };

    // Helper: Check if employee has a salary ACCRUAL transaction posted in selected range
    const isEmployeeAccrued = (empId: string, range?: StatementRange) => {
        const targetRange = normalizeRange(range || { startDate: payrollStartDate, endDate: payrollEndDate });
        return transactions.some(t =>
            t.category === 'salaries' &&
            t.employeeId === empId &&
            t.creditAccountId === 'acc_accrued_salaries' &&
            t.date >= targetRange.startDate &&
            t.date <= targetRange.endDate
        );
    };

    // Helper: Check if employee has been PAID for selected range
    const isEmployeePaid = (empId: string, range?: StatementRange) => {
        const targetRange = normalizeRange(range || { startDate: payrollStartDate, endDate: payrollEndDate });
        return transactions.some(t =>
            (
                t.category === 'salary_payment' ||
                t.category === 'salary_direct_payment' ||
                (t.category === 'salaries' && t.creditAccountId !== 'acc_accrued_salaries')
            ) &&
            t.employeeId === empId &&
            (
                (() => {
                    const desc = String(t.description || '');
                    const exactMatch = desc.match(/(\d{4}-\d{2}-\d{2})\s*\/\s*(\d{4}-\d{2}-\d{2})/);
                    if (exactMatch) {
                        const parsed = normalizeRange({ startDate: exactMatch[1], endDate: exactMatch[2] });
                        return parsed.startDate === targetRange.startDate && parsed.endDate === targetRange.endDate;
                    }
                    return t.date >= targetRange.startDate && t.date <= targetRange.endDate;
                })()
            )
        );
    };

    const getEmployeeContactId = (emp: Employee) => contacts.find(c => c.type === 'EMPLOYEE' && c.name === emp.name)?.id;
    const getRangeLabel = (range: StatementRange) => `${range.startDate} / ${range.endDate}`;
    const getPayrollPeriodKey = (range: StatementRange) => {
        const normalized = normalizeRange(range);
        return `${normalized.startDate}__${normalized.endDate}`;
    };
    const countOverlapDaysInclusive = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
        if (!aStart || !aEnd || !bStart || !bEnd) return 0;
        const start = [aStart, bStart].sort()[1];
        const end = [aEnd, bEnd].sort()[0];
        if (start > end) return 0;
        const startDate = new Date(`${start}T00:00:00Z`);
        const endDate = new Date(`${end}T00:00:00Z`);
        return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
    };
    const getUnpaidLeaveAutoDeductionLine = (emp: Employee, range: StatementRange, row: MonthlyPayrollRow): PayrollAutoDeductionLine | null => {
        const normalizedRange = normalizeRange(range);
        const approvedUnpaidLeaves = employeeLeaveRequests.filter(req =>
            req.employeeId === emp.id &&
            req.status === 'APPROVED' &&
            (req.deductFromPayroll || req.leaveType === 'UNPAID') &&
            countOverlapDaysInclusive(req.effectiveFrom, req.effectiveTo, normalizedRange.startDate, normalizedRange.endDate) > 0 &&
            !(req.postedReferences || []).some(ref => ref.periodStart === normalizedRange.startDate && ref.periodEnd === normalizedRange.endDate)
        );
        if (!approvedUnpaidLeaves.length) return null;

        const unpaidDays = approvedUnpaidLeaves.reduce((sum, req) =>
            sum + countOverlapDaysInclusive(req.effectiveFrom, req.effectiveTo, normalizedRange.startDate, normalizedRange.endDate), 0);
        if (unpaidDays <= 0) return null;

        const payBasis = getEmployeePayBasis(emp);
        const dailyHoursValue = Math.max(1, Number(emp.dailyWorkHours) || 8);
        const monthlyBase = payBasis === 'COMMISSION'
            ? Math.max(0, Number(emp.basicSalary) || 0)
            : Math.max(0, Number(row.customBaseSalary) || Number(emp.basicSalary) || 0);
        const dailyRate =
            payBasis === 'HOURLY'
                ? (Number(emp.hourlyRate) || 0) * dailyHoursValue
                : payBasis === 'DAILY'
                    ? Math.max(0, Number((emp as any).dailyRate) || 0)
                    : payBasis === 'WEEKLY'
                        ? (Math.max(0, Number((emp as any).weeklyRate) || 0) / 7)
                        : (monthlyBase / Math.max(1, monthlyWorkingDays));

        const amount = Math.max(0, parseFloat((unpaidDays * dailyRate).toFixed(2)));
        if (amount <= 0) return null;
        return {
            source: 'leave',
            key: `leave-unpaid-${emp.id}-${getPayrollPeriodKey(normalizedRange)}`,
            label: tr('خصم إجازة بدون راتب', 'Unpaid Leave Deduction'),
            amount,
            accountId: approvedUnpaidLeaves.find(l => l.deductionAccountId)?.deductionAccountId || getDefaultPayrollPenaltyAccountId(),
            leaveId: approvedUnpaidLeaves[0]?.id
        };
    };
    const getRecurringAutoDeductionLines = (emp: Employee, range: StatementRange): PayrollAutoDeductionLine[] => {
        const normalizedRange = normalizeRange(range);
        const periodKey = getPayrollPeriodKey(normalizedRange);
        return employeeRecurringDeductions
            .filter(item =>
                item.employeeId === emp.id &&
                item.status === 'ACTIVE' &&
                item.effectiveFrom <= normalizedRange.endDate &&
                (!item.effectiveTo || item.effectiveTo >= normalizedRange.startDate) &&
                !(item.postedReferences || []).some(ref => `${ref.periodStart}__${ref.periodEnd}` === periodKey) &&
                ((item.installmentsApplied || 0) < (item.installmentsTotal || Number.MAX_SAFE_INTEGER))
            )
            .map(item => ({
                source: 'recurring' as const,
                key: `recurring-${item.id}-${periodKey}`,
                label: item.label || tr('خصم متكرر', 'Recurring Deduction'),
                amount: Math.max(0, Number(item.amount) || 0),
                accountId: item.accountId,
                recurringDeductionId: item.id
            }))
            .filter(line => line.amount > 0);
    };
    const extractPayrollRangeFromText = (text?: string | null): StatementRange | null => {
        const value = String(text || '');
        const exactMatch = value.match(/(\d{4}-\d{2}-\d{2})\s*\/\s*(\d{4}-\d{2}-\d{2})/);
        if (exactMatch) {
            const startDate = exactMatch[1];
            const endDate = exactMatch[2];
            return startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
        }
        const genericDates = value.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
        if (genericDates) {
            const startDate = genericDates[1];
            const endDate = genericDates[2];
            return startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
        }
        return null;
    };
    const getPayrollDeductionLines = (emp: Employee, row: MonthlyPayrollRow, range?: StatementRange) => {
        const effectiveRange = normalizeRange(range || getEmployeePayrollRange(emp.id));
        const autoLeaveDeductionLine = getUnpaidLeaveAutoDeductionLine(emp, effectiveRange, row);
        const recurringAutoDeductionLines = getRecurringAutoDeductionLines(emp, effectiveRange);
        const lines: Array<PayrollAutoDeductionLine & { kind?: 'penalty' | 'settlement' }> = [
            {
                kind: 'penalty' as const,
                label: tr('خصم تأخير/جزاءات', 'Late Penalty Deduction'),
                amount: Math.max(0, row.latePenaltyDeduction || 0),
                accountId: row.latePenaltyAccountId || getDefaultPayrollPenaltyAccountId(),
                source: 'recurring',
                key: `manual-penalty-${emp.id}-${getPayrollPeriodKey(effectiveRange)}`
            },
            {
                kind: 'settlement' as const,
                label: tr('خصم تسوية ذمم', 'Dues Settlement Deduction'),
                amount: Math.max(0, row.duesSettlementDeduction || 0),
                accountId: row.duesSettlementAccountId,
                source: 'recurring',
                key: `manual-settlement-${emp.id}-${getPayrollPeriodKey(effectiveRange)}`
            }
        ];
        if (autoLeaveDeductionLine) lines.push(autoLeaveDeductionLine);
        lines.push(...recurringAutoDeductionLines);
        return lines.filter(line => line.amount > 0);
    };
    const isReceivableAccount = (accountId?: string) => {
        if (!accountId) return false;
        const account = accounts.find(a => a.id === accountId);
        if (!account) return false;
        return account.id === 'acc_receivable' || account.parentId === 'acc_receivable_group' || account.id === 'acc_employee_advances';
    };
    const getEmployeeAccountBalance = (employeeId: string, accountId?: string) => {
        if (!accountId) return 0;
        const employee = employees.find(e => e.id === employeeId);
        const employeeContactIds = employee
            ? contacts
                .filter(c => c.type === 'EMPLOYEE' && c.name === employee.name)
                .map(c => c.id)
            : [];

        return transactions.reduce((sum, trx) => {
            if (trx.status === 'DRAFT') return sum;
            const linkedToEmployee = trx.employeeId === employeeId;
            const linkedToEmployeeContact = !!trx.contactId && employeeContactIds.includes(trx.contactId);
            if (!linkedToEmployee && !linkedToEmployeeContact) return sum;
            const debit = trx.debitAccountId === accountId ? trx.amount : 0;
            const credit = trx.creditAccountId === accountId ? trx.amount : 0;
            return sum + debit - credit;
        }, 0);
    };
    const validatePayrollDeductionsForEmployee = (emp: Employee, row: MonthlyPayrollRow): string | null => {
        const deductionLines = getPayrollDeductionLines(emp, row);
        const missingAccountLine = deductionLines.find(line => !line.accountId);
        if (missingAccountLine) {
            return tr(
                `يرجى اختيار حساب ${missingAccountLine.label} للموظف ${emp.name} قبل الترحيل.`,
                `Please choose ${missingAccountLine.label} account for ${emp.name} before posting.`
            );
        }

        const requiredByReceivableAccount: Record<string, number> = {};
        deductionLines.forEach(line => {
            if (line.kind === 'settlement' && line.accountId && isReceivableAccount(line.accountId)) {
                requiredByReceivableAccount[line.accountId] = (requiredByReceivableAccount[line.accountId] || 0) + line.amount;
            }
            if (line.source === 'recurring' && line.accountId && isReceivableAccount(line.accountId) && line.kind !== 'penalty') {
                requiredByReceivableAccount[line.accountId] = (requiredByReceivableAccount[line.accountId] || 0) + line.amount;
            }
        });

        const exceededEntry = Object.entries(requiredByReceivableAccount).find(([accountId, amount]) => {
            const availableBalance = Math.max(0, getEmployeeAccountBalance(emp.id, accountId));
            return amount > availableBalance;
        });

        if (exceededEntry) {
            const [accountId, amount] = exceededEntry;
            const accountName = displayAccountName(accounts.find(a => a.id === accountId) || null) || tr('حساب الذمم', 'Dues Account');
            const availableBalance = Math.max(0, getEmployeeAccountBalance(emp.id, accountId));
            return tr(
                `مجموع الخصم على ${accountName} للموظف ${emp.name} (${amount.toLocaleString()}) أكبر من الرصيد المتاح (${availableBalance.toLocaleString()}).`,
                `Total deduction on ${accountName} for ${emp.name} (${amount.toLocaleString()}) exceeds available balance (${availableBalance.toLocaleString()}).`
            );
        }

        return null;
    };
    const postPayrollAccrualWithDeduction = (emp: Employee, range: StatementRange, notePrefix: string, postingDateOverride?: string, voucherId?: string) => {
        const { grossBeforeDeductions, row } = calculateEmployeeBreakdown(emp);
        if (grossBeforeDeductions <= 0) return false;
        if (isEmployeePaid(emp.id, range) || isEmployeeAccrued(emp.id, range)) return false;
        const deductionLines = getPayrollDeductionLines(emp, row, range);
        const deductionValidationError = validatePayrollDeductionsForEmployee(emp, row);
        if (deductionValidationError) {
            alert(deductionValidationError);
            return false;
        }
        const effectivePostingDate = postingDateOverride || postingDate;

        addTransaction({
            voucherId,
            amount: grossBeforeDeductions,
            description: `${notePrefix} - ${emp.name} (${getRangeLabel(range)})`,
            category: 'salaries',
            type: TransactionType.EXPENSE,
            date: effectivePostingDate,
            debitAccountId: expenseAccountId,
            creditAccountId: 'acc_accrued_salaries',
            currency: baseCurrency,
            exchangeRate: 1,
            status: 'POSTED',
            employeeId: emp.id,
            contactId: getEmployeeContactId(emp)
        });

        deductionLines.forEach(line => {
            addTransaction({
                voucherId,
                amount: line.amount,
                description: `${line.label} ${tr('ضمن احتساب الراتب', 'within payroll accrual')} - ${emp.name} (${getRangeLabel(range)})`,
                category: 'employee_deduction',
                type: TransactionType.TRANSFER,
                date: effectivePostingDate,
                debitAccountId: 'acc_accrued_salaries',
                creditAccountId: line.accountId!,
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED',
                employeeId: emp.id,
                contactId: getEmployeeContactId(emp)
            });
        });

        const postedAt = new Date().toISOString();
        const periodRef = { periodStart: range.startDate, periodEnd: range.endDate, postedAt };
        const recurringIds = deductionLines.filter(l => l.recurringDeductionId).map(l => l.recurringDeductionId!);
        const leaveIds = deductionLines.filter(l => l.leaveId).map(l => l.leaveId!);

        if (leaveIds.length) {
            leaveIds.forEach(id => {
                const existing = employeeLeaveRequests.find(r => r.id === id);
                if (!existing) return;
                const refs = [...(existing.postedReferences || [])];
                if (!refs.some(ref => ref.periodStart === range.startDate && ref.periodEnd === range.endDate)) {
                    updateEmployeeLeaveRequest(id, { postedReferences: [...refs, periodRef] });
                }
            });
        }

        if (recurringIds.length) {
            recurringIds.forEach(id => {
                const existing = employeeRecurringDeductions.find(d => d.id === id);
                if (!existing) return;
                const refs = [...(existing.postedReferences || [])];
                const alreadyPosted = refs.some(ref => ref.periodStart === range.startDate && ref.periodEnd === range.endDate);
                if (alreadyPosted) return;
                const nextInstallmentsApplied = (existing.installmentsApplied || 0) + 1;
                const reachedTotal = existing.installmentsTotal && nextInstallmentsApplied >= existing.installmentsTotal;
                updateEmployeeRecurringDeduction(id, {
                    postedReferences: [...refs, { ...periodRef, amount: existing.amount }],
                    installmentsApplied: nextInstallmentsApplied,
                    status: reachedTotal ? 'COMPLETED' : existing.status
                });
            });
        }

        return true;
    };

    // --- Accrue Single Employee Logic (Entitlement) ---
    const handleAccrueSingleEmployee = (emp: Employee) => {
        if (!expenseAccountId) {
            return alert(tr(
                'يرجى اختيار حساب المصروف (الطرف المدين) من القائمة في الأعلى',
                'Please select the expense account (debit side) from the top list.'
            ));
        }

        const range = getEmployeePayrollRange(emp.id);

        if (isEmployeePaid(emp.id, range)) {
            return alert(tr(
                'تم صرف راتب هذا الموظف لهذه الفترة بالفعل، ولا يمكن ترحيل استحقاق جديد.',
                'This employee salary is already paid for this period. A new accrual cannot be posted.'
            ));
        }

        if (isEmployeeAccrued(emp.id, range)) {
            return alert(tr(
                'تم ترحيل استحقاق راتب هذا الموظف مسبقًا لهذه الفترة.',
                'Salary accrual for this employee is already posted for this period.'
            ));
        }

        const { grossBeforeDeductions, deductions, net, row } = calculateEmployeeBreakdown(emp);
        if (grossBeforeDeductions <= 0) {
            return alert(tr('إجمالي الاستحقاق صفر أو سالب، لا يمكن الترحيل', 'Total accrual is zero or negative. Posting is not allowed.'));
        }

        const deductionValidationError = validatePayrollDeductionsForEmployee(emp, row);
        if (deductionValidationError) return alert(deductionValidationError);

        if (confirm(tr(
            `استحقاق ${emp.name}: إجمالي ${grossBeforeDeductions.toLocaleString()} | خصومات ${deductions.toLocaleString()} | صافي ${net.toLocaleString()}.\nهل تريد الترحيل الآن؟`,
            `Accrual for ${emp.name}: Gross ${grossBeforeDeductions.toLocaleString()} | Deductions ${deductions.toLocaleString()} | Net ${net.toLocaleString()}.\nDo you want to post now?`
        ))) {
            postPayrollAccrualWithDeduction(emp, range, tr('استحقاق راتب', 'Salary Accrual'));
        }
    };

    // --- Pay Single Employee Logic (Disbursement) ---
    const handlePaySingleEmployee = (emp: Employee) => {
        if (!paymentAccountId) {
            return alert(tr(
                'يرجى اختيار حساب الصرف (الخزينة/البنك) من القائمة في الأعلى',
                'Please select the payment account (cash/bank) from the top list.'
            ));
        }

        const range = getEmployeePayrollRange(emp.id);

        if (isEmployeePaid(emp.id, range)) {
            return alert(tr(
                'تم صرف راتب هذا الموظف مسبقًا لهذه الفترة.',
                'This employee is already paid for this period.'
            ));
        }

        if (!isEmployeeAccrued(emp.id, range)) {
            return alert(tr(
                'لا يمكن الصرف قبل ترحيل استحقاق الراتب لهذه الفترة.',
                'Payment cannot be made before posting salary accrual for this period.'
            ));
        }

        const { net } = calculateEmployeeBreakdown(emp);
        if (net <= 0) return alert(tr('صافي الراتب صفر أو سالب، لا يمكن الصرف', 'Net salary is zero or negative. Payment is not allowed.'));

        if (confirm(tr(
            `هل أنت متأكد من صرف راتب الموظف ${emp.name} بقيمة ${net.toLocaleString()}؟ (سيتم الخصم من ${displayAccountName(accounts.find(a => a.id === paymentAccountId) || null)})`,
            `Are you sure you want to pay ${emp.name} an amount of ${net.toLocaleString()}? (It will be credited from ${displayAccountName(accounts.find(a => a.id === paymentAccountId) || null)})`
        ))) {
            addTransaction({
                amount: net,
                description: `${tr('صرف راتب', 'Salary Payment')} - ${emp.name} (${getRangeLabel(range)})`,
                category: 'salary_payment',
                type: TransactionType.EXPENSE,
                date: postingDate,
                debitAccountId: 'acc_accrued_salaries',
                creditAccountId: paymentAccountId,
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED',
                employeeId: emp.id,
                contactId: getEmployeeContactId(emp)
            });
        }
    };

    // --- Pay Directly (Accrue & Pay) ---
    const handlePayDirectlySingleEmployee = (emp: Employee) => {
        if (!paymentAccountId) return alert(tr('يرجى اختيار حساب الصرف (الخزينة/البنك).', 'Please select the payment account (cash/bank).'));
        if (!expenseAccountId) return alert(tr('يرجى اختيار حساب المصروف.', 'Please select the expense account.'));
        const range = getEmployeePayrollRange(emp.id);

        if (isEmployeeAccrued(emp.id, range)) {
            return alert(tr(
                'تم ترحيل استحقاق لهذا الموظف في هذه الفترة. استخدم صرف الراتب بدلاً من الاستحقاق والصرف المباشر.',
                'Accrual is already posted for this employee in this period. Use salary payment instead of direct accrue & pay.'
            ));
        }

        if (isEmployeePaid(emp.id, range)) {
            return alert(tr(
                'تم صرف هذا الموظف مسبقًا لهذه الفترة.',
                'This employee is already paid for this period.'
            ));
        }

        const { net, deductions } = calculateEmployeeBreakdown(emp);
        if (deductions > 0) {
            return alert(tr(
                'عند وجود خصومات، استخدم مسار الاستحقاق ثم الصرف ليتم الخصم من ذمم الموظف بشكل صحيح.',
                'When deductions exist, use accrual then payment so deductions are applied correctly against employee dues.'
            ));
        }

        if (net <= 0) return alert(tr('صافي الراتب صفر أو سالب، لا يمكن الترحيل', 'Net salary is zero or negative. Posting is not allowed.'));

        if (confirm(tr(
            `هل أنت متأكد من استحقاق وصرف راتب الموظف ${emp.name} بقيمة ${net.toLocaleString()} فورًا؟ (سيتم إنشاء قيد مركب: الرواتب مدين / الصندوق دائن)`,
            `Are you sure you want to accrue and pay ${emp.name} immediately for ${net.toLocaleString()}? (A compound entry will be posted: Salaries Dr / Cash Cr)`
        ))) {
            addTransaction({
                amount: net,
                description: `${tr('استحقاق وصرف مباشر', 'Direct Accrual & Payment')} - ${emp.name} (${getRangeLabel(range)})`,
                category: 'salary_direct_payment',
                type: TransactionType.EXPENSE,
                date: postingDate,
                debitAccountId: expenseAccountId,
                creditAccountId: paymentAccountId,
                currency: baseCurrency,
                exchangeRate: 1,
                status: 'POSTED',
                employeeId: emp.id,
                contactId: getEmployeeContactId(emp)
            });
        }
    };








    // --- Bulk Accrue Logic ---
    const handlePayrollAccrualProcess = async (targetEmployees: Employee[] = employees) => {
        if (!expenseAccountId) return alert(tr('يرجى اختيار حساب المصروف.', 'Please select the expense account.'));

        const unaccruedEmployees = targetEmployees.filter(e => {
            const range = getEmployeePayrollRange(e.id);
            return !isEmployeeAccrued(e.id, range) && !isEmployeePaid(e.id, range);
        });

        if (unaccruedEmployees.length === 0) {
            return alert(tr('جميع الموظفين تم ترحيل استحقاقهم لهذه الفترة بالفعل! ?', 'All employees are already accrued for this period! ?'));
        }

        const totalGross = unaccruedEmployees.reduce((s, e) => s + calculateEmployeeBreakdown(e).grossBeforeDeductions, 0);
        const totalDeductions = unaccruedEmployees.reduce((s, e) => s + calculateEmployeeBreakdown(e).deductions, 0);
        const totalAmount = totalGross - totalDeductions;
        const invalidEmployees = unaccruedEmployees
            .map(emp => {
                const breakdown = calculateEmployeeBreakdown(emp);
                const message = validatePayrollDeductionsForEmployee(emp, breakdown.row);
                return message ? { name: emp.name, message } : null;
            })
            .filter((item): item is { name: string; message: string } => item !== null);

        if (invalidEmployees.length > 0) {
            const errors = invalidEmployees.map(item => `- ${item.name}: ${item.message}`).join('\n');
            return alert(tr(
                `يرجى معالجة إعدادات الخصومات قبل الترحيل:\n${errors}`,
                `Please fix deduction settings before posting:\n${errors}`
            ));
        }

        if (confirm(tr(
            `سيتم ترحيل استحقاق ${unaccruedEmployees.length} موظف.\nإجمالي الاستحقاق: ${totalGross.toLocaleString()} | إجمالي الخصومات: ${totalDeductions.toLocaleString()} | الصافي: ${totalAmount.toLocaleString()}`,
            `This will post accrual for ${unaccruedEmployees.length} employee(s).\nGross: ${totalGross.toLocaleString()} | Deductions: ${totalDeductions.toLocaleString()} | Net: ${totalAmount.toLocaleString()}`
        ))) {
            setIsProcessing(true);
            setTimeout(() => {
                let count = 0;
                unaccruedEmployees.forEach(emp => {
                    const range = getEmployeePayrollRange(emp.id);
                    if (postPayrollAccrualWithDeduction(emp, range, tr('مسير رواتب جماعي (استحقاق)', 'Bulk Payroll Run (Accrual)'))) {
                        count++;
                    }
                });
                setIsProcessing(false);
                alert(tr(`تم بنجاح ترحيل استحقاق ${count} موظف ?`, `Successfully posted accrual for ${count} employee(s) ?`));
            }, 500);
        }
    };

    // --- Bulk Pay Logic ---
    const handlePayrollPaymentProcess = async (targetEmployees: Employee[] = employees) => {
        if (!paymentAccountId) return alert(tr('يرجى اختيار حساب الصرف.', 'Please select the payment account.'));

        const unpaidEmployees = targetEmployees.filter(e => {
            const range = getEmployeePayrollRange(e.id);
            return isEmployeeAccrued(e.id, range) && !isEmployeePaid(e.id, range);
        });

        if (unpaidEmployees.length === 0) {
            return alert(tr('لا يوجد موظفين مستحقين للدفع (يجب ترحيل الاستحقاق أولاً) أو تم دفع الجميع! ?', 'No payable employees found (accrual must be posted first), or everyone is already paid! ?'));
        }

        const totalAmount = unpaidEmployees.reduce((s, e) => s + calculateEmployeeBreakdown(e).net, 0);

        if (confirm(tr(
            `سيتم صرف رواتب ${unpaidEmployees.length} موظف بقيمة إجمالية ${totalAmount.toLocaleString()} من حساب ${displayAccountName(accounts.find(a => a.id === paymentAccountId) || null)}؟`,
            `Pay salaries for ${unpaidEmployees.length} employee(s) with total ${totalAmount.toLocaleString()} from account ${displayAccountName(accounts.find(a => a.id === paymentAccountId) || null)}?`
        ))) {
            setIsProcessing(true);
            setTimeout(() => {
                let count = 0;
                unpaidEmployees.forEach(emp => {
                    const { net } = calculateEmployeeBreakdown(emp);
                    const range = getEmployeePayrollRange(emp.id);
                    addTransaction({
                        amount: net,
                        description: `${tr('صرف رواتب جماعي', 'Bulk Salary Payment')} - ${emp.name} (${getRangeLabel(range)})`,
                        category: 'salary_payment',
                        type: TransactionType.EXPENSE,
                        date: postingDate,
                        debitAccountId: 'acc_accrued_salaries',
                        creditAccountId: paymentAccountId,
                        currency: baseCurrency,
                        exchangeRate: 1,
                        status: 'POSTED',
                        employeeId: emp.id,
                        contactId: getEmployeeContactId(emp)
                    });
                    count++;
                });
                setIsProcessing(false);
                alert(tr(`تم بنجاح صرف رواتب ${count} موظف ?`, `Successfully paid salaries for ${count} employee(s) ?`));
            }, 500);
        }
    };

    // --- Bulk Direct Pay Logic (single compound entry per employee: Expense -> Cash/Bank) ---
    const handlePayrollDirectPaymentProcess = async (targetEmployees: Employee[] = employees) => {
        if (!paymentAccountId) return alert(tr('يرجى اختيار حساب الصرف.', 'Please select the payment account.'));
        if (!expenseAccountId) return alert(tr('يرجى اختيار حساب المصروف.', 'Please select the expense account.'));

        const directEligibleEmployees = targetEmployees.filter(e => {
            const range = getEmployeePayrollRange(e.id);
            const breakdown = calculateEmployeeBreakdown(e);
            return !isEmployeeAccrued(e.id, range) && !isEmployeePaid(e.id, range) && breakdown.deductions <= 0;
        });

        if (directEligibleEmployees.length === 0) {
            return alert(tr('لا يوجد موظفين مؤهلين للاستحقاق والصرف المباشر في هذه الفترة. ?', 'No employees are eligible for direct accrue & pay in this period. ?'));
        }

        const totalAmount = directEligibleEmployees.reduce((s, e) => s + calculateEmployeeBreakdown(e).net, 0);
        if (confirm(tr(
            `سيتم ترحيل استحقاق وصرف مباشر لـ ${directEligibleEmployees.length} موظف بقيمة ${totalAmount.toLocaleString()} من حساب ${displayAccountName(accounts.find(a => a.id === paymentAccountId) || null)}؟`,
            `This will post direct accrual and payment for ${directEligibleEmployees.length} employee(s) totaling ${totalAmount.toLocaleString()} from account ${displayAccountName(accounts.find(a => a.id === paymentAccountId) || null)}. Continue?`
        ))) {
            setIsProcessing(true);
            setTimeout(() => {
                let count = 0;
                directEligibleEmployees.forEach(emp => {
                    const { net } = calculateEmployeeBreakdown(emp);
                    if (net <= 0) return;
                    const range = getEmployeePayrollRange(emp.id);
                    addTransaction({
                        amount: net,
                        description: `${tr('استحقاق وصرف مباشر جماعي', 'Bulk Direct Accrual & Payment')} - ${emp.name} (${getRangeLabel(range)})`,
                        category: 'salary_direct_payment',
                        type: TransactionType.EXPENSE,
                        date: postingDate,
                        debitAccountId: expenseAccountId,
                        creditAccountId: paymentAccountId,
                        currency: baseCurrency,
                        exchangeRate: 1,
                        status: 'POSTED',
                        employeeId: emp.id,
                        contactId: getEmployeeContactId(emp)
                    });
                    count++;
                });
                setIsProcessing(false);
                alert(tr(`تم بنجاح الاستحقاق والصرف المباشر لـ ${count} موظف ?`, `Successfully posted direct accrual & payment for ${count} employee(s) ?`));
            }, 500);
        }
    };

    const buildPayrollRunNumber = (periodStart: string) => {
        const stamp = (periodStart || todayIso).replace(/-/g, '').slice(0, 6);
        const samePeriod = payrollRuns.filter(run => (run.periodStart || '').replace(/-/g, '').slice(0, 6) === stamp);
        const nextSeq = samePeriod.length + 1;
        return `PR-${stamp}-${String(nextSeq).padStart(3, '0')}`;
    };

    const computePayrollRunTotals = (lines: PayrollRunLine[]) => lines.reduce((sum, line) => ({
        gross: sum.gross + line.gross,
        deductions: sum.deductions + line.deductions,
        net: sum.net + line.net
    }), { gross: 0, deductions: 0, net: 0 });

    const buildPayrollRunRecord = (targetEmployees: Employee[], overrides: Partial<PayrollRunRecord> = {}) => {
        const normalizedRange = normalizeRange({ startDate: payrollStartDate, endDate: payrollEndDate });
        const lines: PayrollRunLine[] = targetEmployees.map(emp => {
            const breakdown = calculateEmployeeBreakdown(emp);
            return {
                employeeId: emp.id,
                employeeCode: emp.code,
                employeeName: emp.name,
                periodStart: breakdown.range.startDate,
                periodEnd: breakdown.range.endDate,
                gross: breakdown.grossBeforeDeductions,
                deductions: breakdown.deductions,
                net: breakdown.net,
                rowSnapshot: { ...breakdown.row }
            };
        }).filter(line => line.gross > 0 || line.net > 0 || line.deductions > 0);
        const totals = computePayrollRunTotals(lines);
        const run: PayrollRunRecord = {
            id: overrides.id || `prun_${Math.random().toString(36).slice(2, 11)}`,
            runNumber: overrides.runNumber || buildPayrollRunNumber(normalizedRange.startDate),
            periodStart: overrides.periodStart || normalizedRange.startDate,
            periodEnd: overrides.periodEnd || normalizedRange.endDate,
            postingDate: overrides.postingDate || postingDate,
            status: overrides.status || 'POSTED',
            createdAt: overrides.createdAt || new Date().toISOString(),
            reviewedAt: overrides.reviewedAt,
            postedAt: overrides.postedAt,
            lockedAt: overrides.lockedAt,
            notes: overrides.notes,
            employeeIds: lines.map(l => l.employeeId),
            lines,
            totals,
            paymentBatch: overrides.paymentBatch
        };
        return run;
    };

    const buildPayrollPaymentBatchNumber = (run: PayrollRunRecord) => `${run.runNumber.replace(/^PR-/, 'PRP-')}-001`;

    const buildPayrollRunPaymentBatchDraft = (run: PayrollRunRecord): PayrollRunPaymentBatch => ({
        id: `prpay_${Math.random().toString(36).slice(2, 11)}`,
        batchNumber: buildPayrollPaymentBatchNumber(run),
        runId: run.id,
        status: 'DRAFT',
        paymentDate: run.postingDate || run.periodEnd || todayIso,
        paymentAccountId: paymentAccountId || undefined,
        createdAt: new Date().toISOString(),
        lines: run.lines
            .filter(line => Math.max(0, Number(line.net) || 0) > 0)
            .map(line => {
                const emp = employees.find(e => e.id === line.employeeId);
                return {
                    employeeId: line.employeeId,
                    employeeCode: line.employeeCode,
                    employeeName: line.employeeName,
                    periodStart: line.periodStart,
                    periodEnd: line.periodEnd,
                    amount: Math.max(0, Number(line.net) || 0),
                    bankName: emp?.bankName,
                    iban: emp?.iban
                };
            })
    });

    const getPayrollRunPaymentBatchPreview = (run: PayrollRunRecord | null) => {
        if (!run) return null;
        const batch = run.paymentBatch;
        const sourceLines = (batch?.lines && batch.lines.length > 0)
            ? batch.lines
            : buildPayrollRunPaymentBatchDraft(run).lines;
        const lines = sourceLines.map(line => {
            const emp = employees.find(e => e.id === line.employeeId);
            const range = { startDate: line.periodStart, endDate: line.periodEnd };
            const hasEmployee = !!emp;
            const amount = Math.max(0, Number(line.amount) || 0);
            const isAccrued = hasEmployee ? isEmployeeAccrued(line.employeeId, range) : false;
            const isPaid = hasEmployee ? isEmployeePaid(line.employeeId, range) : false;
            const iban = (line.iban || emp?.iban || '').trim();
            const bankName = (line.bankName || emp?.bankName || '').trim();
            const status: 'READY' | 'MISSING_EMPLOYEE' | 'NOT_ACCRUED' | 'ALREADY_PAID' | 'ZERO_AMOUNT' =
                !hasEmployee ? 'MISSING_EMPLOYEE'
                    : amount <= 0 ? 'ZERO_AMOUNT'
                        : !isAccrued ? 'NOT_ACCRUED'
                            : isPaid ? 'ALREADY_PAID'
                                : 'READY';
            return {
                ...line,
                amount,
                bankName,
                iban,
                status,
                canExportBank: status === 'READY' && !!iban
            };
        });
        const summary = {
            totalLines: lines.length,
            readyToPost: lines.filter(l => l.status === 'READY').length,
            alreadyPaid: lines.filter(l => l.status === 'ALREADY_PAID').length,
            notAccrued: lines.filter(l => l.status === 'NOT_ACCRUED').length,
            missingEmployee: lines.filter(l => l.status === 'MISSING_EMPLOYEE').length,
            withIban: lines.filter(l => !!l.iban && l.amount > 0).length,
            missingIban: lines.filter(l => !l.iban && l.amount > 0).length,
            exportableCount: lines.filter(l => l.canExportBank).length,
            exportableAmount: lines.filter(l => l.canExportBank).reduce((sum, l) => sum + l.amount, 0)
        };
        return { batch, lines, summary };
    };

    const updatePayrollRunRecord = (runId: string, updater: (run: PayrollRunRecord) => PayrollRunRecord) => {
        setPayrollRuns(prev => prev.map(run => run.id === runId ? updater(run) : run));
    };

    const getPayrollRunCandidateEmployees = (targetEmployees: Employee[], allowAlreadyPosted = false) => targetEmployees.filter(emp => {
        const breakdown = calculateEmployeeBreakdown(emp);
        if (breakdown.grossBeforeDeductions <= 0 && breakdown.net <= 0 && breakdown.deductions <= 0) return false;
        if (allowAlreadyPosted) return true;
        return !isEmployeeAccrued(emp.id, breakdown.range) && !isEmployeePaid(emp.id, breakdown.range);
    });

    const getPayrollRunLinkedTransactionIds = (run: PayrollRunRecord) => {
        const ids = new Set<string>();
        const paymentBatchNumber = run.paymentBatch?.batchNumber || buildPayrollPaymentBatchNumber(run);
        const lineKeys = new Set(run.lines.map(line => `${line.employeeId}__${line.periodStart}__${line.periodEnd}`));

        transactions.forEach(tx => {
            if (tx.voucherId === run.id) {
                ids.add(tx.id);
                return;
            }

            if (!tx.employeeId) return;
            const txRange = extractPayrollRangeFromText(tx.description);
            const txKey = txRange ? `${tx.employeeId}__${txRange.startDate}__${txRange.endDate}` : '';
            const isRunLine = txKey ? lineKeys.has(txKey) : false;

            if (tx.category === 'salaries' && tx.description.includes(run.runNumber) && isRunLine) {
                ids.add(tx.id);
                return;
            }

            if (tx.category === 'employee_deduction' && isRunLine && tx.date === run.postingDate) {
                ids.add(tx.id);
                return;
            }

            if (tx.category === 'salary_payment' && tx.description.includes(run.runNumber) && tx.description.includes(paymentBatchNumber)) {
                ids.add(tx.id);
            }
        });

        return ids;
    };

    const rollbackPayrollRunReferences = (run: PayrollRunRecord) => {
        run.lines.forEach(line => {
            const samePeriod = (ref?: { periodStart: string; periodEnd: string }) =>
                !!ref && ref.periodStart === line.periodStart && ref.periodEnd === line.periodEnd;

            employeeLeaveRequests
                .filter(req => req.employeeId === line.employeeId && (req.postedReferences || []).some(ref => samePeriod(ref)))
                .forEach(req => {
                    updateEmployeeLeaveRequest(req.id, {
                        postedReferences: (req.postedReferences || []).filter(ref => !samePeriod(ref))
                    });
                });

            employeeRecurringDeductions
                .filter(item => item.employeeId === line.employeeId && (item.postedReferences || []).some(ref => samePeriod(ref)))
                .forEach(item => {
                    const removedCount = (item.postedReferences || []).filter(ref => samePeriod(ref)).length;
                    if (!removedCount) return;
                    const nextInstallmentsApplied = Math.max(0, (item.installmentsApplied || 0) - removedCount);
                    updateEmployeeRecurringDeduction(item.id, {
                        postedReferences: (item.postedReferences || []).filter(ref => !samePeriod(ref)),
                        installmentsApplied: nextInstallmentsApplied,
                        status: item.status === 'COMPLETED' && nextInstallmentsApplied < (item.installmentsTotal || Number.MAX_SAFE_INTEGER)
                            ? 'ACTIVE'
                            : item.status
                    });
                });
        });
    };

    const clearPayrollRunArtifacts = (run: PayrollRunRecord) => {
        const linkedTransactionIds = getPayrollRunLinkedTransactionIds(run);
        if (linkedTransactionIds.size > 0) {
            setTransactions(prev => prev.filter(tx => !linkedTransactionIds.has(tx.id)));
        }
        rollbackPayrollRunReferences(run);
    };

    const loadPayrollRunIntoEditor = (run: PayrollRunRecord) => {
        setActiveTab('PAYROLL');
        setPayrollStartDate(run.periodStart);
        setPayrollEndDate(run.periodEnd);
        setPostingDate(run.postingDate || todayIso);
        setPayrollFocusEmployeeId('');
        setPayrollRows(Object.fromEntries(run.lines.map(line => [line.employeeId, { ...line.rowSnapshot }])));
        setEmployeePayrollRanges(prev => ({
            ...prev,
            ...Object.fromEntries(run.lines.map(line => [line.employeeId, { startDate: line.periodStart, endDate: line.periodEnd }]))
        }));
        setSelectedPayrollRunId(run.id);
    };

    const handlePersistPayrollRun = (targetEmployees: Employee[], existingRunId?: string) => {
        const existingRun = existingRunId ? payrollRuns.find(r => r.id === existingRunId) || null : null;
        if (existingRun?.status === 'LOCKED') {
            return alert(tr('لا يمكن تعديل دفعة رواتب مقفلة.', 'Cannot edit a locked payroll run.'));
        }
        if (!expenseAccountId) {
            return alert(tr('يرجى اختيار حساب المصروف قبل الترحيل.', 'Please select expense account before posting.'));
        }

        const candidateEmployees = getPayrollRunCandidateEmployees(targetEmployees, !!existingRun);
        if (candidateEmployees.length === 0) {
            return alert(tr('لا يوجد موظفون صالحون لترحيل دفعة الرواتب الحالية.', 'No valid employees found for posting this payroll run.'));
        }

        const invalidEmployees = candidateEmployees
            .map(emp => {
                const breakdown = calculateEmployeeBreakdown(emp);
                const message = validatePayrollDeductionsForEmployee(emp, breakdown.row);
                return message ? { name: emp.name, message } : null;
            })
            .filter((item): item is { name: string; message: string } => item !== null);

        if (invalidEmployees.length > 0) {
            const errors = invalidEmployees.map(item => `- ${item.name}: ${item.message}`).join('\n');
            return alert(tr(
                `يرجى معالجة إعدادات الخصومات قبل ترحيل كشف الرواتب:\n${errors}`,
                `Please fix deduction settings before posting the payroll run:\n${errors}`
            ));
        }

        const candidateRun = buildPayrollRunRecord(candidateEmployees, {
            id: existingRun?.id,
            runNumber: existingRun?.runNumber,
            createdAt: existingRun?.createdAt,
            status: 'POSTED'
        });

        const confirmMsg = existingRun
            ? tr(
                `سيتم حفظ تعديل دفعة الرواتب ${candidateRun.runNumber} وترحيلها من جديد. هل تريد المتابعة؟`,
                `Payroll run ${candidateRun.runNumber} will be re-posted with your edits. Continue?`
            )
            : tr(
                `سيتم ترحيل دفعة الرواتب ${candidateRun.runNumber} لعدد ${candidateRun.lines.length} موظف. هل تريد المتابعة؟`,
                `Payroll run ${candidateRun.runNumber} will be posted for ${candidateRun.lines.length} employee(s). Continue?`
            );

        if (!confirm(confirmMsg)) return;

        if (existingRun) {
            clearPayrollRunArtifacts(existingRun);
        }

        setIsProcessing(true);
        setTimeout(() => {
            const successfulLines: PayrollRunLine[] = [];

            candidateRun.lines.forEach(line => {
                const employee = employees.find(emp => emp.id === line.employeeId);
                if (!employee) return;
                const lineRange = { startDate: line.periodStart, endDate: line.periodEnd };
                if (postPayrollAccrualWithDeduction(employee, lineRange, `${tr('دفعة رواتب', 'Payroll Run')} ${candidateRun.runNumber}`, candidateRun.postingDate, candidateRun.id)) {
                    successfulLines.push(line);
                }
            });

            const postedRun: PayrollRunRecord = {
                ...candidateRun,
                status: 'POSTED',
                postedAt: new Date().toISOString(),
                reviewedAt: undefined,
                lockedAt: undefined,
                paymentBatch: undefined,
                lines: successfulLines,
                employeeIds: successfulLines.map(line => line.employeeId),
                totals: computePayrollRunTotals(successfulLines)
            };

            setPayrollRuns(prev => {
                if (existingRun) {
                    return prev.map(run => run.id === existingRun.id ? postedRun : run);
                }
                return [postedRun, ...prev];
            });
            setSelectedPayrollRunId(postedRun.id);
            setEditingPayrollRunId(null);
            setIsProcessing(false);

            alert(tr(
                existingRun
                    ? `تم حفظ تعديل الدفعة وترحيلها بنجاح (${successfulLines.length}/${candidateRun.lines.length})`
                    : `تم ترحيل الدفعة بنجاح (${successfulLines.length}/${candidateRun.lines.length})`,
                existingRun
                    ? `Payroll run updated and posted successfully (${successfulLines.length}/${candidateRun.lines.length})`
                    : `Payroll run posted successfully (${successfulLines.length}/${candidateRun.lines.length})`
            ));
        }, 300);
    };

    const handleStartEditPayrollRun = (runId: string) => {
        const run = payrollRuns.find(r => r.id === runId);
        if (!run) return alert(tr('دفعة الرواتب غير موجودة', 'Payroll run not found.'));
        if (run.status === 'LOCKED') return alert(tr('لا يمكن تعديل دفعة مقفلة.', 'Cannot edit a locked payroll run.'));

        const confirmMsg = run.paymentBatch?.status === 'POSTED'
            ? tr(
                'سيتم إلغاء ترحيل دفعة الرواتب وحذف صرف دفعة الدفع المرتبط بها ثم فتحها للتعديل. هل تريد المتابعة؟',
                'This will unpost the payroll run, remove its posted payment batch, and reopen it for editing. Continue?'
            )
            : tr(
                'سيتم إلغاء ترحيل دفعة الرواتب وفتحها للتعديل. هل تريد المتابعة؟',
                'This will unpost the payroll run and reopen it for editing. Continue?'
            );
        if (!confirm(confirmMsg)) return;

        clearPayrollRunArtifacts(run);
        updatePayrollRunRecord(runId, current => ({
            ...current,
            status: 'REVIEWED',
            reviewedAt: new Date().toISOString(),
            postedAt: undefined,
            lockedAt: undefined,
            paymentBatch: undefined
        }));
        loadPayrollRunIntoEditor(run);
        setEditingPayrollRunId(runId);
    };

    const handleCreatePayrollRunPaymentBatch = (runId: string) => {
        const run = payrollRuns.find(r => r.id === runId);
        if (!run) return alert(tr('دفعة الرواتب غير موجودة', 'Payroll run not found.'));
        if (!(run.status === 'POSTED' || run.status === 'LOCKED')) {
            return alert(tr('أنشئ دفعة الدفع بعد ترحيل دفعة الرواتب أولًا.', 'Create payment batch only after posting the payroll run.'));
        }
        if (run.paymentBatch?.status === 'POSTED') {
            return alert(tr('تم ترحيل دفعة الدفع لهذه الدفعة مسبقًا.', 'This payroll run already has a posted payment batch.'));
        }
        if (run.paymentBatch && run.paymentBatch.status === 'DRAFT') {
            const replace = confirm(tr('توجد دفعة دفع قيد التحضير. هل تريد إعادة إنشائها من صافي الدفعة الحالي؟', 'A payment batch is still being prepared. Rebuild it from the current payroll run net values?'));
            if (!replace) return;
        }
        const batch = buildPayrollRunPaymentBatchDraft(run);
        updatePayrollRunRecord(runId, r => ({ ...r, paymentBatch: batch }));
        alert(tr(`تم إنشاء دفعة دفع: ${batch.batchNumber}`, `Payment batch created: ${batch.batchNumber}`));
    };

    const updatePayrollRunPaymentBatch = (runId: string, patch: Partial<PayrollRunPaymentBatch>) => {
        updatePayrollRunRecord(runId, r => {
            if (!r.paymentBatch || r.paymentBatch.status === 'POSTED') return r;
            return { ...r, paymentBatch: { ...r.paymentBatch, ...patch } };
        });
    };

    const handlePostPayrollRunPaymentBatch = (runId: string) => {
        const run = payrollRuns.find(r => r.id === runId);
        if (!run) return alert(tr('دفعة الرواتب غير موجودة', 'Payroll run not found.'));
        const batch = run.paymentBatch;
        if (!batch) return alert(tr('أنشئ دفعة الدفع أولًا.', 'Create payment batch first.'));
        if (batch.status === 'POSTED') return alert(tr('تم ترحيل دفعة الدفع مسبقًا.', 'Payment batch is already posted.'));

        const paymentAccId = batch.paymentAccountId || paymentAccountId;
        if (!paymentAccId) return alert(tr('يرجى اختيار حساب الصرف لدفعة الدفع.', 'Please choose payment account for the payment batch.'));

        const preview = getPayrollRunPaymentBatchPreview(run);
        if (!preview) return;
        const payableLines = preview.lines.filter(line => line.status === 'READY');
        if (payableLines.length === 0) {
            return alert(tr('لا توجد أسطر جاهزة للصرف داخل دفعة الدفع.', 'No payment-ready lines found in this payment batch.'));
        }

        const confirmMsg = tr(
            `سيتم صرف ${payableLines.length} موظف ضمن ${batch.batchNumber} بإجمالي ${payableLines.reduce((s, l) => s + l.amount, 0).toLocaleString()} ${baseCurrency}. هل تريد المتابعة؟`,
            `${payableLines.length} employees will be paid via ${batch.batchNumber} totaling ${payableLines.reduce((s, l) => s + l.amount, 0).toLocaleString()} ${baseCurrency}. Continue?`
        );
        if (!confirm(confirmMsg)) return;

        setIsProcessing(true);
        setTimeout(() => {
            let successCount = 0;
            let failedCount = 0;
            payableLines.forEach(line => {
                const employee = employees.find(e => e.id === line.employeeId);
                if (!employee) {
                    failedCount++;
                    return;
                }
                const result = addTransaction({
                    voucherId: run.id,
                    amount: line.amount,
                    description: `${tr('صرف دفعة رواتب', 'Payroll Batch Payment')} ${run.runNumber} / ${batch.batchNumber} - ${employee.name} (${line.periodStart} / ${line.periodEnd})`,
                    category: 'salary_payment',
                    type: TransactionType.EXPENSE,
                    date: batch.paymentDate || run.postingDate || todayIso,
                    debitAccountId: 'acc_accrued_salaries',
                    creditAccountId: paymentAccId,
                    currency: baseCurrency,
                    exchangeRate: 1,
                    status: 'POSTED',
                    employeeId: employee.id,
                    contactId: getEmployeeContactId(employee)
                });
                if (result.ok) successCount++;
                else failedCount++;
            });

            updatePayrollRunRecord(runId, r => {
                if (!r.paymentBatch) return r;
                return {
                    ...r,
                    paymentBatch: {
                        ...r.paymentBatch,
                        status: 'POSTED',
                        paymentAccountId: paymentAccId,
                        postedAt: new Date().toISOString(),
                        postedCount: successCount
                    }
                };
            });

            setIsProcessing(false);
            alert(tr(
                `?? ????? ???? ????? ????? (${successCount})${failedCount ? ` - ??? ${failedCount}` : ''}`,
                `Payment batch posted successfully (${successCount})${failedCount ? ` - failed ${failedCount}` : ''}`
            ));
        }, 250);
    };

    const exportPayrollRunBankTransfer = (runId: string, format: 'CSV' | 'XLSX') => {
        const run = payrollRuns.find(r => r.id === runId);
        if (!run) return alert(tr('دفعة الرواتب غير موجودة', 'Payroll run not found.'));
        if (!run.paymentBatch) return alert(tr('أنشئ دفعة الدفع أولًا ثم صدّر ملف التحويل البنكي.', 'Create a payment batch first, then export bank transfer file.'));

        const preview = getPayrollRunPaymentBatchPreview(run);
        if (!preview) return;
        const rows = preview.lines
            .filter(line => line.canExportBank)
            .map(line => ({
                BatchNo: preview.batch?.batchNumber || '',
                RunNo: run.runNumber,
                PaymentDate: (preview.batch?.paymentDate || run.postingDate || todayIso),
                EmployeeCode: line.employeeCode,
                EmployeeName: line.employeeName,
                BankName: line.bankName || '',
                IBAN: line.iban || '',
                Amount: Number(line.amount.toFixed(2)),
                Currency: baseCurrency,
                Description: `${tr('راتب', 'Salary')} ${run.periodStart} / ${run.periodEnd}`
            }));

        if (rows.length === 0) {
            return alert(tr('لا توجد أسطر قابلة لتصدير التحويل البنكي (تحقق من IBAN).', 'No bank-transfer-exportable lines found (check IBAN).'));
        }

        const safeRunNo = (run.runNumber || 'payroll').replace(/[^\w\-]+/g, '_');
        if (format === 'CSV') {
            const headers = Object.keys(rows[0]);
            const csvEscape = (value: unknown) => {
                const s = String(value ?? '');
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const csv = [headers, ...rows.map(r => headers.map(h => (r as any)[h]))]
                .map(cols => cols.map(csvEscape).join(','))
                .join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `payroll_bank_transfer_${safeRunNo}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            updatePayrollRunPaymentBatch(runId, { exportedCsvAt: new Date().toISOString() });
            return;
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'PayrollTransfer');
        downloadWorkbookFile(wb, { fileName: `payroll_bank_transfer_${safeRunNo}.xlsx` });
        updatePayrollRunPaymentBatch(runId, { exportedExcelAt: new Date().toISOString() });
    };

    const handlePostPayrollRun = (runId: string) => {
        const run = payrollRuns.find(r => r.id === runId);
        if (!run) return alert(tr('دفعة الرواتب غير موجودة', 'Payroll run not found.'));
        if (run.status === 'LOCKED') return alert(tr('دفعة الرواتب مقفلة', 'Payroll run is locked.'));
        if (run.status === 'POSTED' && editingPayrollRunId !== runId) {
            return alert(tr('تم ترحيل هذه الدفعة مسبقًا', 'This payroll run is already posted.'));
        }

        const targetEmployees = run.employeeIds
            .map(id => employees.find(e => e.id === id))
            .filter((e): e is Employee => !!e);
        if (targetEmployees.length === 0) {
            return alert(tr('لا يوجد موظفون صالحون في هذه الدفعة', 'No valid employees in this payroll run.'));
        }

        handlePersistPayrollRun(targetEmployees, runId);
    };

    const handleLockPayrollRun = (runId: string) => {
        const run = payrollRuns.find(r => r.id === runId);
        if (!run) return;
        if (run.status !== 'POSTED') {
            return alert(tr('لا يمكن قفل الدفعة قبل الترحيل.', 'Cannot lock payroll run before posting.'));
        }
        updatePayrollRunRecord(runId, r => ({ ...r, status: 'LOCKED', lockedAt: new Date().toISOString() }));
    };

    const handleDeletePayrollRun = (runId: string) => {
        const run = payrollRuns.find(r => r.id === runId);
        if (!run) return;
        if (run.status === 'LOCKED') return alert(tr('لا يمكن حذف دفعة مقفلة.', 'Cannot delete a locked payroll run.'));
        if (!confirm(tr('هل تريد حذف دفعة الرواتب؟', 'Delete payroll run?'))) return;
        clearPayrollRunArtifacts(run);
        setPayrollRuns(prev => prev.filter(r => r.id !== runId));
        setSelectedPayrollRunId(prev => (prev === runId ? null : prev));
        setEditingPayrollRunId(prev => (prev === runId ? null : prev));
    };

    const renderPayroll = () => {
        const payrollEmployees = employees.filter(e => {
            if (payrollFocusEmployeeId && e.id !== payrollFocusEmployeeId) return false;
            if (payrollPayBasisFilter !== 'ALL' && getEmployeePayBasis(e) !== payrollPayBasisFilter) return false;
            return true;
        });
        const unaccruedEmployees = payrollEmployees.filter(e => {
            const range = getEmployeePayrollRange(e.id);
            return !isEmployeeAccrued(e.id, range) && !isEmployeePaid(e.id, range);
        });
        const directEligibleEmployees = unaccruedEmployees.filter(e => calculateEmployeeBreakdown(e).deductions <= 0);
        const totalUnaccruedAmount = unaccruedEmployees.reduce((s, e) => s + calculateEmployeeBreakdown(e).net, 0);
        const totalPayrollAmount = payrollEmployees.reduce((s, e) => s + calculateEmployeeBreakdown(e).net, 0);
        const unpaidEmployees = payrollEmployees.filter(e => {
            const range = getEmployeePayrollRange(e.id);
            return isEmployeeAccrued(e.id, range) && !isEmployeePaid(e.id, range);
        });
        const payrollRunsSorted = payrollRuns.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        const selectedPayrollRun = payrollRunsSorted.find(r => r.id === selectedPayrollRunId) || payrollRunsSorted[0] || null;
        const editingPayrollRun = editingPayrollRunId ? payrollRuns.find(r => r.id === editingPayrollRunId) || null : null;
        const selectedPayrollRunPaymentPreview = selectedPayrollRun ? getPayrollRunPaymentBatchPreview(selectedPayrollRun) : null;

        return (
            <div className="space-y-3 sm:space-y-4 animate-in slide-in-from-bottom-4">
                <div className="bg-slate-900 p-3 sm:p-4 rounded-[1.5rem] sm:rounded-[2rem] text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute right-0 top-0 opacity-10"><DollarSign size={110} /></div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-base sm:text-lg font-black text-emerald-400">{tr('مسير الرواتب الذكي', 'Smart Payroll Run')}</h3>
                            <button onClick={() => setPayrollRows({})} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 text-white/60 hover:text-white transition-all"><RefreshCw size={16} /></button>
                        </div>

                        <div className="bg-white/5 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-white/5 mb-3 space-y-2">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">{tr('نوع الفترة', 'Period Mode')}</label>
                                    <select
                                        value={payrollPeriodPreset}
                                        onChange={e => applyPayrollPeriodPreset(e.target.value as PayrollPeriodPreset)}
                                        className="w-full h-10 px-2 bg-slate-800/50 border border-white/10 rounded-xl text-xs font-black outline-none text-white text-right focus:border-emerald-500/50 transition-all"
                                    >
                                        <option value="MONTHLY" className="text-slate-800">{tr('شهري', 'Monthly')}</option>
                                        <option value="WEEKLY" className="text-slate-800">{tr('أسبوعي', 'Weekly')}</option>
                                        <option value="DAILY" className="text-slate-800">{tr('يومي', 'Daily')}</option>
                                        <option value="CUSTOM" className="text-slate-800">{tr('من تاريخ إلى تاريخ', 'Custom date range')}</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">{tr('فلتر نوع الأجر', 'Pay Basis Filter')}</label>
                                    <select
                                        value={payrollPayBasisFilter}
                                        onChange={e => setPayrollPayBasisFilter(e.target.value as ('ALL' | EmployeePayBasis))}
                                        className="w-full h-10 px-2 bg-slate-800/50 border border-white/10 rounded-xl text-xs font-black outline-none text-white text-right focus:border-emerald-500/50 transition-all"
                                    >
                                        <option value="ALL" className="text-slate-800">{tr('الكل', 'All')}</option>
                                        <option value="FIXED_MONTHLY" className="text-slate-800">{tr('راتب شهري ثابت', 'Fixed Monthly')}</option>
                                        <option value="MONTHLY_PRORATED" className="text-slate-800">{tr('شهري نسبي', 'Monthly Prorated')}</option>
                                        <option value="MONTHLY_BY_HOURS" className="text-slate-800">{tr('شهري حسب الساعات', 'Monthly by Hours')}</option>
                                        <option value="DAILY" className="text-slate-800">{tr('يومي', 'Daily')}</option>
                                        <option value="WEEKLY" className="text-slate-800">{tr('أسبوعي', 'Weekly')}</option>
                                        <option value="HOURLY" className="text-slate-800">{tr('بالساعة', 'Hourly')}</option>
                                        <option value="COMMISSION" className="text-slate-800">{tr('ثابت + نسبة', 'Fixed + Commission')}</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">{tr('نطاق الاحتساب', 'Calculation Scope')}</label>
                                    <select value={payrollFocusEmployeeId} onChange={e => setPayrollFocusEmployeeId(e.target.value)} className="w-full h-10 px-2 bg-slate-800/50 border border-white/10 rounded-xl text-xs font-black outline-none text-white text-right focus:border-emerald-500/50 transition-all">
                                        <option value="" className="text-slate-800">{tr('جميع الموظفين', 'All Employees')}</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id} className="text-slate-800">{emp.code} - {emp.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">{tr('بداية الفترة', 'Period Start')}</label>
                                    <EnglishDateInput
                                        value={payrollStartDate}
                                        onChange={(value) => { setPayrollPeriodPreset('CUSTOM'); setPayrollStartDate(value); }}
                                        className="w-full h-10 px-2 bg-slate-800/50 border border-white/10 rounded-xl text-xs font-bold outline-none text-white text-right focus:border-emerald-500/50 transition-all"
                                        calendarButtonClassName="bg-white/10 hover:bg-white/20 text-emerald-300"
                                        aria-label={tr('بداية الفترة', 'Period start')}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">{tr('نهاية الفترة', 'Period End')}</label>
                                    <EnglishDateInput
                                        value={payrollEndDate}
                                        onChange={(value) => { setPayrollPeriodPreset('CUSTOM'); setPayrollEndDate(value); }}
                                        className="w-full h-10 px-2 bg-slate-800/50 border border-white/10 rounded-xl text-xs font-bold outline-none text-white text-right focus:border-emerald-500/50 transition-all"
                                        calendarButtonClassName="bg-white/10 hover:bg-white/20 text-emerald-300"
                                        aria-label={tr('نهاية الفترة', 'Period end')}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-300 bg-slate-800/30 border border-white/5 rounded-xl px-2.5 py-1.5">
                                <span>{tr('الفترة الحالية', 'Current Period')}</span>
                                <span className="dir-ltr">{payrollStartDate} / {payrollEndDate}</span>
                            </div>
                            {editingPayrollRun && (
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[10px] font-black text-amber-100 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
                                    <span>{tr(`أنت تعدل كشف الرواتب ${editingPayrollRun.runNumber}. عند الحفظ سيتم تحديثه وترحيله مباشرة.`, `You are editing payroll run ${editingPayrollRun.runNumber}. Saving will update and post it directly.`)}</span>
                                    <button
                                        type="button"
                                        onClick={() => setEditingPayrollRunId(null)}
                                        className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white text-[10px] font-black border border-white/10 hover:bg-white/15"
                                    >
                                        {tr('إلغاء وضع التعديل', 'Cancel Edit Mode')}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">{tr('حساب الصرف (للدفع فقط)', 'Payment Account (for disbursement only)')}</label>
                                <select value={paymentAccountId} onChange={e => setPaymentAccountId(e.target.value)} className="w-full h-10 px-2 bg-white/10 border border-white/10 rounded-xl text-xs font-black outline-none focus:bg-white/20 transition-all">
                                    <option value="" className="text-slate-800">{tr('-- اختر الخزينة/البنك --', '-- Select Cash/Bank --')}</option>
                                    {accounts.filter(a => !a.isGroup && a.type === 'ASSET' && (a.parentId === 'acc_cash_root' || a.parentId === 'acc_bank_root')).map(acc => (
                                        <option key={acc.id} value={acc.id} className="text-slate-800">{displayAccountName(acc)} ({acc.currency})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">{tr('حساب المصروف (للاستحقاق)', 'Expense Account (for accrual)')}</label>
                                <select value={expenseAccountId} onChange={e => setExpenseAccountId(e.target.value)} className="w-full h-10 px-2 bg-white/10 border border-white/10 rounded-xl text-xs font-black outline-none focus:bg-white/20 transition-all text-emerald-400">
                                    <option value="" className="text-slate-800">{tr('-- اختر حساب المصروف --', '-- Select Expense Account --')}</option>
                                    {accounts.filter(a => !a.isGroup && a.type === 'EXPENSE').map(acc => (
                                        <option key={acc.id} value={acc.id} className="text-slate-800">{displayAccountName(acc)} ({acc.code})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                            <button onClick={importHoursFromAttendance} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
                                <RefreshCw size={14} className={isProcessing ? 'animate-spin' : ''} />
                                {tr('تحديث من الحضور', 'Update from Attendance')}
                            </button>
                            <div className="grid grid-cols-2 gap-2 text-left min-w-0">
                                <div>
                                    <span className="text-[9px] text-slate-400 font-black uppercase mb-1 block">{tr('إجمالي صافي الاحتساب', 'Total Net Calculation')}</span>
                                    <h2 className="text-lg sm:text-xl font-black dir-ltr text-cyan-300">{totalPayrollAmount.toLocaleString()}</h2>
                                </div>
                                <div>
                                    <span className="text-[9px] text-slate-400 font-black uppercase mb-1 block">{tr('المتبقي للاستحقاق', 'Remaining to Accrue')}</span>
                                    <h2 className="text-lg sm:text-xl font-black dir-ltr text-emerald-400">{totalUnaccruedAmount.toLocaleString()}</h2>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {false && (
                <div className="bg-white p-3 sm:p-4 rounded-[1.2rem] sm:rounded-[1.8rem] border border-gray-100 shadow-sm space-y-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                        <div>
                            <h3 className="font-black text-sm text-gray-800">{tr('دفعات الرواتب الشهرية (Payroll Run)', 'Monthly Payroll Runs')}</h3>
                            <p className="text-[10px] font-bold text-gray-400">{tr('ترحيل مباشر فقط مع إمكانية التعديل أو الحذف ثم القفل', 'Direct posting only with edit/delete support before lock')}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {editingPayrollRun && (
                                <button
                                    onClick={() => setEditingPayrollRunId(null)}
                                    className="px-3 py-2 rounded-xl bg-white text-slate-700 text-xs font-black border border-slate-200 hover:bg-slate-50 transition-all"
                                >
                                    {tr('إلغاء التعديل', 'Cancel Edit')}
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    const editingRun = editingPayrollRunId ? payrollRuns.find(run => run.id === editingPayrollRunId) || null : null;
                                    const targetEmployees = editingRun
                                        ? editingRun.employeeIds.map(id => employees.find(emp => emp.id === id)).filter((emp): emp is Employee => !!emp)
                                        : payrollEmployees;
                                    handlePersistPayrollRun(targetEmployees, editingPayrollRunId || undefined);
                                }}
                                className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                            >
                                {editingPayrollRun ? tr('حفظ التعديل وترحيل الدفعة', 'Save Edit & Post Run') : tr('ترحيل دفعة الرواتب', 'Post Payroll Run')}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                            {payrollRunsSorted.length === 0 && (
                                <div className="text-center text-gray-400 text-sm font-bold py-8 bg-gray-50 rounded-2xl border border-gray-100">
                                    {tr('لا توجد دفعات رواتب محفوظة بعد', 'No payroll runs saved yet')}
                                </div>
                            )}
                            {payrollRunsSorted.map(run => (
                                <button
                                    key={run.id}
                                    onClick={() => setSelectedPayrollRunId(run.id)}
                                    className={`w-full text-right p-4 rounded-2xl border transition-all ${selectedPayrollRun?.id === run.id ? 'border-indigo-200 bg-indigo-50/60' : 'border-gray-100 bg-gray-50/40 hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="font-black text-xs text-gray-800 dir-ltr">{run.runNumber}</span>
                                        <span className={`text-[10px] px-2 py-1 rounded-lg font-black ${run.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                                                run.status === 'REVIEWED' ? 'bg-amber-100 text-amber-700' :
                                                    run.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700' :
                                                        'bg-slate-100 text-slate-700'
                                            }`}>
                                            {run.status === 'DRAFT' ? tr('قيد التحضير', 'Preparing')
                                                : run.status === 'REVIEWED' ? tr('قيد التعديل', 'Editing')
                                                    : run.status === 'POSTED' ? tr('مرحل', 'Posted')
                                                        : tr('مقفلة', 'Locked')}
                                        </span>
                                    </div>
                                    <div className="text-[10px] font-bold text-gray-400">{run.periodStart} - {run.periodEnd} - {tr('??? ????????', 'Employees')}: {run.employeeIds.length}</div>
                                    <div className="text-[10px] font-bold text-gray-500 mt-1">{tr('الصافي', 'Net')}: <span className="dir-ltr text-indigo-600">{run.totals.net.toLocaleString()} {baseCurrency}</span></div>
                                </button>
                            ))}
                        </div>

                        <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/40 min-w-0">
                            {!selectedPayrollRun && (
                                <div className="text-center text-gray-400 text-sm font-bold py-12">{tr('اختر دفعة لعرض التفاصيل', 'Select a payroll run to view details')}</div>
                            )}
                            {selectedPayrollRun && (
                                <div className="space-y-4">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                        <div>
                                            <div className="font-black text-sm text-gray-800 dir-ltr">{selectedPayrollRun.runNumber}</div>
                                            <div className="text-[10px] font-bold text-gray-400">{selectedPayrollRun.periodStart} - {selectedPayrollRun.periodEnd} - {tr('????? ???????', 'Posting Date')}: {selectedPayrollRun.postingDate}</div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(selectedPayrollRun.status === 'DRAFT' || selectedPayrollRun.status === 'REVIEWED') && (
                                                <button onClick={() => handlePostPayrollRun(selectedPayrollRun.id)} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black">{tr('ترحيل الدفعة', 'Post Run')}</button>
                                            )}
                                            {selectedPayrollRun.status === 'POSTED' && (
                                                <button onClick={() => handleStartEditPayrollRun(selectedPayrollRun.id)} className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 text-xs font-black">{tr('تعديل', 'Edit')}</button>
                                            )}
                                            {selectedPayrollRun.status === 'POSTED' && (
                                                <button onClick={() => handleLockPayrollRun(selectedPayrollRun.id)} className="px-3 py-2 rounded-xl bg-slate-900 text-white border border-slate-900 text-xs font-black">{tr('قفل الدفعة', 'Lock Run')}</button>
                                            )}
                                            {selectedPayrollRun.status !== 'LOCKED' && (
                                                <button onClick={() => handleDeletePayrollRun(selectedPayrollRun.id)} className="px-3 py-2 rounded-xl bg-white text-rose-600 border border-rose-100 text-xs font-black">{tr('حذف', 'Delete')}</button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                                            <div className="text-[10px] text-gray-400 font-black mb-1">{tr('الإجمالي قبل الخصومات', 'Gross Total')}</div>
                                            <div className="font-black text-sm text-gray-800 dir-ltr">{selectedPayrollRun.totals.gross.toLocaleString()} {baseCurrency}</div>
                                        </div>
                                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                                            <div className="text-[10px] text-gray-400 font-black mb-1">{tr('إجمالي الخصومات', 'Total Deductions')}</div>
                                            <div className="font-black text-sm text-rose-600 dir-ltr">{selectedPayrollRun.totals.deductions.toLocaleString()} {baseCurrency}</div>
                                        </div>
                                        <div className="bg-white rounded-xl p-3 border border-gray-100">
                                            <div className="text-[10px] text-gray-400 font-black mb-1">{tr('صافي الدفعة', 'Run Net')}</div>
                                            <div className="font-black text-sm text-emerald-600 dir-ltr">{selectedPayrollRun.totals.net.toLocaleString()} {baseCurrency}</div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-2xl border border-blue-100 p-4 space-y-4">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                            <div>
                                                <div className="font-black text-sm text-gray-800">{tr('دفعة الدفع الجماعي المرتبطة', 'Linked Payroll Payment Batch')}</div>
                                                <div className="text-[10px] font-bold text-gray-400">
                                                    {tr('ترتبط بنفس Payroll Run وتُستخدم للترحيل الجماعي والتصدير البنكي', 'Linked to the same payroll run for batch payment posting and bank export')}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {!selectedPayrollRun.paymentBatch && (selectedPayrollRun.status === 'POSTED' || selectedPayrollRun.status === 'LOCKED') && (
                                                    <button
                                                        onClick={() => handleCreatePayrollRunPaymentBatch(selectedPayrollRun.id)}
                                                        className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700"
                                                    >
                                                        {tr('إنشاء دفعة دفع', 'Create Payment Batch')}
                                                    </button>
                                                )}
                                                {selectedPayrollRun.paymentBatch && selectedPayrollRun.paymentBatch.status === 'DRAFT' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleCreatePayrollRunPaymentBatch(selectedPayrollRun.id)}
                                                            className="px-3 py-2 rounded-xl bg-white text-blue-700 border border-blue-100 text-xs font-black"
                                                        >
                                                            {tr('إعادة بناء الدفعة', 'Rebuild Batch')}
                                                        </button>
                                                        <button
                                                            onClick={() => handlePostPayrollRunPaymentBatch(selectedPayrollRun.id)}
                                                            className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black"
                                                        >
                                                            {tr('ترحيل دفعة الدفع', 'Post Payment Batch')}
                                                        </button>
                                                    </>
                                                )}
                                                {selectedPayrollRun.paymentBatch && (
                                                    <>
                                                        <button
                                                            onClick={() => exportPayrollRunBankTransfer(selectedPayrollRun.id, 'CSV')}
                                                            className="px-3 py-2 rounded-xl bg-white text-slate-700 border border-slate-200 text-xs font-black"
                                                        >
                                                            {tr('تصدير CSV', 'Export CSV')}
                                                        </button>
                                                        <button
                                                            onClick={() => exportPayrollRunBankTransfer(selectedPayrollRun.id, 'XLSX')}
                                                            className="px-3 py-2 rounded-xl bg-white text-indigo-700 border border-indigo-100 text-xs font-black"
                                                        >
                                                            {tr('تصدير Excel', 'Export Excel')}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {!selectedPayrollRun.paymentBatch && (
                                            <div className="text-[11px] font-bold text-gray-500 bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                                                {selectedPayrollRun.status === 'POSTED' || selectedPayrollRun.status === 'LOCKED'
                                                    ? tr('أنشئ دفعة الدفع لتجهيز الترحيل الجماعي وملف التحويل البنكي.', 'Create a payment batch to prepare mass payment posting and bank transfer export.')
                                                    : tr('ستظهر دفعة الدفع بعد ترحيل Payroll Run أولًا.', 'Payment batch becomes available after posting the payroll run first.')}
                                            </div>
                                        )}

                                        {selectedPayrollRun.paymentBatch && selectedPayrollRunPaymentPreview && (
                                            <>
                                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                        <div className="text-[10px] text-gray-400 font-black mb-1">{tr('رقم دفعة الدفع', 'Payment Batch No.')}</div>
                                                        <div className="font-black text-xs text-gray-800 dir-ltr">{selectedPayrollRun.paymentBatch.batchNumber}</div>
                                                        <div className={`mt-2 inline-flex px-2 py-1 rounded-lg text-[10px] font-black ${selectedPayrollRun.paymentBatch.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {selectedPayrollRun.paymentBatch.status === 'POSTED' ? tr('مرحل', 'Posted') : tr('قيد التحضير', 'Preparing')}
                                                        </div>
                                                    </div>
                                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                        <div className="text-[10px] text-gray-400 font-black mb-1">{tr('جاهز للصرف', 'Ready to Pay')}</div>
                                                        <div className="font-black text-sm text-emerald-600 dir-ltr">
                                                            {selectedPayrollRunPaymentPreview.summary.readyToPost}/{selectedPayrollRunPaymentPreview.summary.totalLines}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-gray-500 mt-1">
                                                            {tr('إجمالي قابل للتصدير البنكي', 'Bank-exportable total')}: <span className="dir-ltr text-indigo-600">{selectedPayrollRunPaymentPreview.summary.exportableAmount.toLocaleString()} {baseCurrency}</span>
                                                        </div>
                                                    </div>
                                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                        <div className="text-[10px] text-gray-400 font-black mb-1">{tr('IBAN', 'IBAN')}</div>
                                                        <div className="text-[10px] font-bold text-emerald-600">{tr('متوفر', 'Available')}: {selectedPayrollRunPaymentPreview.summary.withIban}</div>
                                                        <div className="text-[10px] font-bold text-rose-600">{tr('ناقص', 'Missing')}: {selectedPayrollRunPaymentPreview.summary.missingIban}</div>
                                                    </div>
                                                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                        <div className="text-[10px] text-gray-400 font-black mb-1">{tr('حالة التحقق', 'Validation Status')}</div>
                                                        <div className="text-[10px] font-bold text-slate-600">{tr('مصروف مسبقًا', 'Already paid')}: {selectedPayrollRunPaymentPreview.summary.alreadyPaid}</div>
                                                        <div className="text-[10px] font-bold text-amber-600">{tr('بدون استحقاق', 'Not accrued')}: {selectedPayrollRunPaymentPreview.summary.notAccrued}</div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-2 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3 min-w-0">
                                                        <label className="text-[10px] font-black text-gray-500 block px-1">{tr('تاريخ دفع الدفعة', 'Batch Payment Date')}</label>
                                                        <EnglishDateInput
                                                            value={selectedPayrollRun.paymentBatch.paymentDate}
                                                            onChange={(value) => updatePayrollRunPaymentBatch(selectedPayrollRun.id, { paymentDate: value })}
                                                            disabled={selectedPayrollRun.paymentBatch.status === 'POSTED'}
                                                            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none"
                                                        />
                                                    </div>
                                                    <div className="space-y-2 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3 min-w-0">
                                                        <label className="text-[10px] font-black text-gray-500 block px-1">{tr('حساب الصرف لدفعة الدفع', 'Payment account for batch')}</label>
                                                        <select
                                                            value={selectedPayrollRun.paymentBatch.paymentAccountId || ''}
                                                            onChange={e => updatePayrollRunPaymentBatch(selectedPayrollRun.id, { paymentAccountId: e.target.value || undefined })}
                                                            disabled={selectedPayrollRun.paymentBatch.status === 'POSTED'}
                                                            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-black outline-none"
                                                        >
                                                            <option value="">{tr('-- استخدم حساب الصرف العام --', '-- Use global payment account --')}</option>
                                                            {accounts.filter(a => !a.isGroup && a.type === 'ASSET' && (a.parentId === 'acc_cash_root' || a.parentId === 'acc_bank_root')).map(acc => (
                                                                <option key={acc.id} value={acc.id}>{displayAccountName(acc)} ({acc.currency})</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="max-h-[220px] overflow-auto rounded-xl border border-gray-100 bg-gray-50/40">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-white text-gray-500 sticky top-0">
                                                            <tr>
                                                                <th className="p-2 font-black text-right">{tr('الموظف', 'Employee')}</th>
                                                                <th className="p-2 font-black text-right">{tr('IBAN', 'IBAN')}</th>
                                                                <th className="p-2 font-black text-right">{tr('المبلغ', 'Amount')}</th>
                                                                <th className="p-2 font-black text-right">{tr('الحالة', 'Status')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {selectedPayrollRunPaymentPreview.lines.map(line => {
                                                                const statusText =
                                                                    line.status === 'READY' ? tr('جاهز', 'Ready')
                                                                        : line.status === 'ALREADY_PAID' ? tr('مصروف مسبقًا', 'Already paid')
                                                                            : line.status === 'NOT_ACCRUED' ? tr('بدون استحقاق', 'Not accrued')
                                                                                : line.status === 'MISSING_EMPLOYEE' ? tr('موظف مفقود', 'Missing employee')
                                                                                    : tr('مبلغ صفر', 'Zero amount');
                                                                const statusClass =
                                                                    line.status === 'READY' ? 'bg-emerald-100 text-emerald-700'
                                                                        : line.status === 'ALREADY_PAID' ? 'bg-indigo-100 text-indigo-700'
                                                                            : line.status === 'NOT_ACCRUED' ? 'bg-amber-100 text-amber-700'
                                                                                : 'bg-rose-100 text-rose-700';
                                                                return (
                                                                    <tr key={`${selectedPayrollRun.id}-${selectedPayrollRun.paymentBatch?.id}-${line.employeeId}`} className="border-t border-gray-100">
                                                                        <td className="p-2 font-bold text-gray-700">
                                                                            {line.employeeName}
                                                                            <div className="text-[10px] text-gray-400 dir-ltr">{line.employeeCode}</div>
                                                                        </td>
                                                                        <td className="p-2 font-bold text-gray-500 dir-ltr">{line.iban || '—'}</td>
                                                                        <td className="p-2 font-black text-gray-800 dir-ltr">{line.amount.toLocaleString()} {baseCurrency}</td>
                                                                        <td className="p-2">
                                                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${statusClass}`}>{statusText}</span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="max-h-[240px] overflow-auto rounded-xl border border-gray-100 bg-white">
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50 text-gray-500">
                                                <tr>
                                                    <th className="p-2 font-black text-right">{tr('الموظف', 'Employee')}</th>
                                                    <th className="p-2 font-black text-right">{tr('الفترة', 'Period')}</th>
                                                    <th className="p-2 font-black text-right">{tr('إجمالي', 'Gross')}</th>
                                                    <th className="p-2 font-black text-right">{tr('خصومات', 'Deductions')}</th>
                                                    <th className="p-2 font-black text-right">{tr('صافي', 'Net')}</th>
                                                    <th className="p-2 font-black text-right">{tr('إجراءات', 'Actions')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedPayrollRun.lines.map(line => (
                                                    <tr key={`${selectedPayrollRun.id}-${line.employeeId}`} className="border-t border-gray-50">
                                                        <td className="p-2 font-bold text-gray-700">{line.employeeName} <span className="text-[10px] text-gray-400 dir-ltr inline-block">{line.employeeCode}</span></td>
                                                        <td className="p-2 font-bold text-gray-500 dir-ltr">{line.periodStart} / {line.periodEnd}</td>
                                                        <td className="p-2 font-bold text-gray-700 dir-ltr">{line.gross.toLocaleString()}</td>
                                                        <td className="p-2 font-bold text-rose-600 dir-ltr">{line.deductions.toLocaleString()}</td>
                                                        <td className="p-2 font-black text-emerald-600 dir-ltr">{line.net.toLocaleString()}</td>
                                                        <td className="p-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openEmployeeStatementWithRange(line.employeeId, { startDate: line.periodStart, endDate: line.periodEnd })}
                                                                className="px-2 py-1 rounded-lg text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100"
                                                            >
                                                                {tr('كشف/طباعة', 'Statement/Print')}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}

                <div className="space-y-4">
                    {payrollEmployees.map(emp => {
                        const employeeRange = getEmployeePayrollRange(emp.id);
                        const {
                            regularPay, allowances, overtimePay, grossBeforeDeductions,
                            latePenaltyDeduction, duesSettlementDeduction,
                            autoLeaveDeduction, recurringDeductionsTotal, autoLeaveDeductionLine, recurringAutoDeductionLines,
                            net, deductions, row, payBasis, periodDays, workedDaysFromHours
                        } = calculateEmployeeBreakdown(emp);
                        const isExpanded = expandedRowId === emp.id;
                        const isAccrued = isEmployeeAccrued(emp.id, employeeRange);
                        const isPaid = isEmployeePaid(emp.id, employeeRange);
                        const hasPayrollDeductions = deductions > 0;
                        const duesSettlementAccount = accounts.find(a => a.id === row.duesSettlementAccountId);
                        const duesSettlementAccountBalance = getEmployeeAccountBalance(emp.id, row.duesSettlementAccountId);
                        const duesSettlementReceivableBalance = Math.max(0, duesSettlementAccountBalance);
                        const duesSettlementExceedsReceivable = duesSettlementDeduction > 0 && isReceivableAccount(row.duesSettlementAccountId) && duesSettlementDeduction > duesSettlementReceivableBalance;
                        const canEditFromStatement = !isAccrued && !isPaid;
                        const canEditBaseFromStatement = canEditFromStatement && ['FIXED_MONTHLY', 'MONTHLY_PRORATED', 'MONTHLY_BY_HOURS', 'COMMISSION'].includes(payBasis);
                        const hasVariableTimeInputs = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY_BY_HOURS'].includes(payBasis);
                        const showCalculationInputsCard = !canEditBaseFromStatement || hasVariableTimeInputs;
                        const statementInputClass = 'w-24 rounded-lg border border-current/20 bg-white px-2 py-1.5 text-[11px] font-black dir-ltr text-center outline-none';

                        return (
                            <div key={emp.id} className={`bg-white rounded-[2rem] border transition-all duration-300 shadow-sm ${isExpanded ? 'ring-2 ring-emerald-100 border-emerald-200' : isPaid ? 'border-emerald-100 bg-emerald-50/20' : isAccrued ? 'border-indigo-100 bg-indigo-50/20' : 'border-gray-50'}`}>
                                <div className="p-5 flex justify-between items-center cursor-pointer" onClick={() => setExpandedRowId(isExpanded ? null : emp.id)}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center font-black text-slate-400 border border-gray-100 relative">
                                            {emp.name.charAt(0)}
                                            {isPaid ? <div className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5"><CheckCircle2 size={12} /></div> :
                                                isAccrued ? <div className="absolute -top-1 -right-1 bg-indigo-500 text-white rounded-full p-0.5"><CheckCircle size={12} /></div> : null}
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                                                {emp.name}
                                                {isPaid ? <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-bold">{tr('تم الصرف', 'Paid')}</span> :
                                                    isAccrued ? <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-bold">{tr('مستحق (غير مدفوع)', 'Accrued (Unpaid)')}</span> : null}
                                            </h4>
                                            <p className="text-[10px] text-gray-400 font-bold">{emp.position} - {emp.code}</p>
                                        </div>
                                    </div>
                                    <div className="text-left flex flex-col items-end">
                                        <span className={`text-base font-black dir-ltr ${isPaid ? 'text-emerald-600' : isAccrued ? 'text-indigo-600' : 'text-slate-800'}`}>{net.toLocaleString()}</span>
                                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">{isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-5 pb-6 pt-2 space-y-4 animate-in slide-in-from-top-2">
                                        <div className="bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-indigo-700">{tr('فترة احتساب هذا الموظف', 'This employee calculation period')}</span>
                                                <button
                                                    onClick={() => updateEmployeePayrollRange(emp.id, { startDate: payrollStartDate, endDate: payrollEndDate })}
                                                    className="text-[9px] font-black bg-white text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100"
                                                >
                                                    {tr('استخدام الفترة العامة', 'Use global period')}
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <EnglishDateInput
                                                    value={employeePayrollRanges[emp.id]?.startDate || payrollStartDate}
                                                    onChange={value => updateEmployeePayrollRange(emp.id, { startDate: value })}
                                                    className="w-full p-2 bg-white rounded-xl border border-indigo-100 text-[10px] font-black outline-none"
                                                    aria-label={tr('بداية فترة الموظف', 'Employee period start')}
                                                />
                                                <EnglishDateInput
                                                    value={employeePayrollRanges[emp.id]?.endDate || payrollEndDate}
                                                    onChange={value => updateEmployeePayrollRange(emp.id, { endDate: value })}
                                                    className="w-full p-2 bg-white rounded-xl border border-indigo-100 text-[10px] font-black outline-none"
                                                    aria-label={tr('نهاية فترة الموظف', 'Employee period end')}
                                                />
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const imported = importSingleEmployeeHoursFromAttendance(emp, employeeRange);
                                                    alert(`${tr('تم احتساب ساعات', 'Hours calculated for')} ${emp.name} ${tr('للفترة', 'for period')} (${getRangeLabel(employeeRange)}) ${tr('بإجمالي', 'total')} ${imported.toFixed(2)} ${tr('ساعة', 'hours')} ?`);
                                                }}
                                                className="w-full py-2 bg-white text-indigo-700 rounded-xl text-[10px] font-black border border-indigo-100 hover:bg-indigo-100/40"
                                            >
                                                {tr('تحديث ساعات هذا الموظف من الحضور', 'Update this employee hours from attendance')}
                                            </button>
                                        </div>

                                        {showCalculationInputsCard && (
                                            <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-slate-600">{tr('مدخلات احتساب الراتب', 'Payroll Calculation Inputs')}</span>
                                                <span className="text-[10px] font-black text-indigo-600">{getPayBasisLabel(payBasis)}</span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                {!canEditBaseFromStatement && (payBasis === 'FIXED_MONTHLY' || payBasis === 'MONTHLY_PRORATED' || payBasis === 'MONTHLY_BY_HOURS' || payBasis === 'COMMISSION') && (
                                                    <div className="space-y-1 md:col-span-1">
                                                        <label className="text-[9px] font-black text-gray-400 px-1">
                                                            {payBasis === 'COMMISSION'
                                                                ? tr('قيمة العمل اليدوية (أساس النسبة)', 'Manual Work Value (Commission Base)')
                                                                : payBasis === 'MONTHLY_PRORATED'
                                                                    ? tr('الأجر الشهري (أساس النسبي)', 'Monthly Salary (Prorated Base)')
                                                                    : payBasis === 'MONTHLY_BY_HOURS'
                                                                        ? tr('الراتب الشهري (أساس الساعات)', 'Monthly Salary (Hours-based Base)')
                                                                        : tr('الراتب الأساسي للفترة', 'Base Salary for Period')}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            lang="en"
                                                            value={row.customBaseSalary || ''}
                                                            onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, customBaseSalary: parseLocalizedNumberInput(e.target.value) } }))}
                                                            className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-black text-slate-700 dir-ltr text-center outline-none"
                                                        />
                                                        {payBasis === 'COMMISSION' && (
                                                            <p className="text-[9px] font-black text-indigo-600 px-1">
                                                                {tr(
                                                                    `???? ${Number(emp.basicSalary || 0).toLocaleString()} ${baseCurrency} + (${Number((emp as any).commissionRatePercent || 0)}% ?? ???? ?????).`,
                                                                    `Fixed ${Number(emp.basicSalary || 0).toLocaleString()} ${baseCurrency} + (${Number((emp as any).commissionRatePercent || 0)}% of work value).`,
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                {hasVariableTimeInputs && (
                                                    <>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-gray-400 px-1">{tr('الساعات المحتسبة', 'Regular Hours')}</label>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                lang="en"
                                                                value={row.hours || ''}
                                                                onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, hours: parseLocalizedNumberInput(e.target.value) } }))}
                                                                className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-black text-slate-700 dir-ltr text-center outline-none"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-gray-400 px-1">{tr('ساعات إضافية', 'Overtime Hours')}</label>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                lang="en"
                                                                value={row.overtimeHours || ''}
                                                                onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, overtimeHours: parseLocalizedNumberInput(e.target.value) } }))}
                                                                className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-black text-slate-700 dir-ltr text-center outline-none"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-gray-400 px-1">{tr('ملخص المعدل', 'Rate Summary')}</label>
                                                            <div className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-black text-slate-600 text-center">
                                                                {payBasis === 'HOURLY'
                                                                    ? `${Number(emp.hourlyRate || 0).toLocaleString()} / ${tr('ساعة', 'hour')}`
                                                                    : payBasis === 'MONTHLY_BY_HOURS'
                                                                        ? (() => {
                                                                            const monthlyBase = Math.max(0, Number(row.customBaseSalary) || Number(emp.basicSalary) || 0);
                                                                            const stdHours = Math.max(1, (Number(emp.dailyWorkHours) || 8) * Math.max(1, monthlyWorkingDays || 30));
                                                                            const derivedHourly = monthlyBase / stdHours;
                                                                            return `${monthlyBase.toLocaleString()} ${tr('شهري', 'monthly')} (${derivedHourly.toFixed(2)} / ${tr('ساعة', 'hour')})`;
                                                                        })()
                                                                        : payBasis === 'DAILY'
                                                                            ? `${Number((emp as any).dailyRate || 0).toLocaleString()} / ${tr('يوم', 'day')}`
                                                                            : `${Number((emp as any).weeklyRate || 0).toLocaleString()} / ${tr('أسبوع', 'week')}`}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            </div>
                                        )}

                                        {false && !isAccrued && !isPaid && (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-2 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3 min-w-0">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase pr-1">{tr('مكافئات / إضافي مالي', 'Bonus / Additional Payment')}</label>
                                                        <input type="text" inputMode="decimal" lang="en" value={row.bonus || ''} onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, bonus: parseLocalizedNumberInput(e.target.value) } }))} className="w-full p-2.5 bg-white rounded-xl border border-emerald-100 text-xs font-black text-emerald-700 dir-ltr text-center outline-none focus:ring-2 ring-emerald-200" />
                                                    </div>
                                                    <div className="space-y-2 bg-rose-50/50 border border-rose-100 rounded-2xl p-3">
                                                        <label className="text-[9px] font-black text-rose-700 uppercase pr-1">{tr('خصم تأخير/جزاءات', 'Late Penalty Deduction')}</label>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                lang="en"
                                                                placeholder={tr('المبلغ', 'Amount')}
                                                                value={row.latePenaltyDeduction || ''}
                                                                onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, latePenaltyDeduction: parseLocalizedNumberInput(e.target.value) } }))}
                                                                className="w-full p-2.5 bg-white rounded-xl border border-rose-100 text-xs font-black text-rose-700 dir-ltr text-center outline-none focus:ring-2 ring-rose-200"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 gap-3">
                                                    <div className="space-y-2 bg-amber-50/50 border border-amber-100 rounded-2xl p-3">
                                                        <label className="text-[9px] font-black text-amber-700 uppercase pr-1">{tr('خصم تسوية ذمم', 'Dues Settlement Deduction')}</label>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                lang="en"
                                                                placeholder={tr('المبلغ', 'Amount')}
                                                                value={row.duesSettlementDeduction || ''}
                                                                onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, duesSettlementDeduction: parseLocalizedNumberInput(e.target.value) } }))}
                                                                className="w-full p-2.5 bg-white rounded-xl border border-amber-100 text-xs font-black text-amber-700 dir-ltr text-center outline-none focus:ring-2 ring-amber-200"
                                                            />
                                                            <select
                                                                value={row.duesSettlementAccountId || ''}
                                                                onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, duesSettlementAccountId: e.target.value } }))}
                                                                className="w-full p-2.5 bg-white rounded-xl border border-amber-100 text-[10px] font-black outline-none"
                                                            >
                                                                <option value="">{tr('-- حساب الذمة --', '-- Receivable Account --')}</option>
                                                                {accounts.filter(a => !a.isGroup && isReceivableAccount(a.id)).map(acc => (
                                                                    <option key={acc.id} value={acc.id}>{acc.code} - {displayAccountName(acc)}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        {!!row.duesSettlementAccountId && (
                                                            <div className="bg-white/80 border border-amber-100 rounded-xl px-2 py-1.5 flex items-center justify-between text-[10px] font-black">
                                                                <span className="text-amber-700">{tr('رصيد الموظف في', 'Employee balance in')} {displayAccountName(duesSettlementAccount || null) || tr('الحساب المختار', 'selected account')}</span>
                                                                <span className={`dir-ltr ${duesSettlementAccountBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{duesSettlementAccountBalance.toLocaleString()} {baseCurrency}</span>
                                                            </div>
                                                        )}
                                                        {isReceivableAccount(row.duesSettlementAccountId) && duesSettlementReceivableBalance > 0 && (
                                                            <button
                                                                onClick={() => setPayrollRows(p => ({
                                                                    ...p,
                                                                    [emp.id]: { ...row, duesSettlementDeduction: Math.min(duesSettlementReceivableBalance, Math.max(0, grossBeforeDeductions - latePenaltyDeduction)) }
                                                                }))}
                                                                className="w-full py-2 bg-white text-amber-700 rounded-xl text-[10px] font-black border border-amber-100 hover:bg-amber-100/60"
                                                            >
                                                                {tr('تعبئة من رصيد الذمم', 'Fill from receivable balance')} ({duesSettlementReceivableBalance.toLocaleString()})
                                                            </button>
                                                        )}
                                                        {duesSettlementExceedsReceivable && (
                                                            <p className="text-[10px] font-black text-rose-600">{tr('مبلغ تسوية الذمم أعلى من الرصيد المتاح.', 'Dues settlement amount exceeds available balance.')}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Calculator size={14} className="text-slate-400" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{tr('تفاصيل احتساب الراتب', 'Salary Calculation Details')}</span>
                                            </div>
                                            <div className="space-y-2 text-xs font-bold">
                                                {canEditFromStatement && (
                                                    <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-[10px] font-black text-indigo-600">
                                                        {tr('يمكنك التعديل مباشرة من هذا الكشف، وسيُعاد احتساب الصافي فورًا.', 'You can edit directly from this statement and the net will recalculate instantly.')}
                                                    </div>
                                                )}
                                                {canEditFromStatement && (
                                                    <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-3">
                                                        <div className="text-[10px] font-black text-indigo-600">
                                                            {tr('تحكم سريع من كشف الراتب', 'Quick control from salary statement')}
                                                        </div>
                                                        {canEditBaseFromStatement && (
                                                            <div className="flex items-center justify-between gap-3 text-gray-600">
                                                                <span>{tr('تعديل أساس الأجر', 'Edit compensation base')}</span>
                                                                <input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    lang="en"
                                                                    value={row.customBaseSalary || ''}
                                                                    onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, customBaseSalary: parseLocalizedNumberInput(e.target.value) } }))}
                                                                    className={`${statementInputClass} text-gray-700`}
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex items-center justify-between gap-3 text-blue-600">
                                                            <span>{tr('حوافز ومكافآت', 'Bonus & Incentives')}</span>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                lang="en"
                                                                value={row.bonus || ''}
                                                                onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, bonus: parseLocalizedNumberInput(e.target.value) } }))}
                                                                className={`${statementInputClass} text-blue-700`}
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between gap-3 text-rose-600">
                                                            <span>{tr('خصم تأخير/جزاءات', 'Late Penalty Deduction')}</span>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                lang="en"
                                                                value={row.latePenaltyDeduction || ''}
                                                                onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, latePenaltyDeduction: parseLocalizedNumberInput(e.target.value) } }))}
                                                                className={`${statementInputClass} text-rose-700`}
                                                            />
                                                        </div>
                                                        <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/60 p-2.5 text-amber-700">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span>{tr('خصم تسوية ذمم', 'Dues Settlement Deduction')}</span>
                                                                <input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    lang="en"
                                                                    value={row.duesSettlementDeduction || ''}
                                                                    onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, duesSettlementDeduction: parseLocalizedNumberInput(e.target.value) } }))}
                                                                    className={`${statementInputClass} text-amber-700`}
                                                                />
                                                            </div>
                                                            <select
                                                                value={row.duesSettlementAccountId || ''}
                                                                onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, duesSettlementAccountId: e.target.value } }))}
                                                                className="w-full rounded-lg border border-amber-100 bg-white px-2 py-2 text-[10px] font-black outline-none"
                                                            >
                                                                <option value="">{tr('-- حساب الذمة --', '-- Receivable Account --')}</option>
                                                                {accounts.filter(a => !a.isGroup && isReceivableAccount(a.id)).map(acc => (
                                                                    <option key={acc.id} value={acc.id}>{acc.code} - {displayAccountName(acc)}</option>
                                                                ))}
                                                            </select>
                                                            {!!row.duesSettlementAccountId && (
                                                                <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-2 py-2 text-[10px] font-black">
                                                                    <span className="text-amber-700">{tr('رصيد الموظف في', 'Employee balance in')} {displayAccountName(duesSettlementAccount || null) || tr('الحساب المختار', 'selected account')}</span>
                                                                    <span className={`dir-ltr ${duesSettlementAccountBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{duesSettlementAccountBalance.toLocaleString()} {baseCurrency}</span>
                                                                </div>
                                                            )}
                                                            {isReceivableAccount(row.duesSettlementAccountId) && duesSettlementReceivableBalance > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPayrollRows(p => ({
                                                                        ...p,
                                                                        [emp.id]: { ...row, duesSettlementDeduction: Math.min(duesSettlementReceivableBalance, Math.max(0, grossBeforeDeductions - latePenaltyDeduction)) }
                                                                    }))}
                                                                    className="w-full rounded-lg border border-amber-100 bg-white px-2 py-2 text-[10px] font-black text-amber-700"
                                                                >
                                                                    {tr('تعبئة من رصيد الذمم', 'Fill from receivable balance')} ({duesSettlementReceivableBalance.toLocaleString()})
                                                                </button>
                                                            )}
                                                            {duesSettlementExceedsReceivable && (
                                                                <p className="text-[10px] font-black text-rose-600">{tr('مبلغ تسوية الذمم أعلى من الرصيد المتاح.', 'Dues settlement amount exceeds available balance.')}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-start justify-between gap-3 text-gray-600">
                                                    <span className="min-w-0 flex-1">
                                                        {tr('أساس الأجر', 'Compensation Base')} ({getPayBasisLabel(payBasis)})
                                                        {payBasis === 'HOURLY' ? ` (${row.hours}${tr('?', 'h')} x ${emp.hourlyRate})` : ''}
                                                        {payBasis === 'MONTHLY_BY_HOURS'
                                                            ? ` (${row.hours}${tr('س', 'h')} / ${Math.max(1, (Number(emp.dailyWorkHours) || 8) * Math.max(1, monthlyWorkingDays || 30))}${tr('س', 'h')})`
                                                            : ''}
                                                        {payBasis === 'DAILY' ? ` (${(workedDaysFromHours > 0 ? workedDaysFromHours : periodDays).toFixed(2)} ${tr('???', 'day')} x ${Number((emp as any).dailyRate || 0)})` : ''}
                                                        {payBasis === 'WEEKLY' ? ` (${(((workedDaysFromHours > 0 ? workedDaysFromHours : periodDays) / 7)).toFixed(2)} ${tr('?????', 'week')} x ${Number((emp as any).weeklyRate || 0)})` : ''}
                                                        {payBasis === 'MONTHLY_PRORATED' ? ` (${periodDays}/${monthlyWorkingDays})` : ''}
                                                        {payBasis === 'COMMISSION'
                                                            ? ` (${Number(emp.basicSalary || 0).toLocaleString()} + ${Number((emp as any).commissionRatePercent || 0)}% x ${Number(row.customBaseSalary || 0).toLocaleString()})`
                                                            : ''}
                                                        {payBasis === 'FIXED_MONTHLY' ? ` ${tr('(ثابت)', '(Fixed)')}` : ''}
                                                        :
                                                    </span>
                                                    {canEditBaseFromStatement ? (
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            lang="en"
                                                            value={row.customBaseSalary || ''}
                                                            onChange={e => setPayrollRows(p => ({ ...p, [emp.id]: { ...row, customBaseSalary: parseLocalizedNumberInput(e.target.value) } }))}
                                                            className={`${statementInputClass} text-gray-700`}
                                                        />
                                                    ) : (
                                                        <span dir="ltr">{regularPay.toLocaleString()}</span>
                                                    )}
                                                </div>
                                                <div className="flex justify-between text-gray-600"><span>{tr('إجمالي البدلات الثابتة', 'Total Fixed Allowances')}:</span><span dir="ltr">+{allowances.toLocaleString()}</span></div>
                                                {overtimePay > 0 && <div className="flex justify-between text-emerald-600"><span>{tr('ساعات إضافية', 'Overtime Hours')} ({row.overtimeHours}{tr('س', 'h')}):</span><span dir="ltr">+{overtimePay.toLocaleString()}</span></div>}
                                                <div className="flex justify-between text-blue-600"><span>{tr('حوافز ومكافئات', 'Bonus & Incentives')}:</span><span dir="ltr">+{row.bonus.toLocaleString()}</span></div>
                                                <div className="flex justify-between text-rose-600"><span>{tr('خصم تأخير/جزاءات', 'Late Penalty Deduction')}:</span><span dir="ltr">-{latePenaltyDeduction.toLocaleString()}</span></div>
                                                <div className="flex justify-between text-amber-700"><span>{tr('خصم تسوية ذمم', 'Dues Settlement Deduction')}:</span><span dir="ltr">-{duesSettlementDeduction.toLocaleString()}</span></div>
                                                {autoLeaveDeduction > 0 && (
                                                    <div className="flex justify-between text-rose-700">
                                                        <span>{autoLeaveDeductionLine?.label || tr('خصم إجازة بدون راتب', 'Unpaid Leave Deduction')}:</span>
                                                        <span dir="ltr">-{autoLeaveDeduction.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {recurringAutoDeductionLines.map(line => (
                                                    <div key={line.key} className="flex justify-between text-fuchsia-700">
                                                        <span>{line.label} {line.source === 'recurring' ? tr('(متكرر)', '(recurring)') : ''}:</span>
                                                        <span dir="ltr">-{line.amount.toLocaleString()}</span>
                                                    </div>
                                                ))}
                                                {recurringDeductionsTotal > 0 && (
                                                    <div className="flex justify-between text-fuchsia-800">
                                                        <span>{tr('إجمالي الاستقطاعات المتكررة', 'Total Recurring Deductions')}:</span>
                                                        <span dir="ltr">-{recurringDeductionsTotal.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between text-rose-700"><span>{tr('إجمالي الخصومات', 'Total Deductions')}:</span><span dir="ltr">-{deductions.toLocaleString()}</span></div>
                                                <div className="pt-2 border-t border-gray-200 flex justify-between font-black text-slate-800 text-sm uppercase"><span>{tr('صافي المستحق النهائي', 'Final Net Due')}</span><span dir="ltr" className="text-emerald-600">{net.toLocaleString()} {baseCurrency}</span></div>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            {!isAccrued && !isPaid && (
                                                <>
                                                    <button
                                                        onClick={() => handleAccrueSingleEmployee(emp)}
                                                        className="flex-1 py-3 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <ListChecks size={14} /> {tr('ترحيل الاستحقاق', 'Post Accrual')}
                                                    </button>
                                                    {hasPayrollDeductions ? (
                                                        <div className="flex-1 py-3 bg-gray-50 border border-gray-100 text-gray-400 rounded-xl font-black text-[10px] flex items-center justify-center text-center">
                                                            {tr('يوجد خصم - استخدم الاستحقاق ثم الصرف', 'There is a deduction - use accrual then payment')}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handlePayDirectlySingleEmployee(emp)}
                                                            className="flex-1 py-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl font-black text-xs hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                                                        >
                                                            <Banknote size={14} /> {tr('استحقاق وصرف', 'Accrue & Pay')}
                                                        </button>
                                                    )}
                                                </>
                                            )}

                                            {isAccrued && !isPaid && (
                                                <button
                                                    onClick={() => handlePaySingleEmployee(emp)}
                                                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                                                >
                                                    <Banknote size={14} /> {tr('صرف الراتب', 'Pay Salary')}
                                                </button>
                                            )}

                                            {isPaid && (
                                                <div className="w-full py-3 bg-gray-50 text-gray-400 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-not-allowed">
                                                    <CheckCircle2 size={14} /> {tr('تم صرف الراتب', 'Salary Paid')}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                        onClick={() => handlePayrollAccrualProcess(payrollEmployees)}
                        disabled={isProcessing || unaccruedEmployees.length === 0}
                        className={`py-4 rounded-[1.5rem] font-black text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${unaccruedEmployees.length === 0 ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
                    >
                        {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <ListChecks size={16} />}
                        {tr('ترحيل استحقاق الجميع', 'Post Accrual for All')} ({unaccruedEmployees.length})
                    </button>

                    <button
                        onClick={() => handlePayrollPaymentProcess(payrollEmployees)}
                        disabled={isProcessing || !paymentAccountId}
                        className={`py-4 rounded-[1.5rem] font-black text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${!paymentAccountId ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'}`}
                    >
                        {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Banknote size={16} />}
                        {tr('صرف رواتب المستحقين', 'Pay Accrued Salaries')}
                    </button>

                    <button
                        onClick={() => handlePayrollDirectPaymentProcess(payrollEmployees)}
                        disabled={isProcessing || !paymentAccountId || !expenseAccountId || directEligibleEmployees.length === 0}
                        className={`py-4 rounded-[1.5rem] font-black text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${(!paymentAccountId || !expenseAccountId || directEligibleEmployees.length === 0) ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-200'}`}
                    >
                        {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Banknote size={16} />}
                        {tr('استحقاق وصرف مباشر', 'Direct Accrual & Pay')} ({directEligibleEmployees.length})
                    </button>
                </div>
            </div>
        );
    };

    const renderEmployees = () => {
        const inputAlignClass = isEnglish ? 'text-left' : 'text-right';
        const contractsExpiringSoon = employeeContracts
            .filter(c => c.status === 'ACTIVE' && c.contractType === 'FIXED_TERM' && !!c.endDate)
            .map(c => {
                const diffDays = Math.ceil((new Date(`${c.endDate}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000);
                return { contract: c, diffDays };
            })
            .filter(item => item.diffDays >= 0 && item.diffDays <= 30);
        const unpaidCurrentPayrollEmployees = employees.filter(emp => {
            const range = getEmployeePayrollRange(emp.id);
            return isEmployeeAccrued(emp.id, range) && !isEmployeePaid(emp.id, range);
        });
        const highAdvanceEmployees = employees.filter(emp => {
            const advanceLikeItems = employeeRecurringDeductions.filter(d =>
                d.employeeId === emp.id &&
                (d.type === 'ADVANCE' || d.type === 'LOAN') &&
                d.accountId &&
                isReceivableAccount(d.accountId) &&
                d.status !== 'CANCELLED'
            );
            if (!advanceLikeItems.length) return false;
            const receivableAccountIds = Array.from(new Set(advanceLikeItems.map(d => d.accountId!).filter(Boolean))) as string[];
            const totalReceivable = receivableAccountIds
                .reduce((sum, accountId) => sum + Math.max(0, getEmployeeAccountBalance(emp.id, accountId)), 0);
            const benchmark = Math.max(1, Number(emp.basicSalary) || 0);
            return totalReceivable >= benchmark;
        });

        return (
            <div className="space-y-2.5">
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder={tr('بحث في الموظفين...', 'Search employees...')}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className={`w-full h-10 px-3 pr-9 bg-white rounded-xl border border-gray-100 shadow-sm outline-none text-xs font-bold ${inputAlignClass}`}
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                    </div>
                    <button onClick={() => setShowEmpForm(true)} className="bg-blue-600 text-white w-10 h-10 rounded-xl shadow-sm active:scale-90 transition-all flex items-center justify-center"><UserPlus size={18} /></button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                    <div className="bg-white rounded-xl border border-amber-100 p-2.5 shadow-sm">
                        <div className="text-[9px] font-black text-amber-600 mb-0.5">{tr('عقود قريبة', 'Expiring')}</div>
                        <div className="text-lg font-black text-amber-700 dir-ltr">{contractsExpiringSoon.length}</div>
                        <div className="hidden sm:block text-[10px] text-gray-400 font-bold mt-1">
                            {contractsExpiringSoon[0]
                                ? `${employees.find(e => e.id === contractsExpiringSoon[0].contract.employeeId)?.name || ''} (${contractsExpiringSoon[0].diffDays} ${tr('يوم', 'days')})`
                                : tr('لا توجد عقود تنتهي قريبًا', 'No contracts expiring soon')}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-indigo-100 p-2.5 shadow-sm">
                        <div className="text-[9px] font-black text-indigo-600 mb-0.5">{tr('رواتب معلقة', 'Unpaid')}</div>
                        <div className="text-lg font-black text-indigo-700 dir-ltr">{unpaidCurrentPayrollEmployees.length}</div>
                        <div className="hidden sm:block text-[10px] text-gray-400 font-bold mt-1">{tr('حسب فترة الرواتب الحالية لكل موظف', 'Based on current payroll period per employee')}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-rose-100 p-2.5 shadow-sm">
                        <div className="text-[9px] font-black text-rose-600 mb-0.5">{tr('سلف مرتفعة', 'High loans')}</div>
                        <div className="text-lg font-black text-rose-700 dir-ltr">{highAdvanceEmployees.length}</div>
                        <div className="hidden sm:block text-[10px] text-gray-400 font-bold mt-1">{tr('الرصيد الذممي >= الراتب الأساسي', 'Receivable balance >= base salary')}</div>
                    </div>
                </div>

                {showEmpForm && (
                    <div className="bg-white p-6 rounded-[2.5rem] border border-blue-100 shadow-xl animate-in zoom-in-95 mx-1 mb-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-gray-800 text-lg">{tr('بيانات الموظف', 'Employee Details')}</h3>
                            <button onClick={() => { resetEmpForm(); setShowEmpForm(false); }} className="text-gray-400"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleEmployeeSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('اسم الموظف', 'Employee Name')} className={`w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm ${inputAlignClass}`} required />
                                <input value={code} onChange={e => setCode(e.target.value)} placeholder={tr('الرقم الوظيفي', 'Employee Code')} className={`w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm ${inputAlignClass}`} required />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <select value={deptId} onChange={e => setDeptId(e.target.value)} className={`w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm ${inputAlignClass}`}>
                                    <option value="">{tr('القسم...', 'Department...')}</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                                <input value={position} onChange={e => setPosition(e.target.value)} placeholder={tr('المسمى الوظيفي', 'Job Title')} className={`w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm ${inputAlignClass}`} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input value={employeePhone} onChange={e => setEmployeePhone(e.target.value)} placeholder={tr('رقم الهاتف', 'Phone Number')} className={`w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm ${inputAlignClass}`} />
                                <input value={employeeBankName} onChange={e => setEmployeeBankName(e.target.value)} placeholder={tr('اسم البنك', 'Bank Name')} className={`w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm ${inputAlignClass}`} />
                            </div>
                            <div>
                                <input value={employeeIban} onChange={e => setEmployeeIban(toEnglishDigits(e.target.value).toUpperCase())} placeholder={tr('IBAN / رقم الآيبان', 'IBAN')} className="w-full p-3 bg-gray-50 rounded-xl border-none outline-none font-bold text-sm dir-ltr text-left" />
                            </div>
                            <div className="bg-blue-50/50 p-5 rounded-3xl border border-blue-100 space-y-4">
                                <div className="flex items-center gap-2 mb-2"><Settings size={16} className="text-blue-600" /><h4 className="text-sm font-black text-blue-800">{tr('إعدادات الراتب والدوام', 'Salary and Work Setup')}</h4></div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-blue-700 block mb-1.5">{tr('طريقة احتساب الأجر', 'Payroll Compensation Basis')}</label>
                                    <select
                                        value={employeePayBasis}
                                        onChange={e => handleEmployeePayBasisChange(e.target.value as EmployeePayBasis)}
                                        className="w-full p-3 bg-white rounded-xl font-black text-xs border border-blue-200 outline-none"
                                    >
                                        <option value="FIXED_MONTHLY">{tr('راتب شهري ثابت', 'Fixed Monthly Salary')}</option>
                                        <option value="MONTHLY_PRORATED">{tr('أجر شهري (نسبي حسب الفترة)', 'Monthly (Prorated by period)')}</option>
                                        <option value="MONTHLY_BY_HOURS">{tr('راتب شهري حسب ساعات العمل', 'Monthly Salary by Worked Hours')}</option>
                                        <option value="DAILY">{tr('أجر يومي', 'Daily Wage')}</option>
                                        <option value="WEEKLY">{tr('أجر أسبوعي', 'Weekly Wage')}</option>
                                        <option value="HOURLY">{tr('أجر بالساعة', 'Hourly Wage')}</option>
                                        <option value="COMMISSION">{tr('راتب ثابت + نسبة من العمل', 'Fixed Salary + Commission')}</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-black text-gray-500 block mb-1.5">{tr('ساعات العمل اليومية', 'Daily Work Hours')}</label><input type="number" value={dailyHours} onChange={e => setDailyHours(e.target.value)} className="w-full p-3 bg-white rounded-xl font-black text-sm text-center border border-blue-200" placeholder="8" /></div>
                                    <div>
                                        <label className="text-[10px] font-black text-emerald-600 block mb-1.5">{getPayBasisInputLabel(employeePayBasis)}</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            lang="en"
                                            value={
                                                employeePayBasis === 'HOURLY' ? hourlyRate :
                                                    employeePayBasis === 'DAILY' ? dailyRate :
                                                        employeePayBasis === 'WEEKLY' ? weeklyRate :
                                                            employeePayBasis === 'COMMISSION' ? commissionRatePercent :
                                                                basicSalary
                                            }
                                            onChange={e => {
                                                const nextValue = toEnglishDigits(e.target.value);
                                                if (employeePayBasis === 'HOURLY') setHourlyRate(nextValue);
                                                else if (employeePayBasis === 'DAILY') setDailyRate(nextValue);
                                                else if (employeePayBasis === 'WEEKLY') setWeeklyRate(nextValue);
                                                else if (employeePayBasis === 'COMMISSION') setCommissionRatePercent(nextValue);
                                                else setBasicSalary(nextValue);
                                            }}
                                            className="w-full p-3 bg-white rounded-xl font-black text-sm text-center border border-emerald-200"
                                            placeholder={employeePayBasis === 'COMMISSION' ? '10' : '0'}
                                        />
                                    </div>
                                </div>
                                {employeePayBasis === 'COMMISSION' && (
                                    <div className="grid grid-cols-1 gap-2">
                                        <div>
                                            <label className="text-[10px] font-black text-emerald-600 block mb-1.5">{tr('الراتب الثابت', 'Fixed Salary')}</label>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                lang="en"
                                                value={basicSalary}
                                                onChange={e => setBasicSalary(toEnglishDigits(e.target.value))}
                                                className="w-full p-3 bg-white rounded-xl font-black text-sm text-center border border-emerald-200"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="bg-white/70 border border-blue-100 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-black">
                                    <span className="text-blue-700">{tr('النمط الحالي', 'Current Mode')}: {getPayBasisLabel(employeePayBasis)}</span>
                                    <span className="text-gray-500">
                                        {employeePayBasis === 'COMMISSION'
                                            ? tr('يتم احتساب الراتب = راتب ثابت + (نسبة × قيمة العمل اليدوية في كشف الراتب)', 'Salary = fixed salary + (% أ— manual work value in payroll statement)')
                                            : employeePayBasis === 'HOURLY'
                                                ? tr('يعتمد على ساعات العمل المسجلة', 'Uses recorded work hours')
                                                : employeePayBasis === 'MONTHLY_BY_HOURS'
                                                    ? tr('راتب شهري يُحتسب بنسبة الساعات المسجلة إلى ساعات الشهر القياسية', 'Monthly salary is prorated by worked hours vs standard monthly hours')
                                                    : employeePayBasis === 'MONTHLY_PRORATED'
                                                        ? tr('يحسب نسبيًا حسب فترة المسير', 'Calculated pro-rata by payroll period')
                                                        : tr('يمكن تعديل قيمة الاحتساب لكل موظف في المسير', 'You can override calculation base per employee in payroll run')}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-black text-gray-500 block mb-1.5">{tr('بدل سكن', 'Housing Allowance')}</label><input type="number" value={housing} onChange={e => setHousing(e.target.value)} className="w-full p-3 bg-white rounded-xl font-black text-xs text-center border border-gray-200" placeholder="0" /></div>
                                    <div><label className="text-[10px] font-black text-gray-500 block mb-1.5">{tr('بدل نقل', 'Transport Allowance')}</label><input type="number" value={transport} onChange={e => setTransport(e.target.value)} className="w-full p-3 bg-white rounded-xl font-black text-xs text-center border border-gray-200" placeholder="0" /></div>
                                </div>
                                {!editingId && (
                                    <div>
                                        <label className="text-[10px] font-black text-violet-700 block mb-1.5">{tr('نوع عقد مبدئي (للتعبئة التلقائية)', 'Initial contract type (auto-fill only)')}</label>
                                        <select
                                            value={employeeInitialContractType}
                                            onChange={e => handleEmployeeInitialContractTypeChange(e.target.value as 'FIXED_TERM' | 'OPEN_ENDED')}
                                            className="w-full p-3 bg-white rounded-xl font-black text-xs border border-violet-200 outline-none"
                                        >
                                            <option value="OPEN_ENDED">{tr('غير محدد المدة', 'Open-ended')}</option>
                                            <option value="FIXED_TERM">{tr('محدد المدة', 'Fixed-term')}</option>
                                        </select>
                                        <p className="mt-2 text-[10px] font-black text-violet-600">
                                            {tr('رصيد الإجازة السنوي يُعبّأ يدويًا من تبويب الإجازات لكل موظف.', 'Annual leave entitlement is filled manually from the Leaves tab per employee.')}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all">{editingId ? tr('حفظ التعديلات', 'Save Changes') : tr('حفظ الموظف', 'Save Employee')}</button>
                        </form>
                    </div>
                )}

                <div className="space-y-3">
                    {employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())).map(emp => (
                        <div key={emp.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-sm">{emp.name.charAt(0)}</div>
                                <div>
                                    <h4 className="font-black text-gray-800 text-sm">{emp.name}</h4>
                                    <div className="flex gap-2 text-[10px] font-bold text-gray-400 mt-1">
                                        <span>{emp.position}</span>
                                        <span className="text-gray-300">|</span>
                                        <span className="text-blue-500 dir-ltr">
                                            {formatEmployeeCompensationSummary(emp)}
                                        </span>
                                    </div>
                                    {(emp.bankName || emp.iban) && (
                                        <div className="text-[10px] font-bold text-gray-400 mt-1">
                                            {emp.bankName ? <span>{emp.bankName}</span> : null}
                                            {emp.bankName && emp.iban ? <span className="text-gray-300 mx-1">|</span> : null}
                                            {emp.iban ? <span className="dir-ltr text-left inline-block">{emp.iban}</span> : null}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEmployeeStatement(emp.id)} className="p-1.5 bg-gray-50 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-all"><FileText size={14} /></button>
                                <button onClick={() => openContractsManager(emp)} className="p-1.5 bg-gray-50 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all" title={tr('العقود وسجل الراتب', 'Contracts & Salary History')}><Briefcase size={14} /></button>
                                <button onClick={() => editEmployee(emp)} className="p-1.5 bg-gray-50 rounded-lg text-blue-500"><Edit2 size={14} /></button>
                                <button onClick={() => deleteEmployee(emp.id)} className="p-1.5 bg-gray-50 rounded-lg text-rose-500"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const editEmployee = (emp: Employee) => {
        const inferredContractType =
            employeeContracts
                .filter(c => c.employeeId === emp.id && c.status === 'ACTIVE')
                .slice()
                .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.contractType || 'OPEN_ENDED';
        setEditingId(emp.id); setName(emp.name); setCode(emp.code); setDeptId(emp.departmentId); setPosition(emp.position);
        setEmployeePhone(emp.phone || '');
        setEmployeeBankName(emp.bankName || '');
        setEmployeeIban(emp.iban || '');
        setEmployeeInitialContractType(inferredContractType);
        setEmployeePayBasis(getEmployeePayBasis(emp));
        setSalaryType(emp.salaryType || 'FIXED');
        setBasicSalary(emp.basicSalary.toString()); setDailyHours((emp.dailyWorkHours || 8).toString());
        setHousing(emp.housingAllowance.toString()); setTransport(emp.transportAllowance.toString());
        setHourlyRate(emp.hourlyRate.toString());
        setDailyRate(String((emp as any).dailyRate || 0));
        setWeeklyRate(String((emp as any).weeklyRate || 0));
        setCommissionRatePercent(String((emp as any).commissionRatePercent || 0));
        setOvertimeHourlyRate(emp.overtimeHourlyRate.toString());
        setShowEmpForm(true);
    };

    const resetEmpForm = () => {
        setName(''); setCode(''); setDeptId(''); setPosition(''); setEmployeePayBasis('FIXED_MONTHLY'); setSalaryType('FIXED'); setBasicSalary(''); setDailyHours('8'); setHousing(''); setTransport('');
        setEmployeePhone(''); setEmployeeBankName(''); setEmployeeIban('');
        setEmployeeInitialContractType('OPEN_ENDED');
        setHourlyRate(''); setDailyRate(''); setWeeklyRate(''); setCommissionRatePercent(''); setOvertimeHourlyRate(''); setEditingId(null);
    };

    const handleEmployeeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data = {
            name, code, departmentId: deptId || departments[0]?.id, position, salaryType,
            payBasis: employeePayBasis,
            basicSalary: parseFloat(basicSalary) || 0,
            dailyWorkHours: parseFloat(dailyHours) || 8, hourlyRate: parseFloat(hourlyRate) || 0, overtimeHourlyRate: parseFloat(overtimeHourlyRate) || 0,
            dailyRate: parseLocalizedNumberInput(dailyRate) || 0,
            weeklyRate: parseLocalizedNumberInput(weeklyRate) || 0,
            commissionRatePercent: parseLocalizedNumberInput(commissionRatePercent) || 0,
            housingAllowance: parseFloat(housing) || 0, transportAllowance: parseFloat(transport) || 0, otherAllowances: 0,
            hireDate: new Date().toISOString().split('T')[0], status: 'ACTIVE' as const,
            phone: employeePhone.trim() || undefined,
            bankName: employeeBankName.trim() || undefined,
            iban: employeeIban.trim() || undefined
        };
        if (editingId) {
            updateEmployee(editingId, data);
        } else {
            addEmployee(data);
        }
        resetEmpForm(); setShowEmpForm(false);
    };

    const handleEmployeeContractSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!contractsEmployeeId) return;
        const existingContractStatus = editingContractId
            ? (employeeContractsList.find(contract => contract.id === editingContractId)?.status || 'ACTIVE')
            : 'ACTIVE';
        const contractPayload = {
            employeeId: contractsEmployeeId,
            contractType,
            startDate: contractStartDate || new Date().toISOString().slice(0, 10),
            endDate: contractType === 'FIXED_TERM' ? (contractEndDate || undefined) : undefined,
            status: existingContractStatus as 'ACTIVE' | 'CLOSED',
            title: contractTitle.trim() || undefined,
            notes: contractNotes.trim() || undefined,
            salaryType: contractSalaryType,
            payBasis: contractPayBasis,
            basicSalary: parseLocalizedNumberInput(contractBasicSalary),
            dailyWorkHours: parseLocalizedNumberInput(contractDailyHours) || 8,
            hourlyRate: parseLocalizedNumberInput(contractHourlyRate),
            dailyRate: parseLocalizedNumberInput(contractDailyRate),
            weeklyRate: parseLocalizedNumberInput(contractWeeklyRate),
            commissionRatePercent: parseLocalizedNumberInput(contractCommissionRatePercent),
            overtimeHourlyRate: parseLocalizedNumberInput(contractOvertimeHourlyRate),
            housingAllowance: parseLocalizedNumberInput(contractHousingAllowance),
            transportAllowance: parseLocalizedNumberInput(contractTransportAllowance),
            otherAllowances: parseLocalizedNumberInput(contractOtherAllowances),
            annualLeaveEntitlementDays: Math.max(0, parseLocalizedNumberInput(contractAnnualLeaveEntitlementDays) || 0) || undefined
        };
        const result = editingContractId
            ? updateEmployeeContract(editingContractId, contractPayload, applyContractToEmployeeProfile)
            : addEmployeeContract(contractPayload, applyContractToEmployeeProfile);

        if (!result.ok) return alert(result.message);
        setEditingContractId(null);
        setShowContractForm(false);
        alert(
            editingContractId
                ? tr('تم تعديل العقد بنجاح', 'Contract updated successfully')
                : tr('تم حفظ العقد بنجاح', 'Contract saved successfully')
        );
    };

    const formatSalarySnapshotSummary = (entry: Pick<EmployeeContract, 'salaryType' | 'payBasis' | 'basicSalary' | 'hourlyRate' | 'dailyRate' | 'weeklyRate' | 'commissionRatePercent' | 'housingAllowance' | 'transportAllowance' | 'otherAllowances'> | (SalaryHistoryEntry['after'])) => {
        const basis = entry.payBasis || (entry.salaryType === 'HOURLY' ? 'HOURLY' : 'FIXED_MONTHLY');
        const fixedPart =
            basis === 'HOURLY' ? `${entry.hourlyRate || 0}/${tr('ساعة', 'hour')}`
                : basis === 'DAILY' ? `${entry.dailyRate || 0}/${tr('يوم', 'day')}`
                    : basis === 'WEEKLY' ? `${entry.weeklyRate || 0}/${tr('أسبوع', 'week')}`
                        : basis === 'COMMISSION' ? `${(entry.basicSalary || 0).toLocaleString()} + ${entry.commissionRatePercent || 0}% ${tr('من العمل', 'of work')}`
                            : `${(entry.basicSalary || 0).toLocaleString()} ${baseCurrency}`;
        const allowances = ((entry.housingAllowance || 0) + (entry.transportAllowance || 0) + (entry.otherAllowances || 0));
        return `${getPayBasisLabel(basis)}: ${fixedPart} ${allowances > 0 ? `+ ${allowances.toLocaleString()} ${tr('بدلات', 'allowances')}` : ''}`.trim();
    };

    const openEmployeeStatement = (employeeId: string) => {
        setStatementRanges(prev => ({
            ...prev,
            [employeeId]: { startDate: currentFiscalYearRange.startDate, endDate: currentFiscalYearRange.endDate }
        }));
        setEmployeeStatementPayrollSummaryVisible(employeeId, false);
        setViewStatementId(employeeId);
    };

    const openEmployeeStatementWithRange = (employeeId: string, range: StatementRange) => {
        const normalized = normalizeRange(range);
        setStatementRanges(prev => ({
            ...prev,
            [employeeId]: normalized
        }));
        setEmployeeStatementPayrollSummaryVisible(employeeId, true);
        setViewStatementId(employeeId);
    };

    const closeEmployeeStatement = () => setViewStatementId(null);

    const updateStatementRange = (employeeId: string, patch: Partial<StatementRange>) => {
        setStatementRanges(prev => {
            const current = prev[employeeId] || { startDate: currentFiscalYearRange.startDate, endDate: currentFiscalYearRange.endDate };
            return {
                ...prev,
                [employeeId]: { ...current, ...patch }
            };
        });
    };
    const setEmployeeStatementPayrollSummaryVisible = (employeeId: string, visible: boolean) => {
        setStatementPayrollSummaryVisibility(prev => ({
            ...prev,
            [employeeId]: visible
        }));
    };

    const DEFAULT_ANNUAL_LEAVE_ENTITLEMENT_DAYS = getCompanyDefaultLeaveEntitlementDays('OPEN_ENDED');
    const todayIso = new Date().toISOString().slice(0, 10);

    const getLeaveTypeLabel = (type: EmployeeLeaveRequest['leaveType']) => {
        switch (type) {
            case 'ANNUAL': return tr('سنوية', 'Annual');
            case 'SICK': return tr('مرضية', 'Sick');
            case 'UNPAID': return tr('بدون راتب', 'Unpaid');
            default: return tr('أخرى', 'Other');
        }
    };
    const getLeaveStatusLabel = (status: EmployeeLeaveRequest['status']) => {
        switch (status) {
            case 'PENDING': return tr('قيد الاعتماد', 'Pending');
            case 'APPROVED': return tr('معتمدة', 'Approved');
            case 'REJECTED': return tr('مرفوضة', 'Rejected');
            case 'CANCELLED': return tr('ملغاة', 'Cancelled');
            default: return status;
        }
    };
    const getRecurringTypeLabel = (type: EmployeeRecurringDeduction['type']) => {
        switch (type) {
            case 'ADVANCE': return tr('سلفة', 'Advance');
            case 'LOAN': return tr('قرض', 'Loan');
            case 'INSURANCE': return tr('تأمين', 'Insurance');
            case 'SUBSCRIPTION': return tr('اشتراك', 'Subscription');
            default: return tr('أخرى', 'Other');
        }
    };
    const getRecurringStatusLabel = (status: EmployeeRecurringDeduction['status']) => {
        switch (status) {
            case 'ACTIVE': return tr('نشط', 'Active');
            case 'PAUSED': return tr('موقوف مؤقتًا', 'Paused');
            case 'COMPLETED': return tr('مكتمل', 'Completed');
            case 'CANCELLED': return tr('ملغي', 'Cancelled');
            default: return status;
        }
    };
    const getEmployeeLeaveEntitlementContext = (emp: Employee, asOfDate = todayIso) => {
        const activeContract = employeeContracts
            .filter(c =>
                c.employeeId === emp.id &&
                c.status === 'ACTIVE' &&
                c.startDate <= asOfDate &&
                (!c.endDate || c.endDate >= asOfDate)
            )
            .slice()
            .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
        const fallbackActiveContract = employeeContracts
            .filter(c => c.employeeId === emp.id && c.status === 'ACTIVE')
            .slice()
            .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
        return { activeContract, fallbackActiveContract };
    };

    const getEmployeeAnnualLeaveEntitlement = (emp: Employee, asOfDate = todayIso) => {
        const { activeContract, fallbackActiveContract } = getEmployeeLeaveEntitlementContext(emp, asOfDate);
        const companyFallbackByContractType = getCompanyDefaultLeaveEntitlementDays(
            activeContract?.contractType || fallbackActiveContract?.contractType || 'OPEN_ENDED'
        );
        const value =
            activeContract?.annualLeaveEntitlementDays ??
            fallbackActiveContract?.annualLeaveEntitlementDays ??
            emp.annualLeaveEntitlementDays ??
            companyFallbackByContractType;
        return Math.max(0, Number(value) || 0);
    };

    const getEmployeeAccruedLeaveEntitlement = (emp: Employee, asOfDate = todayIso) => {
        const configuredAnnualEntitlement = getEmployeeAnnualLeaveEntitlement(emp, asOfDate);
        const accrualPolicy = getCompanyLeaveAccrualPolicy();
        const monthlyAccrualDays = getCompanyMonthlyLeaveAccrualDays();
        if (accrualPolicy !== 'MONTHLY') {
            return {
                accrualPolicy,
                monthlyAccrualDays,
                accrualMonths: 12,
                configuredAnnualEntitlement,
                earnedEntitlement: configuredAnnualEntitlement
            };
        }

        const { activeContract, fallbackActiveContract } = getEmployeeLeaveEntitlementContext(emp, asOfDate);
        const contractStart = activeContract?.startDate || fallbackActiveContract?.startDate;
        const baseStartDate = (contractStart && contractStart <= asOfDate ? contractStart : (emp.hireDate && emp.hireDate <= asOfDate ? emp.hireDate : undefined))
            || `${new Date(asOfDate).getFullYear()}-01-01`;
        const fiscalStart = `${new Date(asOfDate).getFullYear()}-01-01`;
        const effectiveStart = baseStartDate > fiscalStart ? baseStartDate : fiscalStart;

        if (effectiveStart > asOfDate) {
            return {
                accrualPolicy,
                monthlyAccrualDays,
                accrualMonths: 0,
                configuredAnnualEntitlement,
                earnedEntitlement: 0
            };
        }

        const [startYear, startMonth] = effectiveStart.split('-').map(Number);
        const [endYear, endMonth] = asOfDate.split('-').map(Number);
        const accrualMonths = Math.max(0, ((endYear - startYear) * 12) + (endMonth - startMonth) + 1);
        const rawEarned = accrualMonths * monthlyAccrualDays;
        const earnedEntitlement = Math.min(configuredAnnualEntitlement, Math.round(rawEarned * 100) / 100);

        return {
            accrualPolicy,
            monthlyAccrualDays,
            accrualMonths,
            configuredAnnualEntitlement,
            earnedEntitlement
        };
    };

    const getLeaveEntitlementSourceInfo = (emp: Employee, asOfDate = todayIso) => {
        const { activeContract, fallbackActiveContract } = getEmployeeLeaveEntitlementContext(emp, asOfDate);
        const contract = activeContract || fallbackActiveContract;
        if (contract) {
            return {
                source: 'CONTRACT' as const,
                contract
            };
        }
        return {
            source: 'EMPLOYEE' as const,
            contract: undefined
        };
    };

    const getLeaveEntitlementDraftValue = (empId: string, currentValue: number) => {
        if (Object.prototype.hasOwnProperty.call(leaveEntitlementDrafts, empId)) {
            return leaveEntitlementDrafts[empId];
        }
        return String(currentValue ?? '');
    };

    const handleLeaveEntitlementDraftChange = (empId: string, value: string) => {
        setLeaveEntitlementDrafts(prev => ({ ...prev, [empId]: toEnglishDigits(value) }));
    };

    const handleLeaveEntitlementSave = (emp: Employee) => {
        const rawValue = getLeaveEntitlementDraftValue(emp.id, getEmployeeAnnualLeaveEntitlement(emp));
        const normalizedRaw = toEnglishDigits(String(rawValue || '')).trim();
        const nextValue = normalizedRaw === '' ? undefined : Math.max(0, parseLocalizedNumberInput(normalizedRaw) || 0);
        const sourceInfo = getLeaveEntitlementSourceInfo(emp);
        setLeaveEntitlementSavingId(emp.id);
        try {
            let result;
            if (sourceInfo.source === 'CONTRACT' && sourceInfo.contract) {
                result = updateEmployeeContract(sourceInfo.contract.id, { annualLeaveEntitlementDays: nextValue });
            } else {
                updateEmployee(emp.id, { annualLeaveEntitlementDays: nextValue });
                result = { ok: true as const };
            }
            if (!result.ok) {
                alert(result.message);
                return;
            }
            setLeaveEntitlementDrafts(prev => {
                const next = { ...prev };
                delete next[emp.id];
                return next;
            });
        } finally {
            setLeaveEntitlementSavingId(current => (current === emp.id ? null : current));
        }
    };

    const handleLeaveRequestSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!leaveEmployeeId) return alert(tr('اختر الموظف أولًا', 'Select employee first.'));
        const normalizedStart = leaveStartDate || todayIso;
        const normalizedEnd = leaveEndDate || normalizedStart;
        const start = normalizedStart <= normalizedEnd ? normalizedStart : normalizedEnd;
        const end = normalizedStart <= normalizedEnd ? normalizedEnd : normalizedStart;
        const days = countOverlapDaysInclusive(start, end, start, end);
        const result = addEmployeeLeaveRequest({
            employeeId: leaveEmployeeId,
            leaveType,
            status: 'PENDING',
            effectiveFrom: start,
            effectiveTo: end,
            days,
            note: leaveNote.trim() || undefined,
            deductFromPayroll: leaveDeductFromPayroll || leaveType === 'UNPAID',
            deductionAccountId: (leaveDeductFromPayroll || leaveType === 'UNPAID') ? (leaveDeductionAccountId || getDefaultPayrollPenaltyAccountId()) : undefined,
            postedReferences: []
        });
        if (!result.ok) return alert(result.message);
        setLeaveNote('');
        setLeaveEndDate(start);
        setLeaveDeductFromPayroll(false);
        alert(tr('تم حفظ طلب الإجازة بنجاح', 'Leave request saved successfully'));
    };

    const handleLeaveStatusChange = (id: string, status: EmployeeLeaveRequest['status']) => {
        const result = updateEmployeeLeaveRequest(id, { status, decisionAt: new Date().toISOString() });
        if (!result.ok) return alert(result.message);
    };

    const handleRecurringDeductionSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!recurringEmployeeId) return alert(tr('اختر الموظف أولًا', 'Select employee first.'));
        const result = addEmployeeRecurringDeduction({
            employeeId: recurringEmployeeId,
            type: recurringType,
            status: 'ACTIVE',
            label: recurringLabel.trim() || getRecurringTypeLabel(recurringType),
            amount: parseLocalizedNumberInput(recurringAmount),
            accountId: recurringAccountId || undefined,
            effectiveFrom: recurringStartDate || todayIso,
            effectiveTo: recurringEndDate || undefined,
            installmentsTotal: recurringInstallments.trim() ? Math.max(1, Math.floor(parseLocalizedNumberInput(recurringInstallments))) : undefined,
            notes: recurringNotes.trim() || undefined,
            postedReferences: []
        });
        if (!result.ok) return alert(result.message);
        setRecurringLabel('');
        setRecurringAmount('');
        setRecurringNotes('');
        setRecurringEndDate('');
        setRecurringInstallments('');
        alert(tr('تم حفظ الاستقطاع المتكرر', 'Recurring deduction saved'));
    };

    const handleRecurringStatusChange = (id: string, status: EmployeeRecurringDeduction['status']) => {
        const result = updateEmployeeRecurringDeduction(id, { status });
        if (!result.ok) return alert(result.message);
    };

    const renderAttendance = () => {
        const d = new Date(attendanceDate);
        const isValidDate = !isNaN(d.getTime());
        const displayDate = isValidDate ? new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'ar-SA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }).format(d) : '---';

        return (
            <div className="space-y-3 animate-in slide-in-from-bottom-4">
                <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg"><CalendarCheck size={16} /></div>
                            <div>
                                <h3 className="font-black text-sm text-gray-800">{tr('تتبع الحضور اليومي', 'Daily Attendance Tracking')}</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{displayDate}</p>
                            </div>
                        </div>
                        <EnglishDateInput
                            value={attendanceDate}
                            onChange={setAttendanceDate}
                            className="bg-gray-50 h-10 px-3 rounded-xl text-[11px] font-black outline-none border border-gray-100"
                            aria-label={tr('تاريخ الحضور', 'Attendance date')}
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-[1fr_auto] gap-2 items-center">
                        <select
                            value={attendanceBatchToApplyId}
                            onChange={e => {
                                setAttendanceBatchToApplyId(e.target.value);
                                setAttendanceBatchPreview(null);
                                setAttendanceBatchApplyMsg('');
                                setAttendanceBatchManualAssignments({});
                            }}
                            className="col-span-2 md:col-span-1 w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none"
                        >
                            <option value="">{tr('-- اختر دفعة بصمة لتطبيقها على الحضور --', '-- Select fingerprint batch to apply --')}</option>
                            {stagedFingerprintBatches.map(batch => (
                                <option key={batch.id} value={batch.id}>{getBatchDisplayName(batch)}</option>
                            ))}
                        </select>
                        <div className="col-span-2 md:col-span-1 flex gap-1.5">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!attendanceBatchToApplyId) return alert(tr('اختر دفعة البصمة أولًا.', 'Select a fingerprint batch first.'));
                                    previewFingerprintAttendanceBatch(attendanceBatchToApplyId);
                                }}
                                className="px-3 py-2.5 rounded-xl bg-white border border-indigo-100 text-indigo-700 text-[11px] font-black hover:bg-indigo-50 transition-all"
                            >
                                {tr('معاينة', 'Preview')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!attendanceBatchToApplyId) return alert(tr('اختر دفعة البصمة أولًا.', 'Select a fingerprint batch first.'));
                                    applyFingerprintAttendanceBatchToLog(attendanceBatchToApplyId, 'PARTIAL');
                                }}
                                className="flex-1 px-3 py-2.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black shadow-sm hover:bg-indigo-700 transition-all"
                            >
                                <span className="hidden sm:inline">{tr('تطبيق جزئي (تجاهل غير المطابقين)', 'Partial Apply (ignore unmatched)')}</span>
                                <span className="sm:hidden">{tr('تطبيق جزئي', 'Partial Apply')}</span>
                            </button>
                        </div>
                    </div>
                    {attendanceBatchApplyMsg && (
                        <div className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 whitespace-pre-line">
                            {attendanceBatchApplyMsg}
                        </div>
                    )}
                    {attendanceBatchPreview && attendanceBatchPreview.batchId === attendanceBatchToApplyId && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 space-y-2">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-black">
                                    <div className="bg-white rounded-xl px-3 py-2 border border-gray-100">
                                        {tr('إجمالي السجلات', 'Total Rows')}: <span className="dir-ltr text-gray-800">{attendanceBatchPreview.totalRows.toLocaleString('en-US')}</span>
                                    </div>
                                    <div className="bg-white rounded-xl px-3 py-2 border border-emerald-100 text-emerald-700">
                                        {tr('مطابق', 'Matched')}: <span className="dir-ltr">{attendanceBatchPreview.matchedRows.toLocaleString('en-US')}</span>
                                    </div>
                                    <div className="bg-white rounded-xl px-3 py-2 border border-rose-100 text-rose-700">
                                        {tr('غير مطابق/متجاوز', 'Unmatched/Skipped')}: <span className="dir-ltr">{attendanceBatchPreview.issueRows.toLocaleString('en-US')}</span>
                                    </div>
                                    <div className="bg-white rounded-xl px-3 py-2 border border-indigo-100 text-indigo-700">
                                        {tr('نسبة المطابقة', 'Match Rate')}: <span className="dir-ltr">
                                            {attendanceBatchPreview.totalRows > 0
                                                ? ((attendanceBatchPreview.matchedRows / attendanceBatchPreview.totalRows) * 100).toFixed(1)
                                                : '0.0'}%
                                        </span>
                                    </div>
                                </div>
                                <div className="text-[11px] font-black text-indigo-700 bg-white border border-indigo-100 rounded-xl px-3 py-2">
                                    {tr(
                                        `???? ????????: ?????? ${attendanceBatchPreview.matchBreakdown.code} - ?????? ${attendanceBatchPreview.matchBreakdown.name} - ???? ${attendanceBatchPreview.matchBreakdown.manual}`,
                                        `Match source: by code ${attendanceBatchPreview.matchBreakdown.code} - by name ${attendanceBatchPreview.matchBreakdown.name} - manual ${attendanceBatchPreview.matchBreakdown.manual}`
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!attendanceBatchToApplyId) return;
                                            applyFingerprintAttendanceBatchToLog(attendanceBatchToApplyId, 'STRICT');
                                        }}
                                        disabled={attendanceBatchPreview.issueRows > 0}
                                        className={`px-3 py-2 rounded-xl text-[11px] font-black ${attendanceBatchPreview.issueRows > 0 ? 'bg-gray-100 text-gray-400 border border-gray-100 cursor-not-allowed' : 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'}`}
                                    >
                                        {tr('تطبيق كامل (بدون أخطاء)', 'Full Apply (no errors)')}
                                    </button>
                                    {attendanceBatchPreview.issueRows > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => previewFingerprintAttendanceBatch(attendanceBatchToApplyId)}
                                                className="px-3 py-2 rounded-xl text-[11px] font-black bg-white border border-blue-100 text-blue-700 hover:bg-blue-50"
                                            >
                                                {tr('إعادة المعاينة بعد التعيين', 'Re-preview after manual assignment')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={exportAttendanceBatchPreviewIssuesCsv}
                                                className="px-3 py-2 rounded-xl text-[11px] font-black bg-white border border-amber-100 text-amber-700 hover:bg-amber-50"
                                            >
                                                {tr('تصدير تقرير أخطاء المطابقة', 'Export Match Errors Report')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={printAttendanceBatchIssuesReport}
                                                className="px-3 py-2 rounded-xl text-[11px] font-black bg-white border border-indigo-100 text-indigo-700 hover:bg-indigo-50"
                                            >
                                                {tr('طباعة تقرير أخطاء الدوام', 'Print Attendance Errors Report')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {attendanceBatchPreview.issueRows > 0 && (
                                <div className="rounded-xl border border-rose-100 bg-white p-2.5 space-y-2">
                                    <div className="text-xs font-black text-rose-700">
                                        {tr('تقرير أخطاء المطابقة للتعديل السريع (كود الموظف / الاسم / وقت البصمة)', 'Match error report for quick fixes (employee code / name / punch time)')}
                                    </div>
                                    <div className="hidden md:block text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                                        {tr('يمكنك تعيين موظف يدويًا لكل سطر غير مطابق، وسيتم تحديث المعاينة فورًا دون تعديل ملف البصمة الأصلي.', 'You can assign an employee manually for each unmatched row, and the preview will refresh instantly without editing the original fingerprint file.')}
                                    </div>
                                    <div className="max-h-64 overflow-auto rounded-xl border border-gray-100">
                                        <table className="min-w-full text-[11px] font-bold">
                                            <thead className="bg-gray-50 text-gray-500">
                                                <tr>
                                                    <th className="px-3 py-2 text-right">{tr('#', '#')}</th>
                                                    <th className="px-3 py-2 text-right">{tr('كود الموظف', 'Employee Code')}</th>
                                                    <th className="px-3 py-2 text-right">{tr('اسم الموظف', 'Employee Name')}</th>
                                                    <th className="px-3 py-2 text-right">{tr('وقت البصمة', 'Punch Time')}</th>
                                                    <th className="px-3 py-2 text-right">{tr('النوع', 'Type')}</th>
                                                    <th className="px-3 py-2 text-right">{tr('سبب الخطأ', 'Error Reason')}</th>
                                                    <th className="px-3 py-2 text-right">{tr('تعيين يدوي', 'Manual assign')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {attendanceBatchPreview.issues.slice(0, 200).map(issue => (
                                                    <tr key={`${issue.rowId || 'row'}-${issue.rowIndex}`} className="border-t border-gray-100">
                                                        <td className="px-3 py-2 dir-ltr text-gray-500">{issue.rowIndex}</td>
                                                        <td className="px-3 py-2 dir-ltr">{issue.employeeCode || '-'}</td>
                                                        <td className="px-3 py-2">{issue.employeeName || '-'}</td>
                                                        <td className="px-3 py-2 dir-ltr">{issue.punchAt || '-'}</td>
                                                        <td className="px-3 py-2 dir-ltr">{issue.punchType || '-'}</td>
                                                        <td className="px-3 py-2 text-rose-700">{getAttendanceBatchIssueReasonLabel(issue.reason)}</td>
                                                        <td className="px-3 py-2 min-w-[220px]">
                                                            {issue.reason === 'EMPLOYEE_NOT_MATCHED' ? (
                                                                <select
                                                                    value={attendanceBatchManualAssignments[issue.issueKey] || ''}
                                                                    onChange={e => setManualAttendanceIssueAssignment(issue.issueKey, e.target.value)}
                                                                    className="w-full p-2 rounded-lg border border-indigo-100 bg-white text-[11px] font-black outline-none"
                                                                >
                                                                    <option value="">{tr('-- اختر موظفًا --', '-- Select employee --')}</option>
                                                                    {employees.map(emp => (
                                                                        <option key={emp.id} value={emp.id}>
                                                                            {`${emp.name} (${toEnglishDigits(String(emp.code || '-'))})`}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <span className="text-[10px] text-gray-400 font-bold">
                                                                    {tr('غير قابل للتعيين اليدوي', 'Not manually assignable')}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {attendanceBatchPreview.issues.length > 200 && (
                                        <div className="text-[10px] font-bold text-gray-400">
                                            {tr('تم عرض أول 200 خطأ فقط. استخدم التصدير CSV لجميع الأخطاء.', 'Showing first 200 errors only. Use CSV export for all errors.')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    {employees.map(emp => {
                        const dayData = (attendanceLog[attendanceDate] || {}) as Record<string, AttendanceRecord>;
                        const record = dayData[emp.id] || { inTime: '', outTime: '', note: '' };
                        const actualHours = calculateDailyHours(record.inTime, record.outTime);
                        const target = emp.dailyWorkHours || 8;

                        return (
                            <div key={emp.id} className={`bg-white p-3 rounded-xl shadow-sm border transition-all ${actualHours > 0 ? 'border-indigo-600' : 'border-gray-100'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${actualHours > 0 ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{emp.name.charAt(0)}</div>
                                        <div><h4 className="font-black text-gray-800 text-sm">{emp.name}</h4><p className="text-[9px] font-black text-gray-400">{tr('المستهدف', 'Target')}: {target}{tr('س', 'h')}</p></div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div><label className="text-[9px] font-black text-gray-400 mb-1 block">{tr('وقت الدخول', 'Check-in Time')}</label><input type="time" value={record.inTime} onChange={e => updateAttendance(emp.id, 'inTime', e.target.value)} className="w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none" /></div>
                                    <div><label className="text-[9px] font-black text-gray-400 mb-1 block">{tr('وقت الانصراف', 'Check-out Time')}</label><input type="time" value={record.outTime} onChange={e => updateAttendance(emp.id, 'outTime', e.target.value)} className="w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none" /></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderLeaves = () => {
        const currentYear = new Date().getFullYear();
        const leaveDeductionAccountOptions = accounts.filter(a => !a.isGroup && (a.type === 'EXPENSE' || a.type === 'ASSET' || a.type === 'LIABILITY'));
        const filteredLeaveRequests = employeeLeaveRequests
            .filter(req => leaveStatusFilter === 'ALL' || req.status === leaveStatusFilter)
            .slice()
            .sort((a, b) => `${b.effectiveFrom}-${b.createdAt}`.localeCompare(`${a.effectiveFrom}-${a.createdAt}`));

        const leaveBalanceRows = employees.map(emp => {
            const empLeaves = employeeLeaveRequests.filter(r => r.employeeId === emp.id);
            const leaveEntitlement = getEmployeeAccruedLeaveEntitlement(emp);
            const sourceInfo = getLeaveEntitlementSourceInfo(emp);
            const approvedAnnual = empLeaves
                .filter(r => r.status === 'APPROVED' && r.leaveType === 'ANNUAL' && r.effectiveFrom.startsWith(String(currentYear)))
                .reduce((sum, r) => sum + (r.days || 0), 0);
            const approvedUnpaid = empLeaves
                .filter(r => r.status === 'APPROVED' && r.leaveType === 'UNPAID' && r.effectiveFrom.startsWith(String(currentYear)))
                .reduce((sum, r) => sum + (r.days || 0), 0);
            const pending = empLeaves.filter(r => r.status === 'PENDING').reduce((sum, r) => sum + (r.days || 0), 0);
            const onLeaveNow = empLeaves.some(r => r.status === 'APPROVED' && r.effectiveFrom <= todayIso && r.effectiveTo >= todayIso);
            return {
                emp,
                approvedAnnual,
                approvedUnpaid,
                pending,
                onLeaveNow,
                annualEntitlement: leaveEntitlement.configuredAnnualEntitlement,
                earnedEntitlement: leaveEntitlement.earnedEntitlement,
                accrualPolicy: leaveEntitlement.accrualPolicy,
                accrualMonths: leaveEntitlement.accrualMonths,
                monthlyAccrualDays: leaveEntitlement.monthlyAccrualDays,
                estimatedAnnualBalance: Math.max(0, leaveEntitlement.earnedEntitlement - approvedAnnual),
                entitlementSource: sourceInfo.source,
                entitlementSourceContractTitle: sourceInfo.contract?.title
            };
        });
        const leaveBalanceMap = new Map<string, (typeof leaveBalanceRows)[number]>(
            leaveBalanceRows.map(row => [row.emp.id, row] as const)
        );

        const previewStart = leaveStartDate || todayIso;
        const previewEnd = leaveEndDate || previewStart;
        const leaveDaysPreview = countOverlapDaysInclusive(previewStart, previewEnd, previewStart, previewEnd);

        return (
            <div className="space-y-3 animate-in slide-in-from-bottom-4">
                <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-violet-100 text-violet-600 rounded-lg"><CalendarRange size={16} /></div>
                        <div>
                            <h3 className="font-black text-sm text-gray-800">{tr('طلبات الإجازات والغيابات الرسمية', 'Leave & Official Absence Requests')}</h3>
                            <p className="text-[10px] font-bold text-gray-400 hidden sm:block">{tr('طلب + اعتماد/رفض + خصم اختياري من الراتب', 'Request + approve/reject + optional payroll deduction')}</p>
                        </div>
                    </div>

                    <form onSubmit={handleLeaveRequestSubmit} className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <select value={leaveEmployeeId} onChange={e => setLeaveEmployeeId(e.target.value)} className="w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none">
                                <option value="">{tr('-- اختر الموظف --', '-- Select Employee --')}</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.code} - {emp.name}</option>)}
                            </select>
                            <select value={leaveType} onChange={e => setLeaveType(e.target.value as EmployeeLeaveRequest['leaveType'])} className="w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none">
                                <option value="ANNUAL">{tr('إجازة سنوية', 'Annual Leave')}</option>
                                <option value="SICK">{tr('إجازة مرضية', 'Sick Leave')}</option>
                                <option value="UNPAID">{tr('إجازة بدون راتب', 'Unpaid Leave')}</option>
                                <option value="OTHER">{tr('غياب/إجازة أخرى', 'Other Leave/Absence')}</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <EnglishDateInput value={leaveStartDate} onChange={setLeaveStartDate} className="w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none" aria-label={tr('بداية الإجازة', 'Leave start')} />
                            <EnglishDateInput value={leaveEndDate} onChange={setLeaveEndDate} className="w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none" aria-label={tr('نهاية الإجازة', 'Leave end')} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input value={leaveNote} onChange={e => setLeaveNote(e.target.value)} placeholder={tr('ملاحظة / سبب الإجازة', 'Note / reason')} className={`w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none ${isEnglish ? 'text-left' : 'text-right'}`} />
                            <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
                                <span className="text-[11px] font-black text-indigo-700">{tr('عدد الأيام', 'Days')}</span>
                                <span className="text-sm font-black text-indigo-600 dir-ltr">{leaveDaysPreview}</span>
                            </div>
                        </div>
                        <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-2.5 space-y-2">
                            <label className="flex items-center gap-2 text-[11px] font-black text-rose-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={leaveDeductFromPayroll || leaveType === 'UNPAID'}
                                    onChange={e => setLeaveDeductFromPayroll(e.target.checked)}
                                    disabled={leaveType === 'UNPAID'}
                                />
                                {tr('ربط بالراتب (خصم تلقائي عند الترحيل)', 'Link to payroll (auto deduction on posting)')}
                            </label>
                            {(leaveDeductFromPayroll || leaveType === 'UNPAID') && (
                                <select value={leaveDeductionAccountId} onChange={e => setLeaveDeductionAccountId(e.target.value)} className="w-full h-10 px-3 bg-white rounded-xl border border-rose-100 text-[11px] font-black outline-none">
                                    <option value="">{tr('-- حساب الخصم (اختياري) --', '-- Deduction account (optional) --')}</option>
                                    {leaveDeductionAccountOptions.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.code} - {displayAccountName(acc)}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <div className="hidden md:block text-[10px] font-black text-gray-400">
                                {getCompanyLeaveAccrualPolicy() === 'MONTHLY'
                                    ? tr(
                                        `?? ????? ????????? ?????? (${getCompanyMonthlyLeaveAccrualDays().toLocaleString()} ???/???). ?????? ?????? ?????? ???? ????? ??????? ?? ????? ????? ?? ??? ??????.`,
                                        `Monthly accrual is enabled (${getCompanyMonthlyLeaveAccrualDays().toLocaleString()} days/month). Available leave is earned within the current year from the active contract/employee profile.`
                                    )
                                    : tr(
                                        'الرصيد السنوي يُحتسب من العقد الفعّال أو ملف الموظف (مع افتراضي الشركة حسب نوع العقد عند عدم التحديد).',
                                        'Annual leave balance uses the active contract or employee profile (with company defaults by contract type if not set).'
                                    )}
                            </div>
                            <button type="submit" className="w-full md:w-auto px-4 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-black shadow-sm hover:bg-violet-700 transition-all">
                                {tr('إضافة طلب إجازة', 'Add Leave Request')}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="bg-white p-5 rounded-[2.2rem] border border-gray-100 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                        <div>
                            <h3 className="font-black text-sm text-gray-800">{tr('رصيد الإجازات لكل موظف', 'Leave Balance Per Employee')}</h3>
                            <p className="text-[10px] font-bold text-gray-400">
                                {getCompanyLeaveAccrualPolicy() === 'MONTHLY'
                                    ? tr('رصيد مكتسب حتى الآن + طلبات معلقة', 'Earned balance to date + pending requests')
                                    : tr('رصيد سنوي تقديري + طلبات معلقة', 'Estimated annual balance + pending requests')}
                            </p>
                        </div>
                        <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value as typeof leaveStatusFilter)} className="w-full md:w-56 p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-black outline-none">
                            <option value="ALL">{tr('كل الحالات', 'All statuses')}</option>
                            <option value="PENDING">{tr('قيد الاعتماد', 'Pending')}</option>
                            <option value="APPROVED">{tr('معتمدة', 'Approved')}</option>
                            <option value="REJECTED">{tr('مرفوضة', 'Rejected')}</option>
                            <option value="CANCELLED">{tr('ملغاة', 'Cancelled')}</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {leaveBalanceRows.map(row => (
                            <div key={row.emp.id} className="rounded-2xl border border-gray-100 p-4 bg-gray-50/60">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div>
                                        <div className="font-black text-sm text-gray-800">{row.emp.name}</div>
                                        <div className="text-[10px] text-gray-400 font-bold">{row.emp.code}</div>
                                    </div>
                                    {row.onLeaveNow && <span className="text-[9px] bg-violet-100 text-violet-700 px-2 py-1 rounded-lg font-black">{tr('في إجازة', 'On leave')}</span>}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-black">
                                    <div className="bg-white rounded-xl p-2 border border-gray-100 text-gray-600">{tr('سنوية مستخدمة', 'Annual Used')}: <span className="dir-ltr text-rose-600">{row.approvedAnnual}</span></div>
                                    <div className="bg-white rounded-xl p-2 border border-gray-100 text-gray-600">{tr('الرصيد المعتمد', 'Configured Entitlement')}: <span className="dir-ltr text-violet-600">{row.annualEntitlement}</span></div>
                                    <div className="bg-white rounded-xl p-2 border border-gray-100 text-gray-600">
                                        {row.accrualPolicy === 'MONTHLY' ? tr('رصيد مكتسب', 'Earned Balance') : tr('رصيد سنوي', 'Annual Balance')}: <span className="dir-ltr text-emerald-600">{row.estimatedAnnualBalance}</span>
                                    </div>
                                    <div className="bg-white rounded-xl p-2 border border-gray-100 text-gray-600">{tr('بدون راتب', 'Unpaid')}: <span className="dir-ltr text-amber-600">{row.approvedUnpaid}</span></div>
                                    <div className="bg-white rounded-xl p-2 border border-gray-100 text-gray-600">{tr('طلبات معلقة', 'Pending')}: <span className="dir-ltr text-indigo-600">{row.pending}</span></div>
                                    {row.accrualPolicy === 'MONTHLY' && (
                                        <div className="bg-white rounded-xl p-2 border border-gray-100 text-gray-600 col-span-2">
                                            {tr('تراكم شهري', 'Monthly accrual')}: <span className="dir-ltr text-sky-600">{row.monthlyAccrualDays}</span> أ— <span className="dir-ltr text-sky-600">{row.accrualMonths}</span> {tr('شهر', 'months')} = <span className="dir-ltr text-sky-700">{row.earnedEntitlement}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-3 bg-white rounded-xl border border-violet-100 p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2 text-[10px] font-black">
                                        <span className="text-violet-700">{tr('تعبئة رصيد الإجازة السنوي يدويًا', 'Manual annual leave entitlement')}</span>
                                        <span className="text-gray-400">
                                            {row.entitlementSource === 'CONTRACT'
                                                ? tr('المصدر: العقد الفعّال', 'Source: Active contract')
                                                : tr('المصدر: ملف الموظف', 'Source: Employee profile')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            lang="en"
                                            value={getLeaveEntitlementDraftValue(row.emp.id, row.annualEntitlement)}
                                            onChange={e => handleLeaveEntitlementDraftChange(row.emp.id, e.target.value)}
                                            placeholder="21"
                                            className="flex-1 p-2.5 bg-gray-50 rounded-xl border border-violet-100 text-xs font-black text-center dir-ltr outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleLeaveEntitlementSave(row.emp)}
                                            disabled={leaveEntitlementSavingId === row.emp.id}
                                            className={`px-3 py-2.5 rounded-xl text-xs font-black whitespace-nowrap ${leaveEntitlementSavingId === row.emp.id ? 'bg-gray-100 text-gray-400 border border-gray-100' : 'bg-violet-600 text-white shadow-lg shadow-violet-100 hover:bg-violet-700'}`}
                                        >
                                            {leaveEntitlementSavingId === row.emp.id ? tr('جارٍ الحفظ...', 'Saving...') : tr('حفظ الرصيد', 'Save Entitlement')}
                                        </button>
                                    </div>
                                    {row.entitlementSource === 'CONTRACT' && row.entitlementSourceContractTitle && (
                                        <div className="text-[10px] font-bold text-gray-400">
                                            {tr('العقد', 'Contract')}: {row.entitlementSourceContractTitle}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-[2.2rem] border border-gray-100 shadow-sm">
                    <h3 className="font-black text-sm text-gray-800 mb-4">{tr('سجل طلبات الإجازات', 'Leave Requests Log')}</h3>
                    <div className="space-y-3">
                        {filteredLeaveRequests.length === 0 && <div className="text-center text-gray-400 text-sm font-bold py-8">{tr('لا توجد طلبات حسب الفلتر الحالي', 'No leave requests for current filter')}</div>}
                        {filteredLeaveRequests.map(req => {
                            const emp = employees.find(e => e.id === req.employeeId);
                            const empLeaveBalance = emp ? leaveBalanceMap.get(emp.id) : undefined;
                            const postedCount = (req.postedReferences || []).length;
                            const canDelete = postedCount === 0;
                            return (
                                <div key={req.id} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/40">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-black text-sm text-gray-800">{emp?.name || tr('موظف محذوف', 'Deleted Employee')}</span>
                                                <span className="text-[10px] px-2 py-1 rounded-lg bg-white border border-gray-100 font-black text-gray-500">{getLeaveTypeLabel(req.leaveType)}</span>
                                                <span className={`text-[10px] px-2 py-1 rounded-lg font-black ${req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                                                        req.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' :
                                                            req.status === 'CANCELLED' ? 'bg-gray-100 text-gray-600' :
                                                                'bg-amber-100 text-amber-700'
                                                    }`}>{getLeaveStatusLabel(req.status)}</span>
                                                {(req.deductFromPayroll || req.leaveType === 'UNPAID') && <span className="text-[10px] px-2 py-1 rounded-lg bg-rose-100 text-rose-700 font-black">{tr('خصم راتب', 'Payroll deduction')}</span>}
                                                {empLeaveBalance && (
                                                    <span className="text-[10px] px-2 py-1 rounded-lg bg-violet-100 text-violet-700 font-black">
                                                        {tr('رصيد إجازة سنوي (يوم)', 'Annual leave entitlement (days)')}: <span className="dir-ltr">{empLeaveBalance.annualEntitlement.toLocaleString('en-US')}</span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-400">{req.effectiveFrom} - {req.effectiveTo} - {tr('??? ??????', 'Days')}: {req.days}{postedCount ? ` - ${tr('???? ?????', 'Payroll posted')}: ${postedCount}` : ''}</div>
                                            {empLeaveBalance && (
                                                <div className="text-[10px] font-black text-violet-600">
                                                    {tr('المتاح الحالي', 'Current available')}: <span className="dir-ltr">{empLeaveBalance.estimatedAnnualBalance.toLocaleString('en-US')}</span> {tr('يوم', 'days')}
                                                </div>
                                            )}
                                            {req.note && <div className="text-[11px] font-bold text-gray-600">{req.note}</div>}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {req.status !== 'APPROVED' && <button onClick={() => handleLeaveStatusChange(req.id, 'APPROVED')} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black">{tr('اعتماد', 'Approve')}</button>}
                                            {req.status !== 'REJECTED' && <button onClick={() => handleLeaveStatusChange(req.id, 'REJECTED')} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 text-xs font-black">{tr('رفض', 'Reject')}</button>}
                                            {req.status !== 'CANCELLED' && <button onClick={() => handleLeaveStatusChange(req.id, 'CANCELLED')} className="px-3 py-2 rounded-xl bg-gray-50 text-gray-600 border border-gray-100 text-xs font-black">{tr('إلغاء', 'Cancel')}</button>}
                                            <button
                                                onClick={() => {
                                                    if (!canDelete) return alert(tr('لا يمكن حذف طلب مرتبط بترحيل رواتب.', 'Cannot delete a request linked to payroll posting.'));
                                                    if (!confirm(tr('هل تريد حذف طلب الإجازة؟', 'Delete leave request?'))) return;
                                                    const res = deleteEmployeeLeaveRequest(req.id);
                                                    if (!res.ok) alert(res.message);
                                                }}
                                                disabled={!canDelete}
                                                className={`px-3 py-2 rounded-xl border text-xs font-black ${canDelete ? 'bg-white text-rose-600 border-rose-100' : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'}`}
                                            >
                                                {tr('حذف', 'Delete')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderRecurringDeductions = () => {
        const recurringAccountOptions = accounts.filter(a => !a.isGroup && a.id !== 'acc_accrued_salaries');
        const filteredRecurring = employeeRecurringDeductions
            .filter(item => recurringStatusFilter === 'ALL' || item.status === recurringStatusFilter)
            .slice()
            .sort((a, b) => `${b.effectiveFrom}-${b.createdAt}`.localeCompare(`${a.effectiveFrom}-${a.createdAt}`));
        const activeCount = employeeRecurringDeductions.filter(d => d.status === 'ACTIVE').length;
        const totalActiveAmount = employeeRecurringDeductions.filter(d => d.status === 'ACTIVE').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        return (
            <div className="space-y-6 animate-in slide-in-from-bottom-4">
                <div className="bg-white p-5 rounded-[2.2rem] border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-fuchsia-100 text-fuchsia-600 rounded-xl"><Wallet size={18} /></div>
                        <div>
                            <h3 className="font-black text-sm text-gray-800">{tr('الاستقطاعات المتكررة', 'Recurring Deductions')}</h3>
                            <p className="text-[10px] font-bold text-gray-400">{tr('تُطبّق تلقائيًا في مسير الرواتب عند الترحيل', 'Auto-applied during payroll posting')}</p>
                        </div>
                    </div>

                    <form onSubmit={handleRecurringDeductionSubmit} className="space-y-3.5">
                        <div className="grid grid-cols-2 gap-3">
                            <select value={recurringEmployeeId} onChange={e => setRecurringEmployeeId(e.target.value)} className="w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none">
                                <option value="">{tr('-- اختر الموظف --', '-- Select Employee --')}</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.code} - {emp.name}</option>)}
                            </select>
                            <select value={recurringType} onChange={e => setRecurringType(e.target.value as EmployeeRecurringDeduction['type'])} className="w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none">
                                <option value="ADVANCE">{tr('سلفة', 'Advance')}</option>
                                <option value="LOAN">{tr('قرض', 'Loan')}</option>
                                <option value="INSURANCE">{tr('تأمين', 'Insurance')}</option>
                                <option value="SUBSCRIPTION">{tr('اشتراك', 'Subscription')}</option>
                                <option value="OTHER">{tr('أخرى', 'Other')}</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input value={recurringLabel} onChange={e => setRecurringLabel(e.target.value)} placeholder={tr('اسم الاستقطاع', 'Deduction label')} className={`w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none ${isEnglish ? 'text-left' : 'text-right'}`} />
                            <input type="text" inputMode="decimal" lang="en" value={recurringAmount} onChange={e => setRecurringAmount(e.target.value)} placeholder={tr('المبلغ', 'Amount')} className="w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black text-center dir-ltr outline-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <EnglishDateInput value={recurringStartDate} onChange={setRecurringStartDate} className="w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none" aria-label={tr('بداية الاستقطاع', 'Deduction start')} />
                            <EnglishDateInput value={recurringEndDate} onChange={setRecurringEndDate} className="w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none" aria-label={tr('نهاية الاستقطاع', 'Deduction end')} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input type="text" inputMode="numeric" lang="en" value={recurringInstallments} onChange={e => setRecurringInstallments(e.target.value)} placeholder={tr('عدد الدفعات (اختياري)', 'Installments (optional)')} className="w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black text-center dir-ltr outline-none" />
                            <select value={recurringAccountId} onChange={e => setRecurringAccountId(e.target.value)} className="w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none">
                                <option value="">{tr('-- حساب الاستقطاع --', '-- Deduction account --')}</option>
                                {recurringAccountOptions.map(acc => <option key={acc.id} value={acc.id}>{acc.code} - {displayAccountName(acc)}</option>)}
                            </select>
                        </div>
                        <input value={recurringNotes} onChange={e => setRecurringNotes(e.target.value)} placeholder={tr('ملاحظات', 'Notes')} className={`w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none ${isEnglish ? 'text-left' : 'text-right'}`} />
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="text-[10px] font-black text-gray-400 text-center md:text-right">{tr(`نشط: ${activeCount} - قيمة الدورة: ${totalActiveAmount.toLocaleString()} ${baseCurrency}`, `Active: ${activeCount} - Cycle total: ${totalActiveAmount.toLocaleString()} ${baseCurrency}`)}</div>
                            <button type="submit" className="w-full md:w-auto px-5 py-3 bg-fuchsia-600 text-white rounded-xl text-xs font-black shadow-lg shadow-fuchsia-100 hover:bg-fuchsia-700 transition-all">{tr('إضافة استقطاع متكرر', 'Add Recurring Deduction')}</button>
                        </div>
                    </form>
                </div>

                <div className="bg-white p-5 rounded-[2.2rem] border border-gray-100 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                        <h3 className="font-black text-sm text-gray-800">{tr('سجل الاستقطاعات المتكررة', 'Recurring Deductions Log')}</h3>
                        <select value={recurringStatusFilter} onChange={e => setRecurringStatusFilter(e.target.value as typeof recurringStatusFilter)} className="w-full md:w-56 p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-black outline-none">
                            <option value="ALL">{tr('كل الحالات', 'All statuses')}</option>
                            <option value="ACTIVE">{tr('نشط', 'Active')}</option>
                            <option value="PAUSED">{tr('موقوف مؤقتًا', 'Paused')}</option>
                            <option value="COMPLETED">{tr('مكتمل', 'Completed')}</option>
                            <option value="CANCELLED">{tr('ملغي', 'Cancelled')}</option>
                        </select>
                    </div>
                    <div className="space-y-3">
                        {filteredRecurring.length === 0 && <div className="text-center text-gray-400 text-sm font-bold py-8">{tr('لا توجد استقطاعات حسب الفلتر الحالي', 'No recurring deductions for current filter')}</div>}
                        {filteredRecurring.map(item => {
                            const emp = employees.find(e => e.id === item.employeeId);
                            const account = accounts.find(a => a.id === item.accountId);
                            const postedCount = (item.postedReferences || []).length;
                            const installmentsTotal = item.installmentsTotal || 0;
                            const installmentsApplied = item.installmentsApplied || 0;
                            const progressText = installmentsTotal > 0 ? `${installmentsApplied}/${installmentsTotal}` : `${postedCount}`;
                            return (
                                <div key={item.id} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/40">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-black text-sm text-gray-800">{item.label}</span>
                                                <span className="text-[10px] px-2 py-1 rounded-lg bg-white border border-gray-100 font-black text-gray-500">{getRecurringTypeLabel(item.type)}</span>
                                                <span className={`text-[10px] px-2 py-1 rounded-lg font-black ${item.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                                                        item.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' :
                                                            item.status === 'COMPLETED' ? 'bg-indigo-100 text-indigo-700' :
                                                                'bg-gray-100 text-gray-600'
                                                    }`}>{getRecurringStatusLabel(item.status)}</span>
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-400">
                                                {emp?.name || tr('???? ?????', 'Deleted Employee')} - {item.effectiveFrom}{item.effectiveTo ? ` - ${item.effectiveTo}` : ''} - {tr('??????', 'Amount')}: {item.amount.toLocaleString()} {baseCurrency}
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-500">
                                                {tr('التقدم', 'Progress')}: {progressText}
                                                {account ? ` - ${tr('??????', 'Account')}: ${displayAccountName(account)}` : ''}
                                            </div>
                                            {item.notes && <div className="text-[11px] font-bold text-gray-600">{item.notes}</div>}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {item.status !== 'ACTIVE' && item.status !== 'COMPLETED' && <button onClick={() => handleRecurringStatusChange(item.id, 'ACTIVE')} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black">{tr('تفعيل', 'Activate')}</button>}
                                            {item.status === 'ACTIVE' && <button onClick={() => handleRecurringStatusChange(item.id, 'PAUSED')} className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 text-xs font-black">{tr('إيقاف مؤقت', 'Pause')}</button>}
                                            {item.status !== 'CANCELLED' && item.status !== 'COMPLETED' && <button onClick={() => handleRecurringStatusChange(item.id, 'CANCELLED')} className="px-3 py-2 rounded-xl bg-gray-50 text-gray-600 border border-gray-100 text-xs font-black">{tr('إلغاء', 'Cancel')}</button>}
                                            <button onClick={() => { if (!confirm(tr('هل تريد حذف الاستقطاع المتكرر؟', 'Delete recurring deduction?'))) return; const res = deleteEmployeeRecurringDeduction(item.id); if (!res.ok) alert(res.message); }} className="px-3 py-2 rounded-xl bg-white text-rose-600 border border-rose-100 text-xs font-black">{tr('حذف', 'Delete')}</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderReports = () => {
        const rawStartDate = reportStartDate || payrollStartDate;
        const rawEndDate = reportEndDate || payrollEndDate;
        const startDate = rawStartDate <= rawEndDate ? rawStartDate : rawEndDate;
        const endDate = rawStartDate <= rawEndDate ? rawEndDate : rawStartDate;

        const targetEmployees = reportEmployeeId ? employees.filter(e => e.id === reportEmployeeId) : employees;

        const attendanceDaysInRange: string[] = [];
        if (startDate && endDate) {
            const cursor = new Date(`${startDate}T00:00:00Z`);
            const last = new Date(`${endDate}T00:00:00Z`);
            while (!isNaN(cursor.getTime()) && !isNaN(last.getTime()) && cursor <= last) {
                const yyyy = cursor.getUTCFullYear();
                const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(cursor.getUTCDate()).padStart(2, '0');
                attendanceDaysInRange.push(`${yyyy}-${mm}-${dd}`);
                cursor.setUTCDate(cursor.getUTCDate() + 1);
            }
        }

        const attendanceDailyRows = attendanceDaysInRange
            .flatMap(dateStr => targetEmployees.map(emp => {
                const record = attendanceLog[dateStr]?.[emp.id] || { inTime: '', outTime: '', note: '' };
                const workedHours = calculateDailyHours(record.inTime, record.outTime);
                const targetHours = emp.dailyWorkHours || 8;
                const hasIn = !!record.inTime;
                const hasOut = !!record.outTime;
                const status = hasIn && hasOut ? 'PRESENT' as const : (hasIn || hasOut ? 'PARTIAL' as const : 'ABSENT' as const);

                return {
                    date: dateStr,
                    emp,
                    ...record,
                    workedHours,
                    targetHours,
                    overtimeHours: Math.max(0, workedHours - targetHours),
                    shortageHours: Math.max(0, targetHours - workedHours),
                    status
                };
            }))
            .sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                return a.emp.name.localeCompare(b.emp.name, 'ar');
            });

        const dailyAttendanceTotals = attendanceDailyRows.reduce((sum, row) => ({
            present: sum.present + (row.status === 'PRESENT' ? 1 : 0),
            partial: sum.partial + (row.status === 'PARTIAL' ? 1 : 0),
            absent: sum.absent + (row.status === 'ABSENT' ? 1 : 0),
            workedHours: sum.workedHours + row.workedHours
        }), { present: 0, partial: 0, absent: 0, workedHours: 0 });

        const employeeReportCards: { id: EmployeeReportView; title: string; subtitle: string; icon: React.ReactNode; colorClass: string }[] = [
            { id: 'ATTENDANCE_SUMMARY', title: tr('ملخص دوام الموظف', 'Employee Attendance Summary'), subtitle: tr('ملخص حضور/غياب وساعات', 'Presence/absence and hours summary'), icon: <CalendarCheck size={18} />, colorClass: 'bg-purple-50 text-purple-700 border-purple-100' },
            { id: 'DAILY_ATTENDANCE', title: tr('تقرير الدوام اليومي', 'Daily Attendance Report'), subtitle: tr('عرض وتعديل الدوام اليومي', 'View and edit daily attendance'), icon: <Timer size={18} />, colorClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' },
            { id: 'PAYROLL_STATEMENTS', title: tr('تقرير كشوفات الرواتب', 'Payroll Statements Report'), subtitle: tr('استحقاق/خصومات/مدفوع', 'Entitlements / deductions / paid'), icon: <Receipt size={18} />, colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
            { id: 'UNPAID_ACCRUALS', title: tr('استحقاقات غير مصروفة', 'Unpaid Accruals'), subtitle: tr('الرواتب المرحلة غير المصروفة', 'Posted salaries not yet paid'), icon: <AlertCircle size={18} />, colorClass: 'bg-rose-50 text-rose-700 border-rose-100' },
            { id: 'ADVANCES_SETTLEMENTS', title: tr('سلف الموظفين وتسوياتها', 'Employee Advances & Settlements'), subtitle: tr('حركة + رصيد', 'Movements + balance'), icon: <Wallet size={18} />, colorClass: 'bg-amber-50 text-amber-700 border-amber-100' }
        ];

        const attendanceRows = targetEmployees.map(emp => {
            const targetDailyHours = emp.dailyWorkHours || 8;
            let presentDays = 0;
            let totalHours = 0;

            attendanceDaysInRange.forEach(dateStr => {
                const record = attendanceLog[dateStr]?.[emp.id];
                if (!record?.inTime || !record?.outTime) return;
                presentDays++;
                totalHours += calculateDailyHours(record.inTime, record.outTime);
            });

            const trackedDays = attendanceDaysInRange.length;
            const absentDays = Math.max(0, trackedDays - presentDays);
            const expectedHours = trackedDays * targetDailyHours;
            const overtimeHours = Math.max(0, totalHours - expectedHours);
            const shortageHours = Math.max(0, expectedHours - totalHours);

            return { emp, presentDays, absentDays, totalHours, expectedHours, overtimeHours, shortageHours, trackedDays };
        });

        const attendanceTotals = attendanceRows.reduce((sum, row) => ({
            presentDays: sum.presentDays + row.presentDays,
            absentDays: sum.absentDays + row.absentDays,
            totalHours: sum.totalHours + row.totalHours,
            overtimeHours: sum.overtimeHours + row.overtimeHours
        }), { presentDays: 0, absentDays: 0, totalHours: 0, overtimeHours: 0 });

        const payrollRowsReport = targetEmployees.map(emp => {
            const inRangeTx = transactions.filter(t =>
                t.status !== 'DRAFT' &&
                t.employeeId === emp.id &&
                t.date >= startDate &&
                t.date <= endDate
            );

            const accrual = inRangeTx
                .filter(t => t.category === 'salaries' && t.creditAccountId === 'acc_accrued_salaries')
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const direct = inRangeTx
                .filter(t => t.category === 'salary_direct_payment')
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const paidFromAccrual = inRangeTx
                .filter(t =>
                    t.category === 'salary_payment' ||
                    (t.category === 'salaries' && !!t.creditAccountId && t.creditAccountId !== 'acc_accrued_salaries')
                )
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const deductions = inRangeTx
                .filter(t => t.category === 'employee_deduction')
                .reduce((sum, t) => sum + (t.amount || 0), 0);

            const entitlements = accrual + direct;
            const net = entitlements - deductions;
            const paid = paidFromAccrual + direct;
            const remaining = net - paid;

            return { emp, entitlements, deductions, net, paid, remaining };
        });

        const payrollTotals = payrollRowsReport.reduce((sum, row) => ({
            entitlements: sum.entitlements + row.entitlements,
            deductions: sum.deductions + row.deductions,
            net: sum.net + row.net,
            paid: sum.paid + row.paid,
            remaining: sum.remaining + row.remaining
        }), { entitlements: 0, deductions: 0, net: 0, paid: 0, remaining: 0 });

        const unpaidAccrualRows = targetEmployees
            .map(emp => {
                const inRangeTx = transactions.filter(t =>
                    t.status !== 'DRAFT' &&
                    t.employeeId === emp.id &&
                    t.date >= startDate &&
                    t.date <= endDate
                );
                const accrued = inRangeTx
                    .filter(t => t.category === 'salaries' && t.creditAccountId === 'acc_accrued_salaries')
                    .reduce((sum, t) => sum + (t.amount || 0), 0);
                const deductions = inRangeTx
                    .filter(t => t.category === 'employee_deduction')
                    .reduce((sum, t) => sum + (t.amount || 0), 0);
                const paid = inRangeTx
                    .filter(t =>
                        t.category === 'salary_payment' ||
                        (t.category === 'salaries' && !!t.creditAccountId && t.creditAccountId !== 'acc_accrued_salaries')
                    )
                    .reduce((sum, t) => sum + (t.amount || 0), 0);
                const netAccrued = accrued - deductions;
                const unpaid = netAccrued - paid;
                return { emp, accrued, deductions, netAccrued, paid, unpaid };
            })
            .filter(row => row.accrued > 0 || row.unpaid > 0.001);

        const unpaidAccrualTotals = unpaidAccrualRows.reduce((sum, row) => ({
            accrued: sum.accrued + row.accrued,
            deductions: sum.deductions + row.deductions,
            netAccrued: sum.netAccrued + row.netAccrued,
            paid: sum.paid + row.paid,
            unpaid: sum.unpaid + row.unpaid
        }), { accrued: 0, deductions: 0, netAccrued: 0, paid: 0, unpaid: 0 });

        const advanceRows = targetEmployees.map(emp => {
            const employeeTx = transactions
                .filter(t => t.status !== 'DRAFT' && t.employeeId === emp.id)
                .sort((a, b) => a.date.localeCompare(b.date));

            const isAdvanceTx = (category: string) => category === 'employee_advance';
            const isSettlementTx = (category: string, description: string) =>
                category === 'employee_payment_received' ||
                (category === 'employee_deduction' && (description.includes('تسوية') || description.toLowerCase().includes('settlement')));

            const openingAdvance = employeeTx
                .filter(t => t.date < startDate && isAdvanceTx(t.category))
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const openingSettlement = employeeTx
                .filter(t => t.date < startDate && isSettlementTx(t.category, t.description || ''))
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const openingBalance = openingAdvance - openingSettlement;

            const periodAdvance = employeeTx
                .filter(t => t.date >= startDate && t.date <= endDate && isAdvanceTx(t.category))
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const periodSettlement = employeeTx
                .filter(t => t.date >= startDate && t.date <= endDate && isSettlementTx(t.category, t.description || ''))
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const closingBalance = openingBalance + periodAdvance - periodSettlement;

            const periodMovements = employeeTx
                .filter(t =>
                    t.date >= startDate &&
                    t.date <= endDate &&
                    (isAdvanceTx(t.category) || isSettlementTx(t.category, t.description || ''))
                )
                .map(t => ({
                    id: t.id,
                    date: t.date,
                    description: t.description || '',
                    kind: isAdvanceTx(t.category) ? 'ADVANCE' as const : 'SETTLEMENT' as const,
                    amount: t.amount || 0
                }));

            return { emp, openingBalance, periodAdvance, periodSettlement, closingBalance, periodMovements };
        });

        const activeAdvanceRows = advanceRows.filter(row =>
            Math.abs(row.openingBalance) > 0.001 ||
            Math.abs(row.periodAdvance) > 0.001 ||
            Math.abs(row.periodSettlement) > 0.001 ||
            Math.abs(row.closingBalance) > 0.001
        );

        const advanceTotals = activeAdvanceRows.reduce((sum, row) => ({
            opening: sum.opening + row.openingBalance,
            advances: sum.advances + row.periodAdvance,
            settlements: sum.settlements + row.periodSettlement,
            closing: sum.closing + row.closingBalance
        }), { opening: 0, advances: 0, settlements: 0, closing: 0 });

        const advanceMovementRows = activeAdvanceRows.flatMap(row => {
            let running = row.openingBalance;
            return row.periodMovements.map(movement => {
                running += movement.kind === 'ADVANCE' ? movement.amount : -movement.amount;
                return {
                    ...movement,
                    employeeName: row.emp.name,
                    employeeCode: row.emp.code,
                    runningBalance: running
                };
            });
        }).sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.employeeName !== b.employeeName) return a.employeeName.localeCompare(b.employeeName, 'ar');
            return a.id.localeCompare(b.id);
        });

        return (
            <div className="space-y-3 sm:space-y-4 animate-in slide-in-from-bottom-4">
                <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><FileText size={16} /></div>
                            <div>
                                <h3 className="font-black text-sm text-gray-800">{tr('تقارير الموظفين', 'Employee Reports')}</h3>
                                <p className="text-[10px] text-gray-400 font-bold">{tr('فلترة حسب التاريخ والموظف', 'Filter by date and employee')}</p>
                            </div>
                        </div>
                        {activeEmployeeReport !== 'MENU' && (
                            <button
                                type="button"
                                onClick={() => setActiveEmployeeReport('MENU')}
                                className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg text-[10px] font-black hover:bg-indigo-100 flex items-center gap-1"
                            >
                                <ArrowRight size={12} />
                                {tr('رجوع للتقارير', 'Back to Reports')}
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <EnglishDateInput
                            value={reportStartDate}
                            onChange={setReportStartDate}
                            className="w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-bold outline-none"
                            aria-label={tr('بداية التقرير', 'Report start date')}
                        />
                        <EnglishDateInput
                            value={reportEndDate}
                            onChange={setReportEndDate}
                            className="w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-bold outline-none"
                            aria-label={tr('نهاية التقرير', 'Report end date')}
                        />
                        <select value={reportEmployeeId} onChange={e => setReportEmployeeId(e.target.value)} className="col-span-2 sm:col-span-1 w-full h-10 px-3 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-black outline-none">
                            <option value="">{tr('جميع الموظفين', 'All Employees')}</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.code} - {emp.name}</option>
                            ))}
                        </select>
                    </div>
                    {rawStartDate > rawEndDate && (
                        <p className="text-[9px] text-amber-600 font-black">{tr('تم ترتيب تاريخ البداية والنهاية تلقائياً.', 'Start and end dates were auto-corrected.')}</p>
                    )}
                </div>

                {activeEmployeeReport === 'MENU' && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                        {employeeReportCards.map(card => (
                            <button
                                key={card.id}
                                type="button"
                                onClick={() => setActiveEmployeeReport(card.id)}
                                className="bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between text-right hover:shadow-md transition-all active:scale-[0.99] min-h-[66px]"
                            >
                                <div className="flex-1">
                                    <h4 className="font-black text-[11px] leading-4 text-gray-800">{card.title}</h4>
                                    <p className="text-[9px] text-gray-400 font-bold mt-0.5 hidden sm:block">{card.subtitle}</p>
                                </div>
                                <div className={`p-1.5 rounded-lg border ${card.colorClass}`}>{card.icon}</div>
                            </button>
                        ))}
                    </div>
                )}

                {activeEmployeeReport === 'ATTENDANCE_SUMMARY' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex items-center gap-2">
                            <CalendarCheck size={16} className="text-purple-600" />
                            <h4 className="font-black text-sm text-gray-800">{tr('ملخص دوام الموظف', 'Employee Attendance Summary')}</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50/70 border-b border-gray-100">
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('أيام حضور', 'Present Days')}</p>
                                <p className="text-sm font-black text-emerald-600 dir-ltr">{attendanceTotals.presentDays}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('أيام غياب', 'Absent Days')}</p>
                                <p className="text-sm font-black text-rose-600 dir-ltr">{attendanceTotals.absentDays}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('إجمالي الساعات', 'Total Hours')}</p>
                                <p className="text-sm font-black text-blue-700 dir-ltr">{attendanceTotals.totalHours.toFixed(2)}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('ساعات إضافية', 'Overtime Hours')}</p>
                                <p className="text-sm font-black text-amber-600 dir-ltr">{attendanceTotals.overtimeHours.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-right min-w-[860px]">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                    <tr>
                                        <th className="p-3">{tr('الموظف', 'Employee')}</th>
                                        <th className="p-3 text-center">{tr('أيام مسجلة', 'Tracked Days')}</th>
                                        <th className="p-3 text-center">{tr('حضور', 'Present')}</th>
                                        <th className="p-3 text-center">{tr('غياب', 'Absent')}</th>
                                        <th className="p-3 text-center">{tr('ساعات فعلية', 'Actual Hours')}</th>
                                        <th className="p-3 text-center">{tr('ساعات متوقعة', 'Expected Hours')}</th>
                                        <th className="p-3 text-center">{tr('ساعات إضافية', 'Overtime')}</th>
                                        <th className="p-3 text-center">{tr('عجز ساعات', 'Shortage')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-xs">
                                    {attendanceRows.map(row => (
                                        <tr key={row.emp.id} className="hover:bg-gray-50">
                                            <td className="p-3 font-black text-gray-700">{row.emp.name} <span className="text-[9px] text-gray-400 font-bold">({row.emp.code})</span></td>
                                            <td className="p-3 text-center dir-ltr">{row.trackedDays}</td>
                                            <td className="p-3 text-center dir-ltr text-emerald-600 font-black">{row.presentDays}</td>
                                            <td className="p-3 text-center dir-ltr text-rose-600 font-black">{row.absentDays}</td>
                                            <td className="p-3 text-center dir-ltr">{row.totalHours.toFixed(2)}</td>
                                            <td className="p-3 text-center dir-ltr">{row.expectedHours.toFixed(2)}</td>
                                            <td className="p-3 text-center dir-ltr text-amber-600">{row.overtimeHours.toFixed(2)}</td>
                                            <td className="p-3 text-center dir-ltr text-rose-600">{row.shortageHours.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {attendanceRows.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا يوجد موظفون لعرض التقرير', 'No employees to show in this report')}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeEmployeeReport === 'DAILY_ATTENDANCE' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex items-center gap-2">
                            <Timer size={16} className="text-fuchsia-600" />
                            <h4 className="font-black text-sm text-gray-800">{tr('تقرير الدوام اليومي (قابل للتعديل)', 'Daily Attendance Report (Editable)')}</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50/70 border-b border-gray-100">
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('أيام ضمن الفترة', 'Days in Period')}</p>
                                <p className="text-sm font-black text-blue-700 dir-ltr">{attendanceDaysInRange.length}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('سجلات حضور', 'Present Records')}</p>
                                <p className="text-sm font-black text-emerald-600 dir-ltr">{dailyAttendanceTotals.present}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('سجلات ناقصة', 'Partial Records')}</p>
                                <p className="text-sm font-black text-amber-600 dir-ltr">{dailyAttendanceTotals.partial}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('إجمالي ساعات فعلية', 'Total Actual Hours')}</p>
                                <p className="text-sm font-black text-indigo-600 dir-ltr">{dailyAttendanceTotals.workedHours.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-right min-w-[1180px]">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                    <tr>
                                        <th className="p-3">{tr('التاريخ', 'Date')}</th>
                                        <th className="p-3">{tr('الموظف', 'Employee')}</th>
                                        <th className="p-3 text-center">{tr('الدخول', 'In')}</th>
                                        <th className="p-3 text-center">{tr('الخروج', 'Out')}</th>
                                        <th className="p-3 text-center">{tr('الساعات', 'Hours')}</th>
                                        <th className="p-3 text-center">{tr('الإضافي', 'Overtime')}</th>
                                        <th className="p-3 text-center">{tr('العجز', 'Shortage')}</th>
                                        <th className="p-3 text-center">{tr('الحالة', 'Status')}</th>
                                        <th className="p-3">{tr('ملاحظة', 'Note')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-xs">
                                    {attendanceDailyRows.map(row => (
                                        <tr key={`${row.date}-${row.emp.id}`} className="hover:bg-gray-50">
                                            <td className="p-3 font-bold text-gray-600">{row.date}</td>
                                            <td className="p-3 font-black text-gray-700">{row.emp.name} <span className="text-[9px] text-gray-400 font-bold">({row.emp.code})</span></td>
                                            <td className="p-2.5">
                                                <input
                                                    type="time"
                                                    value={row.inTime}
                                                    onChange={e => updateAttendanceByDate(row.date, row.emp.id, 'inTime', e.target.value)}
                                                    className="w-full p-2 bg-gray-50 rounded-lg border border-gray-100 text-xs font-black outline-none"
                                                />
                                            </td>
                                            <td className="p-2.5">
                                                <input
                                                    type="time"
                                                    value={row.outTime}
                                                    onChange={e => updateAttendanceByDate(row.date, row.emp.id, 'outTime', e.target.value)}
                                                    className="w-full p-2 bg-gray-50 rounded-lg border border-gray-100 text-xs font-black outline-none"
                                                />
                                            </td>
                                            <td className="p-3 text-center dir-ltr">{row.workedHours.toFixed(2)}</td>
                                            <td className="p-3 text-center dir-ltr text-amber-600">{row.overtimeHours.toFixed(2)}</td>
                                            <td className="p-3 text-center dir-ltr text-rose-600">{row.shortageHours.toFixed(2)}</td>
                                            <td className="p-3 text-center">
                                                {row.status === 'PRESENT' && <span className="px-2 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700">{tr('حضور', 'Present')}</span>}
                                                {row.status === 'PARTIAL' && <span className="px-2 py-1 rounded-md text-[10px] font-black bg-amber-50 text-amber-700">{tr('ناقص', 'Partial')}</span>}
                                                {row.status === 'ABSENT' && <span className="px-2 py-1 rounded-md text-[10px] font-black bg-rose-50 text-rose-700">{tr('غياب', 'Absent')}</span>}
                                            </td>
                                            <td className="p-2.5">
                                                <input
                                                    type="text"
                                                    value={row.note}
                                                    onChange={e => updateAttendanceByDate(row.date, row.emp.id, 'note', e.target.value)}
                                                    placeholder={tr('ملاحظة', 'Note')}
                                                    className="w-full p-2 bg-gray-50 rounded-lg border border-gray-100 text-xs font-bold outline-none"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    {attendanceDailyRows.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد سجلات ضمن الفترة المحددة', 'No records in selected period')}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeEmployeeReport === 'PAYROLL_STATEMENTS' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex items-center gap-2">
                            <Receipt size={16} className="text-emerald-600" />
                            <h4 className="font-black text-sm text-gray-800">{tr('تقرير كشوفات الرواتب', 'Payroll Statements Report')}</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50/70 border-b border-gray-100">
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('المستحقات', 'Entitlements')}</p>
                                <p className="text-sm font-black text-blue-700 dir-ltr">{payrollTotals.entitlements.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('الخصومات', 'Deductions')}</p>
                                <p className="text-sm font-black text-rose-600 dir-ltr">{payrollTotals.deductions.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('صافي الراتب', 'Net Salary')}</p>
                                <p className="text-sm font-black text-emerald-600 dir-ltr">{payrollTotals.net.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('المدفوع', 'Paid')}</p>
                                <p className="text-sm font-black text-indigo-600 dir-ltr">{payrollTotals.paid.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('المتبقي', 'Remaining')}</p>
                                <p className={`text-sm font-black dir-ltr ${payrollTotals.remaining >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>{payrollTotals.remaining.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-right min-w-[920px]">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                    <tr>
                                        <th className="p-3">{tr('الموظف', 'Employee')}</th>
                                        <th className="p-3 text-center">{tr('المستحقات', 'Entitlements')}</th>
                                        <th className="p-3 text-center">{tr('الخصومات', 'Deductions')}</th>
                                        <th className="p-3 text-center">{tr('الصافي', 'Net')}</th>
                                        <th className="p-3 text-center">{tr('المدفوع', 'Paid')}</th>
                                        <th className="p-3 text-center">{tr('المتبقي', 'Remaining')}</th>
                                        <th className="p-3 text-center">{tr('كشف الموظف', 'Employee Statement')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-xs">
                                    {payrollRowsReport.map(row => (
                                        <tr key={row.emp.id} className="hover:bg-gray-50">
                                            <td className="p-3 font-black text-gray-700">{row.emp.name} <span className="text-[9px] text-gray-400 font-bold">({row.emp.code})</span></td>
                                            <td className="p-3 text-center dir-ltr text-blue-700">{row.entitlements.toLocaleString()}</td>
                                            <td className="p-3 text-center dir-ltr text-rose-600">-{row.deductions.toLocaleString()}</td>
                                            <td className="p-3 text-center dir-ltr text-emerald-600 font-black">{row.net.toLocaleString()}</td>
                                            <td className="p-3 text-center dir-ltr text-indigo-600">{row.paid.toLocaleString()}</td>
                                            <td className={`p-3 text-center dir-ltr font-black ${row.remaining >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>{row.remaining.toLocaleString()}</td>
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => openEmployeeStatement(row.emp.id)}
                                                    className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg text-[10px] font-black hover:bg-indigo-100"
                                                >
                                                    {tr('فتح الكشف', 'Open Statement')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {payrollRowsReport.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد بيانات رواتب ضمن الفترة المحددة', 'No payroll data in selected period')}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeEmployeeReport === 'UNPAID_ACCRUALS' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex items-center gap-2">
                            <AlertCircle size={16} className="text-rose-600" />
                            <h4 className="font-black text-sm text-gray-800">{tr('تقرير استحقاقات الرواتب غير المصروفة', 'Unpaid Payroll Accruals Report')}</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50/70 border-b border-gray-100">
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('استحقاق مرحل', 'Posted Accrual')}</p>
                                <p className="text-sm font-black text-blue-700 dir-ltr">{unpaidAccrualTotals.accrued.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('الخصومات', 'Deductions')}</p>
                                <p className="text-sm font-black text-rose-600 dir-ltr">{unpaidAccrualTotals.deductions.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('صافي الاستحقاق', 'Net Accrual')}</p>
                                <p className="text-sm font-black text-emerald-600 dir-ltr">{unpaidAccrualTotals.netAccrued.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('مدفوع من الذمم', 'Paid from liabilities')}</p>
                                <p className="text-sm font-black text-indigo-600 dir-ltr">{unpaidAccrualTotals.paid.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('غير مصروف', 'Unpaid')}</p>
                                <p className={`text-sm font-black dir-ltr ${unpaidAccrualTotals.unpaid > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{unpaidAccrualTotals.unpaid.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-right min-w-[980px]">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                    <tr>
                                        <th className="p-3">{tr('الموظف', 'Employee')}</th>
                                        <th className="p-3 text-center">{tr('استحقاق', 'Accrual')}</th>
                                        <th className="p-3 text-center">{tr('خصومات', 'Deductions')}</th>
                                        <th className="p-3 text-center">{tr('صافي مستحق', 'Net Due')}</th>
                                        <th className="p-3 text-center">{tr('مدفوع', 'Paid')}</th>
                                        <th className="p-3 text-center">{tr('غير مصروف', 'Unpaid')}</th>
                                        <th className="p-3 text-center">{tr('كشف الموظف', 'Employee Statement')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-xs">
                                    {[...unpaidAccrualRows].sort((a, b) => b.unpaid - a.unpaid).map(row => (
                                        <tr key={row.emp.id} className="hover:bg-gray-50">
                                            <td className="p-3 font-black text-gray-700">{row.emp.name} <span className="text-[9px] text-gray-400 font-bold">({row.emp.code})</span></td>
                                            <td className="p-3 text-center dir-ltr text-blue-700">{row.accrued.toLocaleString()}</td>
                                            <td className="p-3 text-center dir-ltr text-rose-600">-{row.deductions.toLocaleString()}</td>
                                            <td className="p-3 text-center dir-ltr text-emerald-600">{row.netAccrued.toLocaleString()}</td>
                                            <td className="p-3 text-center dir-ltr text-indigo-600">{row.paid.toLocaleString()}</td>
                                            <td className={`p-3 text-center dir-ltr font-black ${row.unpaid > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{row.unpaid.toLocaleString()}</td>
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => openEmployeeStatement(row.emp.id)}
                                                    className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg text-[10px] font-black hover:bg-indigo-100"
                                                >
                                                    {tr('فتح الكشف', 'Open Statement')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {unpaidAccrualRows.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد استحقاقات غير مصروفة ضمن الفترة المحددة', 'No unpaid accruals in selected period')}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeEmployeeReport === 'ADVANCES_SETTLEMENTS' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex items-center gap-2">
                            <Wallet size={16} className="text-amber-600" />
                            <h4 className="font-black text-sm text-gray-800">{tr('تقرير سلف الموظفين وتسوياتها (حركة + رصيد)', 'Employee Advances and Settlements (Movements + Balance)')}</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50/70 border-b border-gray-100">
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('رصيد افتتاحي', 'Opening Balance')}</p>
                                <p className="text-sm font-black text-blue-700 dir-ltr">{advanceTotals.opening.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('سلف الفترة', 'Period Advances')}</p>
                                <p className="text-sm font-black text-amber-600 dir-ltr">{advanceTotals.advances.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('تسويات الفترة', 'Period Settlements')}</p>
                                <p className="text-sm font-black text-emerald-600 dir-ltr">{advanceTotals.settlements.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
                                <p className="text-[9px] text-gray-400 font-black">{tr('رصيد ختامي', 'Closing Balance')}</p>
                                <p className={`text-sm font-black dir-ltr ${advanceTotals.closing > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{advanceTotals.closing.toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="overflow-x-auto border-b border-gray-100">
                            <table className="w-full text-right min-w-[980px]">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                    <tr>
                                        <th className="p-3">{tr('الموظف', 'Employee')}</th>
                                        <th className="p-3 text-center">{tr('افتتاحي', 'Opening')}</th>
                                        <th className="p-3 text-center">{tr('سلف الفترة', 'Period Advances')}</th>
                                        <th className="p-3 text-center">{tr('تسويات الفترة', 'Period Settlements')}</th>
                                        <th className="p-3 text-center">{tr('ختامي', 'Closing')}</th>
                                        <th className="p-3 text-center">{tr('كشف الموظف', 'Employee Statement')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-xs">
                                    {activeAdvanceRows.map(row => (
                                        <tr key={row.emp.id} className="hover:bg-gray-50">
                                            <td className="p-3 font-black text-gray-700">{row.emp.name} <span className="text-[9px] text-gray-400 font-bold">({row.emp.code})</span></td>
                                            <td className="p-3 text-center dir-ltr">{row.openingBalance.toLocaleString()}</td>
                                            <td className="p-3 text-center dir-ltr text-amber-600">+{row.periodAdvance.toLocaleString()}</td>
                                            <td className="p-3 text-center dir-ltr text-emerald-600">-{row.periodSettlement.toLocaleString()}</td>
                                            <td className={`p-3 text-center dir-ltr font-black ${row.closingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{row.closingBalance.toLocaleString()}</td>
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => openEmployeeStatement(row.emp.id)}
                                                    className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg text-[10px] font-black hover:bg-indigo-100"
                                                >
                                                    {tr('فتح الكشف', 'Open Statement')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {activeAdvanceRows.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد حركة سلف أو تسويات ضمن الفترة المحددة', 'No advances or settlements in selected period')}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-right min-w-[980px]">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase">
                                    <tr>
                                        <th className="p-3">{tr('التاريخ', 'Date')}</th>
                                        <th className="p-3">{tr('الموظف', 'Employee')}</th>
                                        <th className="p-3 text-center">{tr('النوع', 'Type')}</th>
                                        <th className="p-3">{tr('البيان', 'Description')}</th>
                                        <th className="p-3 text-center">{tr('المبلغ', 'Amount')}</th>
                                        <th className="p-3 text-center">{tr('الرصيد بعد الحركة', 'Balance After Movement')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-xs">
                                    {advanceMovementRows.map(row => (
                                        <tr key={`${row.id}-${row.employeeCode}`} className="hover:bg-gray-50">
                                            <td className="p-3">{row.date}</td>
                                            <td className="p-3 font-bold text-gray-700">{row.employeeName} <span className="text-[9px] text-gray-400 font-bold">({row.employeeCode})</span></td>
                                            <td className="p-3 text-center">
                                                {row.kind === 'ADVANCE'
                                                    ? <span className="px-2 py-1 rounded-md text-[10px] font-black bg-amber-50 text-amber-700">{tr('سلفة', 'Advance')}</span>
                                                    : <span className="px-2 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700">{tr('تسوية', 'Settlement')}</span>}
                                            </td>
                                            <td className="p-3">{row.description || '-'}</td>
                                            <td className={`p-3 text-center dir-ltr font-black ${row.kind === 'ADVANCE' ? 'text-amber-600' : 'text-emerald-600'}`}>{row.kind === 'ADVANCE' ? '+' : '-'}{row.amount.toLocaleString()}</td>
                                            <td className={`p-3 text-center dir-ltr font-black ${row.runningBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{row.runningBalance.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    {advanceMovementRows.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-4 text-center text-xs font-bold text-gray-400">{tr('لا توجد حركات ضمن الفترة المحددة', 'No movements in selected period')}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        );
    };





    // ===== ENHANCED EMPLOYEE STATEMENT MODAL =====
    const renderEmployeeStatementModal = () => {
        if (!viewStatementId) return null;
        const emp = employees.find(e => e.id === viewStatementId);
        if (!emp) return null;

        const employeeIndex = employees.findIndex(e => e.id === viewStatementId);
        const previousEmployee = employeeIndex > 0 ? employees[employeeIndex - 1] : null;
        const nextEmployee = employeeIndex >= 0 && employeeIndex < employees.length - 1 ? employees[employeeIndex + 1] : null;

        const selectedRange = statementRanges[viewStatementId] || { startDate: currentFiscalYearRange.startDate, endDate: currentFiscalYearRange.endDate };
        const rawStartDate = selectedRange.startDate || currentFiscalYearRange.startDate;
        const rawEndDate = selectedRange.endDate || currentFiscalYearRange.endDate;
        const statementStartDate = rawStartDate <= rawEndDate ? rawStartDate : rawEndDate;
        const statementEndDate = rawStartDate <= rawEndDate ? rawEndDate : rawStartDate;
        const showPayrollSummary = statementPayrollSummaryVisibility[viewStatementId] ?? false;
        const openStatementPeriod = (range: StatementRange) => {
            updateStatementRange(emp.id, normalizeRange(range));
            setEmployeeStatementPayrollSummaryVisible(emp.id, true);
        };

        const safeFormatDate = (dateString: string | undefined) => {
            if (!dateString) return '';
            const d = new Date(dateString);
            return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
        };

        type StatementEntry = { date: string; description: string; debit: number; credit: number; category: string; id: string };
        const entries: StatementEntry[] = [];

        // 1. Salary accrual transactions (increase employee dues)
        transactions
            .filter(t => t.employeeId === viewStatementId && t.category === 'salaries' && (!t.creditAccountId || t.creditAccountId === 'acc_accrued_salaries'))
            .forEach(t => {
                entries.push({ date: t.date, description: t.description, debit: t.amount, credit: 0, category: 'salary', id: t.id });
            });

        // 2. Salary payment transactions (decrease employee dues)
        transactions
            .filter(t =>
                t.employeeId === viewStatementId &&
                (
                    t.category === 'salary_payment' ||
                    (t.category === 'salaries' && !!t.creditAccountId && t.creditAccountId !== 'acc_accrued_salaries')
                )
            )
            .forEach(t => {
                entries.push({ date: t.date, description: t.description, debit: 0, credit: t.amount, category: 'salary_payment', id: t.id });
            });

        // 3. Direct salary payment (compound entry: expense -> cash), shown for traceability with zero effect on employee balance
        transactions
            .filter(t => t.employeeId === viewStatementId && t.category === 'salary_direct_payment')
            .forEach(t => {
                entries.push({ date: t.date, description: t.description, debit: t.amount, credit: t.amount, category: 'direct_salary', id: t.id });
            });

        // 4. Advance transactions
        transactions
            .filter(t => t.employeeId === viewStatementId && t.category === 'employee_advance')
            .forEach(t => {
                entries.push({ date: t.date, description: t.description, debit: t.amount, credit: 0, category: 'advance', id: t.id });
            });

        // 5. Collection transactions (payments received from employee)
        transactions
            .filter(t => t.employeeId === viewStatementId && t.category === 'employee_payment_received')
            .forEach(t => {
                entries.push({ date: t.date, description: t.description, debit: 0, credit: t.amount, category: 'collection', id: t.id });
            });

        // 6. Employee deductions from dues (reduce payable)
        transactions
            .filter(t => t.employeeId === viewStatementId && t.category === 'employee_deduction')
            .forEach(t => {
                entries.push({ date: t.date, description: t.description, debit: 0, credit: t.amount, category: 'deduction', id: t.id });
            });

        // 7. Sales invoices linked to this employee (via contacts)
        const empContact = contacts.find(c => c.name === emp.name && c.type === 'EMPLOYEE');
        if (empContact) {
            invoices
                .filter(inv => inv.customerId === empContact.id && inv.type === TransactionType.INCOME)
                .forEach(inv => {
                    entries.push({
                        date: inv.date,
                        description: `${tr('فاتورة مبيعات', 'Sales Invoice')} #${inv.invoiceNumber}`,
                        debit: inv.totalAmount,
                        credit: 0,
                        category: 'sale',
                        id: inv.id
                    });
                });
        }

        entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const openingBalance = entries
            .filter(e => e.date < statementStartDate)
            .reduce((sum, e) => sum + e.debit - e.credit, 0);

        const rangeEntries = entries.filter(e => e.date >= statementStartDate && e.date <= statementEndDate);

        let runningBalance = openingBalance;
        const statementsWithBalance = rangeEntries.map(e => {
            runningBalance += e.debit - e.credit;
            return { ...e, balance: runningBalance };
        });

        const displayEntries = [...statementsWithBalance].reverse();

        const totalDebit = rangeEntries.reduce((s, e) => s + e.debit, 0);
        const totalCredit = rangeEntries.reduce((s, e) => s + e.credit, 0);
        const closingBalance = openingBalance + (totalDebit - totalCredit);

        const firstEntryDate = entries[0]?.date;
        const lastEntryDate = entries[entries.length - 1]?.date;

        type PayrollMonthlyStatementShortcut = {
            key: string;
            range: StatementRange;
            sourceDate: string;
            sourceTxId: string;
            isDirectOnly: boolean;
            title: string;
        };
        const payrollMonthlyStatementsMap = transactions
            .filter(t =>
                t.status !== 'DRAFT' &&
                t.employeeId === viewStatementId &&
                (
                    (t.category === 'salaries' && (!t.creditAccountId || t.creditAccountId === 'acc_accrued_salaries')) ||
                    t.category === 'salary_direct_payment'
                )
            )
            .reduce((map, t) => {
                const parsedRange = extractPayrollRangeFromText(t.description) || { startDate: t.date, endDate: t.date };
                const rangeKey = `${parsedRange.startDate}|${parsedRange.endDate}`;
                if (!map.has(rangeKey)) {
                    map.set(rangeKey, {
                        key: rangeKey,
                        range: parsedRange,
                        sourceDate: t.date,
                        sourceTxId: t.id,
                        isDirectOnly: t.category === 'salary_direct_payment',
                        title: `${safeFormatDate(parsedRange.startDate)} - ${safeFormatDate(parsedRange.endDate)}`
                    });
                } else if (t.category !== 'salary_direct_payment') {
                    const current = map.get(rangeKey)!;
                    map.set(rangeKey, { ...current, isDirectOnly: false });
                }
                return map;
            }, new Map<string, PayrollMonthlyStatementShortcut>());

        const payrollMonthlyStatements = ([...payrollMonthlyStatementsMap.values()] as PayrollMonthlyStatementShortcut[]).sort((a, b) => {
            if (a.range.endDate !== b.range.endDate) return b.range.endDate.localeCompare(a.range.endDate);
            return b.sourceDate.localeCompare(a.sourceDate);
        });

        const getCategoryLabel = (cat: string) => {
            switch (cat) {
                case 'salary': return { label: tr('استحقاق راتب', 'Salary Accrual'), color: 'bg-blue-50 text-blue-600', icon: <DollarSign size={12} /> };
                case 'salary_payment': return { label: tr('صرف راتب', 'Salary Payment'), color: 'bg-emerald-50 text-emerald-600', icon: <Banknote size={12} /> };
                case 'direct_salary': return { label: tr('استحقاق وصرف مباشر', 'Direct Accrual & Payment'), color: 'bg-cyan-50 text-cyan-600', icon: <Banknote size={12} /> };
                case 'advance': return { label: tr('سلفة', 'Advance'), color: 'bg-orange-50 text-orange-600', icon: <HandCoins size={12} /> };
                case 'collection': return { label: tr('قبض', 'Receipt'), color: 'bg-green-50 text-green-600', icon: <Wallet size={12} /> };
                case 'deduction': return { label: tr('خصم', 'Deduction'), color: 'bg-rose-50 text-rose-600', icon: <ArrowDownLeft size={12} /> };
                case 'sale': return { label: tr('بيع', 'Sale'), color: 'bg-purple-50 text-purple-600', icon: <ShoppingBag size={12} /> };
                default: return { label: tr('أخرى', 'Other'), color: 'bg-gray-50 text-gray-600', icon: <FileText size={12} /> };
            }
        };

        const isLatePenaltyDeduction = (description: string) =>
            description.includes('خصم تأخير') || description.toLowerCase().includes('late penalty');
        const isDuesSettlementDeduction = (description: string) =>
            description.includes('خصم تسوية') || description.toLowerCase().includes('dues settlement');
        const computePayrollPeriodSummary = (rangeStartDate: string, rangeEndDate: string) => {
            const payrollAccrualTotal = transactions
                .filter(t =>
                    t.employeeId === viewStatementId &&
                    t.category === 'salaries' &&
                    t.creditAccountId === 'acc_accrued_salaries' &&
                    t.date >= rangeStartDate &&
                    t.date <= rangeEndDate
                )
                .reduce((sum, t) => sum + (t.amount || 0), 0);

            const payrollDirectTotal = transactions
                .filter(t =>
                    t.employeeId === viewStatementId &&
                    t.category === 'salary_direct_payment' &&
                    t.date >= rangeStartDate &&
                    t.date <= rangeEndDate
                )
                .reduce((sum, t) => sum + (t.amount || 0), 0);

            const payrollPaymentTotal = transactions
                .filter(t =>
                    t.employeeId === viewStatementId &&
                    t.category === 'salary_payment' &&
                    t.date >= rangeStartDate &&
                    t.date <= rangeEndDate
                )
                .reduce((sum, t) => sum + (t.amount || 0), 0);

            const payrollDeductionTransactions = transactions.filter(t =>
                t.employeeId === viewStatementId &&
                t.category === 'employee_deduction' &&
                t.date >= rangeStartDate &&
                t.date <= rangeEndDate
            );

            const latePenaltyDeductionTotal = payrollDeductionTransactions
                .filter(t => isLatePenaltyDeduction(t.description || ''))
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const duesSettlementDeductionTotal = payrollDeductionTransactions
                .filter(t => isDuesSettlementDeduction(t.description || ''))
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const otherDeductionTotal = Math.max(
                0,
                payrollDeductionTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) - latePenaltyDeductionTotal - duesSettlementDeductionTotal
            );

            const payrollEntitlementsTotal = payrollAccrualTotal + payrollDirectTotal;
            const payrollDeductionsTotal = latePenaltyDeductionTotal + duesSettlementDeductionTotal + otherDeductionTotal;
            const payrollNetSalary = payrollEntitlementsTotal - payrollDeductionsTotal;
            const payrollPaidTotal = payrollPaymentTotal + payrollDirectTotal;
            const payrollRemaining = payrollNetSalary - payrollPaidTotal;

            return {
                payrollAccrualTotal,
                payrollDirectTotal,
                payrollPaymentTotal,
                latePenaltyDeductionTotal,
                duesSettlementDeductionTotal,
                otherDeductionTotal,
                payrollEntitlementsTotal,
                payrollDeductionsTotal,
                payrollNetSalary,
                payrollPaidTotal,
                payrollRemaining
            };
        };

        const {
            payrollAccrualTotal,
            payrollDirectTotal,
            payrollPaymentTotal,
            latePenaltyDeductionTotal,
            duesSettlementDeductionTotal,
            otherDeductionTotal,
            payrollEntitlementsTotal,
            payrollDeductionsTotal,
            payrollNetSalary,
            payrollPaidTotal,
            payrollRemaining
        } = computePayrollPeriodSummary(statementStartDate, statementEndDate);
        const matchedStatementPayrollRun = payrollRuns.find(run =>
            run.periodStart === statementStartDate &&
            run.periodEnd === statementEndDate &&
            run.employeeIds.includes(emp.id)
        ) || null;
        const hasPayrollSummaryData = Boolean(matchedStatementPayrollRun) || [
            payrollAccrualTotal,
            payrollDirectTotal,
            payrollPaymentTotal,
            latePenaltyDeductionTotal,
            duesSettlementDeductionTotal,
            otherDeductionTotal,
            payrollEntitlementsTotal,
            payrollDeductionsTotal,
            payrollNetSalary,
            payrollPaidTotal,
            payrollRemaining
        ].some(value => Math.abs(value) > 0.001);
        const payrollSummaryCards = [
            { label: tr('إجمالي المستحقات', 'Total Entitlements'), value: payrollEntitlementsTotal, tone: 'text-blue-700 bg-blue-50 border-blue-100' },
            { label: tr('إجمالي الخصومات', 'Total Deductions'), value: payrollDeductionsTotal, tone: 'text-rose-700 bg-rose-50 border-rose-100' },
            { label: tr('صافي الراتب', 'Net Salary'), value: payrollNetSalary, tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
            { label: tr('المدفوع', 'Paid'), value: payrollPaidTotal, tone: 'text-cyan-700 bg-cyan-50 border-cyan-100' },
            { label: tr('المتبقي', 'Remaining'), value: payrollRemaining, tone: 'text-amber-700 bg-amber-50 border-amber-100' }
        ];
        const payrollBreakdownRows = [
            { label: tr('استحقاق راتب مرحّل', 'Posted salary accrual'), value: payrollAccrualTotal, tone: 'text-slate-700' },
            { label: tr('استحقاق وصرف مباشر', 'Direct accrual & payment'), value: payrollDirectTotal, tone: 'text-cyan-700' },
            { label: tr('خصم تأخير/جزاءات', 'Late penalty deduction'), value: -latePenaltyDeductionTotal, tone: 'text-rose-700' },
            { label: tr('خصم تسوية ذمم', 'Dues settlement deduction'), value: -duesSettlementDeductionTotal, tone: 'text-amber-700' },
            { label: tr('خصومات أخرى', 'Other deductions'), value: -otherDeductionTotal, tone: 'text-fuchsia-700' },
            { label: tr('المصروف خلال الفترة', 'Paid during period'), value: payrollPaidTotal, tone: 'text-emerald-700' }
        ];

        const formatNumber = (value: number) => (value || 0).toLocaleString();
        const escapeHtml = (value: string) =>
            value
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#39;');
        const printLocale = isEnglish ? 'en-US' : 'ar-SA-u-nu-latn';
        const printLang = isEnglish ? 'en' : 'ar';
        const printDir = isEnglish ? 'ltr' : 'rtl';
        const printFont = isEnglish ? "'Segoe UI', Arial, sans-serif" : "'Tajawal', Arial, sans-serif";

        const handlePrintPayslip = (rangeOverride?: StatementRange) => {
            const printWindow = window.open('', '_blank', 'width=900,height=700');
            if (!printWindow) return alert(tr('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.', 'Unable to open print window. Please allow pop-ups.'));
            const targetRange = rangeOverride ? normalizeRange(rangeOverride) : { startDate: statementStartDate, endDate: statementEndDate };
            const payslipStartDate = targetRange.startDate;
            const payslipEndDate = targetRange.endDate;
            const {
                payrollAccrualTotal,
                payrollDirectTotal,
                payrollPaymentTotal,
                latePenaltyDeductionTotal,
                duesSettlementDeductionTotal,
                otherDeductionTotal,
                payrollEntitlementsTotal,
                payrollDeductionsTotal,
                payrollNetSalary,
                payrollPaidTotal,
                payrollRemaining
            } = computePayrollPeriodSummary(payslipStartDate, payslipEndDate);
            const matchedPayrollRun = payrollRuns.find(run =>
                run.periodStart === payslipStartDate &&
                run.periodEnd === payslipEndDate &&
                run.employeeIds.includes(emp.id)
            ) || null;

            const html = `
                <!DOCTYPE html>
                <html lang="${printLang}" dir="${printDir}">
                <head>
                    <meta charset="UTF-8" />
                    <title>${tr('كشف راتب', 'Payslip')} - ${escapeHtml(emp.name)}</title>
                    <style>
                        body { font-family: ${printFont}; padding: 22px; color: #0f172a; }
                        .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
                        .title { font-size: 22px; font-weight: 800; margin: 0; }
                        .sub { color: #64748b; font-size: 12px; margin-top: 4px; }
                        .cards { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin: 12px 0; }
                        .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #f8fafc; }
                        .card .lbl { font-size: 11px; color: #64748b; margin-bottom: 5px; }
                        .card .val { font-size: 16px; font-weight: 800; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: center; }
                        th { background: #f1f5f9; font-weight: 800; }
                        td.num { direction: ltr; text-align: left; font-weight: 700; }
                        .tot { font-weight: 800; background: #f8fafc; }
                        .footer { margin-top: 12px; font-size: 11px; color: #64748b; text-align: center; }
                        @media print { body { padding: 10px; } }
                    </style>
                </head>
                <body>
                    <div class="head">
                        <div>
                            <h1 class="title">${tr('كشف راتب موظف', 'Employee Payslip')}</h1>
                            <div class="sub">${tr('الشركة', 'Company')}: ${escapeHtml(companySettings.name || '---')}</div>
                        </div>
                        <div class="sub">
                            <div>${tr('الموظف', 'Employee')}: ${escapeHtml(emp.name)} (${escapeHtml(emp.code)})</div>
                            <div>${tr('المنصب', 'Position')}: ${escapeHtml(emp.position || '-')}</div>
                            ${(emp.bankName || emp.iban) ? `<div>${tr('البنك / IBAN', 'Bank / IBAN')}: ${escapeHtml(emp.bankName || '-')} ${emp.iban ? ` / ${escapeHtml(emp.iban)}` : ''}</div>` : ''}
                            <div>${tr('الفترة', 'Period')}: ${escapeHtml(safeFormatDate(payslipStartDate))} - ${escapeHtml(safeFormatDate(payslipEndDate))}</div>
                            ${matchedPayrollRun ? `<div>${tr('دفعة الرواتب', 'Payroll Run')}: ${escapeHtml(matchedPayrollRun.runNumber)} (${escapeHtml(matchedPayrollRun.status)})</div>` : ''}
                        </div>
                    </div>

                    <div class="cards">
                        <div class="card"><div class="lbl">${tr('إجمالي المستحقات', 'Total Entitlements')}</div><div class="val">${formatNumber(payrollEntitlementsTotal)}</div></div>
                        <div class="card"><div class="lbl">${tr('إجمالي الخصومات', 'Total Deductions')}</div><div class="val">${formatNumber(payrollDeductionsTotal)}</div></div>
                        <div class="card"><div class="lbl">${tr('صافي الراتب', 'Net Salary')}</div><div class="val">${formatNumber(payrollNetSalary)}</div></div>
                        <div class="card"><div class="lbl">${tr('المتبقي', 'Remaining')}</div><div class="val">${formatNumber(payrollRemaining)}</div></div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>${tr('البند', 'Item')}</th>
                                <th>${tr('القيمة', 'Value')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>${tr('استحقاق راتب مرحّل', 'Posted salary accrual')}</td><td class="num">${formatNumber(payrollAccrualTotal)}</td></tr>
                            <tr><td>${tr('استحقاق وصرف مباشر', 'Direct accrual & payment')}</td><td class="num">${formatNumber(payrollDirectTotal)}</td></tr>
                            <tr class="tot"><td>${tr('إجمالي المستحقات', 'Total Entitlements')}</td><td class="num">${formatNumber(payrollEntitlementsTotal)}</td></tr>
                            <tr><td>${tr('خصم تأخير/جزاءات', 'Late penalty deduction')}</td><td class="num">-${formatNumber(latePenaltyDeductionTotal)}</td></tr>
                            <tr><td>${tr('خصم تسوية ذمم', 'Dues settlement deduction')}</td><td class="num">-${formatNumber(duesSettlementDeductionTotal)}</td></tr>
                            <tr><td>${tr('خصومات أخرى', 'Other deductions')}</td><td class="num">-${formatNumber(otherDeductionTotal)}</td></tr>
                            <tr class="tot"><td>${tr('إجمالي الخصومات', 'Total Deductions')}</td><td class="num">-${formatNumber(payrollDeductionsTotal)}</td></tr>
                            <tr class="tot"><td>${tr('صافي الراتب', 'Net Salary')}</td><td class="num">${formatNumber(payrollNetSalary)}</td></tr>
                            <tr><td>${tr('المصروف خلال الفترة', 'Paid during period')}</td><td class="num">${formatNumber(payrollPaidTotal)}</td></tr>
                            <tr class="tot"><td>${tr('المتبقي للموظف', 'Remaining for employee')}</td><td class="num">${formatNumber(payrollRemaining)}</td></tr>
                        </tbody>
                    </table>
                    <div class="footer">${tr('تمت الطباعة بتاريخ', 'Printed on')} ${escapeHtml(new Date().toLocaleString(printLocale))}</div>
                </body>
                </html>
            `;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 300);
        };

        const handlePrintStatement = () => {
            const printWindow = window.open('', '_blank', 'width=1000,height=720');
            if (!printWindow) return alert(tr('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.', 'Unable to open print window. Please allow pop-ups.'));

            const rowsHtml = statementsWithBalance.length > 0
                ? statementsWithBalance.map((entry, idx) => {
                    const catLabel = getCategoryLabel(entry.category).label;
                    return `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${escapeHtml(safeFormatDate(entry.date))}</td>
                            <td>${escapeHtml(catLabel)}</td>
                            <td>${escapeHtml(entry.description || '')}</td>
                            <td class="num">${entry.debit > 0 ? formatNumber(entry.debit) : '-'}</td>
                            <td class="num">${entry.credit > 0 ? formatNumber(entry.credit) : '-'}</td>
                            <td class="num">${formatNumber(entry.balance)}</td>
                        </tr>
                    `;
                }).join('')
                : `
                    <tr>
                        <td colspan="7" class="empty">${tr('لا توجد حركات ضمن الفترة المحددة', 'No movements in selected period')}</td>
                    </tr>
                `;
            const payrollSummarySectionHtml = showPayrollSummary ? `
                <div class="payroll-section">
                    <div class="payroll-head">
                        <div>
                            <div class="payroll-title">${tr('ملخص كشف الراتب', 'Payroll summary')}</div>
                            <div class="sub">${tr('الفترة', 'Period')}: ${escapeHtml(safeFormatDate(statementStartDate))} - ${escapeHtml(safeFormatDate(statementEndDate))}</div>
                        </div>
                        ${matchedStatementPayrollRun
                            ? `<div class="payroll-pill">${tr('دفعة الرواتب', 'Payroll Run')}: ${escapeHtml(matchedStatementPayrollRun.runNumber)} (${escapeHtml(matchedStatementPayrollRun.status)})</div>`
                            : ''
                        }
                    </div>
                    ${hasPayrollSummaryData
                        ? `
                            <div class="payroll-grid">
                                ${payrollSummaryCards.map(card => `
                                    <div class="payroll-card">
                                        <div class="k">${escapeHtml(card.label)}</div>
                                        <div class="v">${escapeHtml(formatNumber(card.value))}</div>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="payroll-lines">
                                ${payrollBreakdownRows.map(row => `
                                    <div class="payroll-line">
                                        <span>${escapeHtml(row.label)}</span>
                                        <strong class="num">${escapeHtml(formatNumber(row.value))}</strong>
                                    </div>
                                `).join('')}
                            </div>
                        `
                        : `<div class="empty">${tr('لا توجد بيانات رواتب ضمن الفترة المحددة', 'No payroll data in selected period')}</div>`
                    }
                </div>
            ` : '';

            const html = `
                <!DOCTYPE html>
                <html lang="${printLang}" dir="${printDir}">
                <head>
                    <meta charset="UTF-8" />
                    <title>${tr('كشف موظف', 'Employee Statement')} - ${escapeHtml(emp.name)}</title>
                    <style>
                        body { font-family: ${printFont}; padding: 24px; color: #0f172a; }
                        .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
                        .title { font-size: 22px; font-weight: 800; margin: 0; }
                        .sub { color: #64748b; font-size: 12px; margin-top: 4px; }
                        .cards { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin: 14px 0; }
                        .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #f8fafc; }
                        .card .lbl { font-size: 11px; color: #64748b; margin-bottom: 6px; }
                        .card .val { font-size: 16px; font-weight: 800; }
                        .payroll-section { margin: 14px 0; border: 1px solid #dbeafe; border-radius: 10px; padding: 12px; background: #f8fbff; }
                        .payroll-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 10px; }
                        .payroll-title { font-size: 15px; font-weight: 800; }
                        .payroll-pill { border: 1px solid #c7d2fe; border-radius: 999px; padding: 4px 10px; background: #eef2ff; color: #3730a3; font-size: 11px; font-weight: 800; }
                        .payroll-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
                        .payroll-card { border: 1px solid #dbeafe; border-radius: 8px; padding: 8px; background: #fff; }
                        .payroll-card .k { font-size: 10px; color: #64748b; margin-bottom: 5px; }
                        .payroll-card .v { font-size: 15px; font-weight: 800; }
                        .payroll-lines { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
                        .payroll-line { display: flex; justify-content: space-between; gap: 8px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; background: #fff; font-size: 11px; font-weight: 700; }
                        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
                        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: center; }
                        th { background: #f1f5f9; font-weight: 800; }
                        td.num { direction: ltr; text-align: left; font-weight: 700; }
                        .empty { color: #94a3b8; padding: 20px; }
                        .footer { margin-top: 14px; font-size: 11px; color: #64748b; text-align: center; }
                        @media print { body { padding: 10px; } }
                    </style>
                </head>
                <body>
                    <div class="head">
                        <div>
                            <h1 class="title">${tr('كشف حساب الموظف', 'Employee Account Statement')}</h1>
                            <div class="sub">${tr('الشركة', 'Company')}: ${escapeHtml(companySettings.name || '---')}</div>
                        </div>
                        <div class="sub">
                            <div>${tr('الموظف', 'Employee')}: ${escapeHtml(emp.name)} (${escapeHtml(emp.code)})</div>
                            <div>${tr('المنصب', 'Position')}: ${escapeHtml(emp.position || '-')}</div>
                            <div>${tr('الفترة', 'Period')}: ${escapeHtml(safeFormatDate(statementStartDate))} - ${escapeHtml(safeFormatDate(statementEndDate))}</div>
                        </div>
                    </div>

                    <div class="cards">
                        <div class="card"><div class="lbl">${tr('رصيد افتتاحي', 'Opening Balance')}</div><div class="val">${formatNumber(openingBalance)}</div></div>
                        <div class="card"><div class="lbl">${tr('مدين الفترة', 'Period Debit')}</div><div class="val">${formatNumber(totalDebit)}</div></div>
                        <div class="card"><div class="lbl">${tr('دائن الفترة', 'Period Credit')}</div><div class="val">${formatNumber(totalCredit)}</div></div>
                        <div class="card"><div class="lbl">${tr('رصيد ختامي', 'Closing Balance')}</div><div class="val">${formatNumber(closingBalance)}</div></div>
                    </div>
                    ${payrollSummarySectionHtml}

                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${tr('التاريخ', 'Date')}</th>
                                <th>${tr('النوع', 'Type')}</th>
                                <th>${tr('البيان', 'Description')}</th>
                                <th>${tr('مدين', 'Debit')}</th>
                                <th>${tr('دائن', 'Credit')}</th>
                                <th>${tr('الرصيد الجاري', 'Running Balance')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>-</td>
                                <td>${escapeHtml(safeFormatDate(statementStartDate))}</td>
                                <td>${tr('افتتاحي', 'Opening')}</td>
                                <td>${tr('رصيد افتتاحي قبل الفترة', 'Opening balance before period')}</td>
                                <td class="num">-</td>
                                <td class="num">-</td>
                                <td class="num">${formatNumber(openingBalance)}</td>
                            </tr>
                            ${rowsHtml}
                        </tbody>
                    </table>
                    <div class="footer">${tr('تمت الطباعة بتاريخ', 'Printed on')} ${escapeHtml(new Date().toLocaleString(printLocale))}</div>
                </body>
                </html>
            `;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 300);
        };

        const employeeStatementTitle = `${tr('كشف حساب الموظف', 'Employee Statement')} - ${emp.name}`;
        const employeeStatementShareText = [
            employeeStatementTitle,
            `${tr('الفترة', 'Period')}: ${safeFormatDate(statementStartDate)} - ${safeFormatDate(statementEndDate)}`,
            `${tr('الرصيد الافتتاحي', 'Opening Balance')}: ${formatNumber(openingBalance)}`,
            `${tr('الرصيد الختامي', 'Closing Balance')}: ${formatNumber(closingBalance)}`,
            `${tr('عدد الحركات', 'Entries')}: ${displayEntries.length}`,
            ...(showPayrollSummary && hasPayrollSummaryData
                ? [
                    `${tr('صافي الراتب', 'Net Salary')}: ${formatNumber(payrollNetSalary)}`,
                    `${tr('المدفوع', 'Paid')}: ${formatNumber(payrollPaidTotal)}`,
                    `${tr('المتبقي', 'Remaining')}: ${formatNumber(payrollRemaining)}`
                ]
                : [])
        ]
            .concat(extractElementReadableText(employeeStatementContentRef.current) ? ['', extractElementReadableText(employeeStatementContentRef.current)] : [])
            .join('\n');

        const handleSaveStatementSnapshot = async () => {
            if (!employeeStatementContentRef.current) return;
            await settleElementBeforeSnapshot(employeeStatementContentRef.current);
            const success = await downloadElementAsPdf(employeeStatementContentRef.current, {
                title: employeeStatementTitle,
                fileName: `${employeeStatementTitle}-${statementStartDate}-${statementEndDate}`,
                dir: isEnglish ? 'ltr' : 'rtl',
                lang: isEnglish ? 'en' : 'ar',
                backgroundColor: '#f9fafb',
                padding: 18
            });
            if (!success) {
                alert(tr('تعذر حفظ كشف الموظف بصيغة PDF حاليًا.', 'Could not save the employee statement as PDF right now.'));
            }
        };

        const handleExportStatementExcel = () => {
            const success = exportElementAsCsv(
                employeeStatementExportTableRef.current,
                `${employeeStatementTitle}-${statementStartDate}-${statementEndDate}`
            );
            if (!success) {
                alert(tr('تعذر تصدير كشف الموظف حاليًا.', 'Could not export the employee statement right now.'));
            }
        };

        return (
            <ResponsiveDialog
                open={Boolean(viewStatementId)}
                onClose={closeEmployeeStatement}
                variant="fullscreen"
                zIndexClassName="z-[200]"
                panelClassName="bg-white w-full h-full md:h-[95dvh] md:max-w-[980px] md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in"
                closeOnBackdrop={false}
                showHandle={false}
            >
                <div className="font-tajawal h-full flex flex-col" dir={isEnglish ? 'ltr' : 'rtl'}>
                    <div className="bg-slate-900 px-4 pt-5 pb-4 text-white relative shrink-0">
                        <button onClick={closeEmployeeStatement} className="absolute left-3 top-3 p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-all z-20"><X size={18} /></button>
                        <div className="flex flex-col gap-3 mb-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-sm shrink-0">{emp.name.charAt(0)}</div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-black truncate">{emp.name}</h3>
                                    <p className="text-[10px] text-white/60 font-bold truncate">{emp.position} - {emp.code}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 shrink-0 lg:justify-end">
                                <button
                                    onClick={() => previousEmployee && openEmployeeStatement(previousEmployee.id)}
                                    disabled={!previousEmployee}
                                    className={`px-2 py-1 rounded-lg text-[9px] font-black flex items-center gap-1 ${previousEmployee ? 'bg-white/10 hover:bg-white/20' : 'bg-white/5 text-white/40 cursor-not-allowed'}`}
                                >
                                    <ArrowRight size={12} /> {tr('السابق', 'Previous')}
                                </button>
                                <button
                                    onClick={() => nextEmployee && openEmployeeStatement(nextEmployee.id)}
                                    disabled={!nextEmployee}
                                    className={`px-2 py-1 rounded-lg text-[9px] font-black flex items-center gap-1 ${nextEmployee ? 'bg-white/10 hover:bg-white/20' : 'bg-white/5 text-white/40 cursor-not-allowed'}`}
                                >
                                    {tr('التالي', 'Next')} <ArrowLeft size={12} />
                                </button>
                                <button
                                    onClick={handlePrintPayslip}
                                    className="px-2 py-1 rounded-lg text-[9px] font-black flex items-center gap-1 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                                >
                                    <Receipt size={12} /> {tr('كشف راتب', 'Payslip')}
                                </button>
                                <DocumentActions
                                    title={employeeStatementTitle}
                                    shareText={employeeStatementShareText}
                                    isEnglish={isEnglish}
                                    tr={tr}
                                    onPrint={handlePrintStatement}
                                    onSave={handleSaveStatementSnapshot}
                                    onExcel={handleExportStatementExcel}
                                    saveTitle={tr('تنزيل PDF', 'Download PDF')}
                                    variant="dark"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/10 px-3 py-2 rounded-xl border border-white/5">
                                <span className="text-[8px] font-black text-amber-200 uppercase block mb-0.5">{tr('الرصيد الافتتاحي', 'Opening Balance')}</span>
                                <span className={`text-sm font-black ${openingBalance > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{openingBalance.toLocaleString()}</span>
                            </div>
                            <div className="bg-white/10 px-3 py-2 rounded-xl border border-white/5">
                                <span className="text-[8px] font-black text-blue-200 uppercase block mb-0.5">{tr('الرصيد الختامي', 'Closing Balance')}</span>
                                <span className={`text-sm font-black ${closingBalance > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{closingBalance.toLocaleString()}</span>
                            </div>
                            <div className="bg-white/10 px-3 py-2 rounded-xl border border-white/5">
                                <span className="text-[8px] font-black text-rose-300 uppercase block mb-0.5">{tr('مدين الفترة', 'Period Debit')}</span>
                                <span className="text-sm font-black">{totalDebit.toLocaleString()}</span>
                            </div>
                            <div className="bg-white/10 px-3 py-2 rounded-xl border border-white/5">
                                <span className="text-[8px] font-black text-emerald-300 uppercase block mb-0.5">{tr('دائن الفترة', 'Period Credit')}</span>
                                <span className="text-sm font-black">{totalCredit.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div ref={employeeStatementContentRef} className="flex-1 overflow-y-auto bg-gray-50 p-3 space-y-3">
                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-1.5 mb-2">
                                <CalendarRange size={13} className="text-indigo-600" />
                                <span className="text-[10px] font-black text-gray-600">{tr('اختر فترة كشف الحساب', 'Select statement period')}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <EnglishDateInput
                                    value={rawStartDate}
                                    onChange={value => {
                                        setEmployeeStatementPayrollSummaryVisible(emp.id, false);
                                        updateStatementRange(emp.id, { startDate: value });
                                    }}
                                    className="w-full p-2 bg-gray-50 rounded-xl text-[10px] font-bold outline-none border border-gray-100 text-right"
                                    aria-label={tr('بداية كشف الحساب', 'Statement start date')}
                                />
                                <EnglishDateInput
                                    value={rawEndDate}
                                    onChange={value => {
                                        setEmployeeStatementPayrollSummaryVisible(emp.id, false);
                                        updateStatementRange(emp.id, { endDate: value });
                                    }}
                                    className="w-full p-2 bg-gray-50 rounded-xl text-[10px] font-bold outline-none border border-gray-100 text-right"
                                    aria-label={tr('نهاية كشف الحساب', 'Statement end date')}
                                />
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 mt-2">
                                <button
                                    onClick={() => {
                                        setEmployeeStatementPayrollSummaryVisible(emp.id, false);
                                        updateStatementRange(emp.id, { startDate: payrollStartDate, endDate: payrollEndDate });
                                    }}
                                    className="flex-1 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-black text-[9px] border border-indigo-100"
                                >
                                    {tr('فترة الرواتب', 'Use payroll period')}
                                </button>
                                <button
                                    onClick={() => {
                                        if (!firstEntryDate || !lastEntryDate) return;
                                        setEmployeeStatementPayrollSummaryVisible(emp.id, false);
                                        updateStatementRange(emp.id, { startDate: firstEntryDate, endDate: lastEntryDate });
                                    }}
                                    disabled={!firstEntryDate || !lastEntryDate}
                                    className={`flex-1 py-1.5 rounded-lg font-black text-[9px] border ${firstEntryDate && lastEntryDate ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'}`}
                                >
                                    {tr('كل الحركات', 'All transactions')}
                                </button>
                            </div>
                            {rawStartDate > rawEndDate && (
                                <p className="text-[9px] font-bold text-amber-600 mt-2">{tr('تم تصحيح تاريخ البداية والنهاية تلقائيًا.', 'Start and end dates were auto-corrected.')}</p>
                            )}
                        </div>

                        {payrollMonthlyStatements.length > 0 && (
                            <div className="bg-white p-3 rounded-xl border border-violet-100 shadow-sm space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <Receipt size={13} className="text-violet-600" />
                                        <span className="text-[10px] font-black text-violet-700">{tr('فترات كشف الراتب', 'Payroll statement periods')}</span>
                                    </div>
                                    <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-700 text-[9px] font-black">
                                        {payrollMonthlyStatements.length} {tr('فترة', 'periods')}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {payrollMonthlyStatements.map(statement => {
                                        const isActiveRange = statement.range.startDate === statementStartDate && statement.range.endDate === statementEndDate;
                                        return (
                                            <button
                                                key={statement.key}
                                                type="button"
                                                onClick={() => openStatementPeriod(statement.range)}
                                                className={`rounded-xl border px-3 py-2 text-right transition-colors ${isActiveRange ? 'border-violet-200 bg-violet-600 text-white' : 'border-violet-100 bg-violet-50/70 text-violet-700 hover:bg-violet-100'}`}
                                            >
                                                <span className="block text-[10px] font-black">{statement.title}</span>
                                                <span className={`block text-[9px] font-bold ${isActiveRange ? 'text-violet-100' : 'text-violet-500'}`}>
                                                    {statement.isDirectOnly ? tr('استحقاق وصرف مباشر', 'Direct accrual & payment') : tr('استحقاق مرحّل', 'Posted accrual')}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {showPayrollSummary && (
                            <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm space-y-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <Receipt size={13} className="text-indigo-600" />
                                            <span className="text-[10px] font-black text-indigo-700">{tr('ملخص كشف الراتب داخل الكشف', 'Payroll summary inside statement')}</span>
                                        </div>
                                        <p className="text-[10px] font-bold text-gray-400 mt-1">
                                            {tr('الفترة', 'Period')}: {safeFormatDate(statementStartDate)} - {safeFormatDate(statementEndDate)}
                                        </p>
                                    </div>
                                    {matchedStatementPayrollRun && (
                                        <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[9px] font-black text-indigo-700">
                                            {tr('دفعة الرواتب', 'Payroll Run')}: {matchedStatementPayrollRun.runNumber}
                                        </span>
                                    )}
                                </div>

                                {hasPayrollSummaryData ? (
                                    <>
                                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                                            {payrollSummaryCards.map(card => (
                                                <div key={card.label} className={`rounded-xl border p-2.5 ${card.tone}`}>
                                                    <div className="text-[9px] font-black opacity-80 mb-1">{card.label}</div>
                                                    <div className="text-sm font-black dir-ltr">{formatNumber(card.value)}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {payrollBreakdownRows.map(row => (
                                                <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                    <span className={`text-[10px] font-black ${row.tone}`}>{row.label}</span>
                                                    <span className={`text-[11px] font-black dir-ltr ${row.tone}`}>{formatNumber(row.value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[10px] font-bold text-slate-400">
                                        {tr('لا توجد بيانات رواتب ضمن الفترة المحددة', 'No payroll data in selected period')}
                                    </div>
                                )}
                            </div>
                        )}

                        <h4 className="text-[10px] font-black text-gray-400 px-1 uppercase">{tr('كشف حساب تفصيلي', 'Detailed Statement')} ({displayEntries.length} {tr('حركة', 'entries')})</h4>
                        <p className="text-[10px] font-bold text-gray-400 px-1">{tr('الفترة', 'Period')}: {safeFormatDate(statementStartDate)} - {safeFormatDate(statementEndDate)}</p>

                        {Math.abs(openingBalance) > 0.001 && (
                            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-[10px] font-black flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center">
                                <span className="text-amber-700">{tr('رصيد ما قبل الفترة', 'Opening balance before period')}</span>
                                <span className={`dir-ltr ${openingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{openingBalance.toLocaleString()}</span>
                            </div>
                        )}

                        {displayEntries.length === 0 && (
                            <div className="text-center py-10 text-gray-300">
                                <FileText size={28} className="mx-auto mb-2 opacity-50" />
                                <p className="text-xs font-bold text-gray-400">{tr('لا توجد حركات ضمن الفترة المحددة', 'No transactions in selected period')}</p>
                            </div>
                        )}

                        {displayEntries.map((entry, idx) => {
                            const catInfo = getCategoryLabel(entry.category);
                            const linkedPayrollRange = ['salary', 'direct_salary', 'salary_payment', 'deduction'].includes(entry.category)
                                ? extractPayrollRangeFromText(entry.description)
                                : null;
                            return (
                                <div key={entry.id + idx} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                    <div className="flex flex-col gap-2 mb-1.5 sm:flex-row sm:justify-between sm:items-start">
                                        <div className="flex items-start gap-2 min-w-0">
                                            <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black flex items-center gap-1 shrink-0 ${catInfo.color}`}>{catInfo.icon} {catInfo.label}</span>
                                            <p className="text-[11px] font-bold text-gray-700 break-words">{entry.description}</p>
                                        </div>
                                        {linkedPayrollRange && (
                                            <button
                                                type="button"
                                                onClick={() => openStatementPeriod(linkedPayrollRange)}
                                                className="shrink-0 px-2 py-1 rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600 text-[9px] font-black hover:bg-indigo-100"
                                            >
                                                {tr('كشف الفترة', 'Period Statement')}
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1.5 text-[10px] sm:flex-row sm:justify-between sm:items-center">
                                        <span className="text-gray-400 font-bold flex items-center gap-1"><Calendar size={9} /> {safeFormatDate(entry.date)}</span>
                                        <div className="flex flex-wrap items-center gap-3">
                                            {entry.debit > 0 && <span className="font-black text-rose-500">{entry.debit.toLocaleString()} {tr('مدين', 'Debit')}</span>}
                                            {entry.credit > 0 && <span className="font-black text-emerald-500">{entry.credit.toLocaleString()} {tr('دائن', 'Credit')}</span>}
                                            <span className={`font-black px-1.5 py-0.5 rounded text-[9px] ${entry.balance > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{entry.balance.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="hidden">
                        <table ref={employeeStatementExportTableRef}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>{tr('التاريخ', 'Date')}</th>
                                    <th>{tr('النوع', 'Type')}</th>
                                    <th>{tr('البيان', 'Description')}</th>
                                    <th>{tr('مدين', 'Debit')}</th>
                                    <th>{tr('دائن', 'Credit')}</th>
                                    <th>{tr('الرصيد الجاري', 'Running Balance')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>-</td>
                                    <td>{safeFormatDate(statementStartDate)}</td>
                                    <td>{tr('افتتاحي', 'Opening')}</td>
                                    <td>{tr('رصيد ما قبل الفترة', 'Opening balance before period')}</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td>{formatNumber(openingBalance)}</td>
                                </tr>
                                {statementsWithBalance.map((entry, idx) => (
                                    <tr key={`export-${entry.id}-${idx}`}>
                                        <td>{idx + 1}</td>
                                        <td>{safeFormatDate(entry.date)}</td>
                                        <td>{getCategoryLabel(entry.category).label}</td>
                                        <td>{entry.description}</td>
                                        <td>{entry.debit > 0 ? formatNumber(entry.debit) : '-'}</td>
                                        <td>{entry.credit > 0 ? formatNumber(entry.credit) : '-'}</td>
                                        <td>{formatNumber(entry.balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </ResponsiveDialog>
        );
    };

    const renderEmployeeContractsModal = () => {
        if (!contractsEmployee) return null;

        return (
            <ResponsiveDialog
                open={!!contractsEmployee}
                onClose={closeContractsManager}
                size="xl"
                zIndexClassName="z-[220]"
                panelClassName="bg-white rounded-[2rem] shadow-2xl max-h-[92dvh] overflow-hidden"
            >
                <div className="flex flex-col h-full">
                    <div className="p-4 border-b border-gray-100 bg-gradient-to-l from-emerald-50 to-white">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="font-black text-gray-800 text-lg">{tr('عقود الموظف وسجل الراتب', 'Employee Contracts & Salary History')}</h3>
                                <p className="text-[11px] font-bold text-gray-500">{contractsEmployee.name} - {contractsEmployee.code}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (showContractForm) {
                                            setShowContractForm(false);
                                            setEditingContractId(null);
                                            return;
                                        }
                                        startAddContract();
                                    }}
                                    className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black hover:bg-emerald-100 transition-colors"
                                >
                                    {showContractForm
                                        ? (editingContractId ? tr('إلغاء التعديل', 'Cancel edit') : tr('إخفاء النموذج', 'Hide Form'))
                                        : tr('إضافة عقد', 'Add Contract')}
                                </button>
                                <button type="button" onClick={closeContractsManager} className="p-2 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                        {showContractForm && (
                            <form onSubmit={handleEmployeeContractSubmit} className="bg-white border border-emerald-100 rounded-2xl p-4 space-y-3 shadow-sm">
                                <div className="flex items-center gap-2 text-emerald-700">
                                    <Briefcase size={16} />
                                    <h4 className="font-black text-sm">{editingContractId ? tr('تعديل العقد', 'Edit Contract') : tr('بيانات العقد', 'Contract Details')}</h4>
                                </div>
                                {editingContractId && (
                                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700">
                                        {tr('أنت الآن تعدل عقدًا محفوظًا. يمكنك حفظ التعديل أو إلغاؤه.', 'You are editing a saved contract. You can save or cancel the update.')}
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 block mb-1">{tr('نوع العقد', 'Contract Type')}</label>
                                        <select value={contractType} onChange={e => handleContractTypeChange(e.target.value as 'FIXED_TERM' | 'OPEN_ENDED')} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none">
                                            <option value="OPEN_ENDED">{tr('غير محدد المدة', 'Open-ended')}</option>
                                            <option value="FIXED_TERM">{tr('محدد المدة', 'Fixed-term')}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 block mb-1">{tr('المسمى بالعقد', 'Contract Title')}</label>
                                        <input value={contractTitle} onChange={e => setContractTitle(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 block mb-1">{tr('بداية العقد', 'Contract Start')}</label>
                                        <EnglishDateInput value={contractStartDate} onChange={setContractStartDate} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 block mb-1">{tr('نهاية العقد', 'Contract End')}</label>
                                        <EnglishDateInput value={contractEndDate} onChange={setContractEndDate} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold outline-none" disabled={contractType !== 'FIXED_TERM'} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3 space-y-2">
                                        <div className="flex bg-white p-1 rounded-lg border border-blue-100">
                                            <button type="button" onClick={() => setContractSalaryType('FIXED')} className={`flex-1 py-2 rounded-md text-xs font-black ${contractSalaryType === 'FIXED' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{tr('ثابت', 'Fixed')}</button>
                                            <button type="button" onClick={() => setContractSalaryType('HOURLY')} className={`flex-1 py-2 rounded-md text-xs font-black ${contractSalaryType === 'HOURLY' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{tr('بالساعة', 'Hourly')}</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" inputMode="decimal" value={contractDailyHours} onChange={e => setContractDailyHours(e.target.value)} placeholder={tr('ساعات يومية', 'Daily hours')} className="w-full p-2.5 bg-white rounded-lg border border-blue-100 text-xs font-bold text-center outline-none" />
                                            <input type="text" inputMode="decimal" value={contractSalaryType === 'FIXED' ? contractBasicSalary : contractHourlyRate} onChange={e => contractSalaryType === 'FIXED' ? setContractBasicSalary(e.target.value) : setContractHourlyRate(e.target.value)} placeholder={contractSalaryType === 'FIXED' ? tr('راتب أساسي', 'Base salary') : tr('أجر الساعة', 'Hourly rate')} className="w-full p-2.5 bg-white rounded-lg border border-blue-100 text-xs font-bold text-center outline-none" />
                                            <input type="text" inputMode="decimal" value={contractOvertimeHourlyRate} onChange={e => setContractOvertimeHourlyRate(e.target.value)} placeholder={tr('أجر إضافي/ساعة', 'Overtime rate')} className="w-full p-2.5 bg-white rounded-lg border border-blue-100 text-xs font-bold text-center outline-none" />
                                            <input type="text" inputMode="decimal" value={contractHousingAllowance} onChange={e => setContractHousingAllowance(e.target.value)} placeholder={tr('بدل سكن', 'Housing')} className="w-full p-2.5 bg-white rounded-lg border border-blue-100 text-xs font-bold text-center outline-none" />
                                            <input type="text" inputMode="decimal" value={contractTransportAllowance} onChange={e => setContractTransportAllowance(e.target.value)} placeholder={tr('بدل نقل', 'Transport')} className="w-full p-2.5 bg-white rounded-lg border border-blue-100 text-xs font-bold text-center outline-none" />
                                            <input type="text" inputMode="decimal" value={contractOtherAllowances} onChange={e => setContractOtherAllowances(e.target.value)} placeholder={tr('بدلات أخرى', 'Other allowances')} className="w-full p-2.5 bg-white rounded-lg border border-blue-100 text-xs font-bold text-center outline-none" />
                                            <input type="text" inputMode="numeric" lang="en" value={contractAnnualLeaveEntitlementDays} onChange={e => setContractAnnualLeaveEntitlementDays(toEnglishDigits(e.target.value))} placeholder={tr('رصيد إجازة سنوي (يوم)', 'Annual leave entitlement (days)')} className="w-full p-2.5 bg-white rounded-lg border border-violet-100 text-xs font-bold text-center outline-none dir-ltr" />
                                            <div className="w-full p-2.5 bg-violet-50 rounded-lg border border-violet-100 text-[10px] font-black text-violet-700 text-center">{tr('نطاق شائع: 14 - 21 يوم', 'Common range: 14 - 21 days')}</div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <textarea value={contractNotes} onChange={e => setContractNotes(e.target.value)} placeholder={tr('ملاحظات العقد...', 'Contract notes...')} className="w-full min-h-[96px] p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-bold outline-none resize-y" />
                                        <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-black text-gray-600">
                                            <input type="checkbox" checked={applyContractToEmployeeProfile} onChange={e => setApplyContractToEmployeeProfile(e.target.checked)} />
                                            {tr('تطبيق بيانات العقد على ملف الموظف الحالي', 'Apply contract salary data to current employee profile')}
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <button
                                                type="submit"
                                                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700 transition-colors"
                                            >
                                                {editingContractId ? tr('حفظ التعديل', 'Save Changes') : tr('حفظ العقد', 'Save Contract')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowContractForm(false);
                                                    setEditingContractId(null);
                                                }}
                                                className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-black text-sm hover:bg-gray-200 transition-colors"
                                            >
                                                {tr('إلغاء', 'Cancel')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        )}

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-black text-sm text-gray-800">{tr('عقود الموظف', 'Employee Contracts')}</h4>
                                    <span className="text-[10px] font-black text-gray-400">{employeeContractsList.length} {tr('عقد', 'contracts')}</span>
                                </div>
                                <div className="space-y-2">
                                    {employeeContractsList.length === 0 && (
                                        <div className="text-center py-6 text-xs font-bold text-gray-400">{tr('لا توجد عقود مسجلة بعد', 'No contracts recorded yet')}</div>
                                    )}
                                    {employeeContractsList.map(contract => (
                                        <div key={contract.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-black text-gray-800 truncate">{contract.title || contractsEmployee.position || tr('عقد موظف', 'Employee contract')}</div>
                                                    <div className="text-[10px] font-bold text-gray-500 mt-1">
                                                        {contract.startDate} {contract.endDate ? ` - ${contract.endDate}` : ` - ${tr('?????', 'Open-ended')}`}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-blue-600 mt-1">{formatSalarySnapshotSummary(contract)}</div>
                                                    <div className="text-[10px] font-bold text-violet-600 mt-1">
                                                        {tr('رصيد إجازة سنوي', 'Annual leave entitlement')}: {(contract.annualLeaveEntitlementDays ?? contractsEmployee.annualLeaveEntitlementDays ?? getCompanyDefaultLeaveEntitlementDays(contract.contractType)).toLocaleString()} {tr('يوم', 'days')}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black ${contract.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {contract.status === 'ACTIVE' ? tr('نشط', 'Active') : tr('مغلق', 'Closed')}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditEmployeeContract(contract)}
                                                        className="p-1.5 rounded-lg bg-white border border-blue-100 text-blue-500 hover:bg-blue-50"
                                                        title={tr('تعديل العقد', 'Edit contract')}
                                                    >
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button type="button" onClick={() => {
                                                        if (!confirm(tr('هل تريد حذف هذا العقد؟', 'Delete this contract?'))) return;
                                                        const result = deleteEmployeeContract(contract.id);
                                                        if (!result.ok) {
                                                            alert(result.message);
                                                            return;
                                                        }
                                                        if (editingContractId === contract.id) {
                                                            setEditingContractId(null);
                                                            setShowContractForm(false);
                                                        }
                                                    }} className="p-1.5 rounded-lg bg-white border border-rose-100 text-rose-500 hover:bg-rose-50">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-black text-sm text-gray-800">{tr('سجل تغييرات الراتب', 'Salary History')}</h4>
                                    <span className="text-[10px] font-black text-gray-400">{employeeSalaryHistoryList.length} {tr('سجل', 'entries')}</span>
                                </div>
                                <div className="space-y-2 max-h-[48dvh] overflow-y-auto">
                                    {employeeSalaryHistoryList.length === 0 && (
                                        <div className="text-center py-6 text-xs font-bold text-gray-400">{tr('لا توجد تغييرات راتب مسجلة', 'No salary changes recorded')}</div>
                                    )}
                                    {employeeSalaryHistoryList.map(entry => (
                                        <div key={entry.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-[10px] font-black text-indigo-600">
                                                    {entry.source === 'CONTRACT' ? tr('عقد', 'Contract') : tr('ملف الموظف', 'Employee Form')}
                                                </span>
                                                <span className="text-[10px] font-bold text-gray-500">{entry.date}</span>
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-700 mb-1">
                                                {entry.action === 'EMPLOYEE_CREATED'
                                                    ? tr('إنشاء موظف', 'Employee Created')
                                                    : entry.action === 'CONTRACT_ADDED'
                                                        ? tr('إضافة عقد', 'Contract Added')
                                                        : tr('تعديل راتب', 'Salary Changed')}
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-500">
                                                {entry.before ? `${formatSalarySnapshotSummary(entry.before)} ? ` : ''}{formatSalarySnapshotSummary(entry.after)}
                                            </div>
                                            {entry.note && <div className="text-[10px] font-bold text-gray-400 mt-1">{entry.note}</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </ResponsiveDialog>
        );
    };

    return (
        <div className={`app-page p-3 md:p-4 font-tajawal ${isEnglish ? 'text-left' : 'text-right'}`} dir={isEnglish ? 'ltr' : 'rtl'}>
            <header className="mb-3 flex justify-between items-center px-1">
                <div className="p-3 rounded-2xl bg-white shadow-sm border border-gray-100 text-blue-600"><Users size={22} /></div>
                <div><h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">{tr('شؤون الموظفين', 'Human Resources')}</h1><p className="text-gray-400 text-[10px] font-black mt-1 uppercase tracking-[0.2em]">{tr('إدارة الكادر البشري والرواتب', 'Manage workforce and payroll')}</p></div>
            </header>
            <div className="grid grid-cols-6 gap-1 p-1 bg-gray-100/60 backdrop-blur rounded-2xl mb-3 shadow-inner border border-gray-200/20">
                <button onClick={() => setActiveTab('EMPLOYEES')} className={`min-w-0 px-1 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl font-black text-[9px] sm:text-[10px] transition-all ${activeTab === 'EMPLOYEES' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}><Briefcase size={13} /><span>{tr('الموظفين', 'Employees')}</span></button>
                <button onClick={() => setActiveTab('LEAVES')} className={`min-w-0 px-1 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl font-black text-[9px] sm:text-[10px] transition-all ${activeTab === 'LEAVES' ? 'bg-white shadow-md text-violet-600' : 'text-gray-400'}`}><CalendarRange size={13} /><span>{tr('الإجازات', 'Leaves')}</span></button>
                <button onClick={() => setActiveTab('DEDUCTIONS')} className={`min-w-0 px-1 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl font-black text-[9px] sm:text-[10px] transition-all ${activeTab === 'DEDUCTIONS' ? 'bg-white shadow-md text-fuchsia-600' : 'text-gray-400'}`}><Wallet size={13} /><span>{tr('الخصومات', 'Deductions')}</span></button>
                <button onClick={() => setActiveTab('ATTENDANCE')} className={`min-w-0 px-1 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl font-black text-[9px] sm:text-[10px] transition-all ${activeTab === 'ATTENDANCE' ? 'bg-white shadow-md text-purple-600' : 'text-gray-400'}`}><CalendarCheck size={13} /><span>{tr('الحضور', 'Attendance')}</span></button>
                <button onClick={() => setActiveTab('PAYROLL')} className={`min-w-0 px-1 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl font-black text-[9px] sm:text-[10px] transition-all ${activeTab === 'PAYROLL' ? 'bg-white shadow-md text-emerald-600' : 'text-gray-400'}`}><DollarSign size={13} /><span>{tr('الرواتب', 'Payroll')}</span></button>
                <button onClick={() => { setActiveTab('REPORTS'); setActiveEmployeeReport('MENU'); }} className={`min-w-0 px-1 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl font-black text-[9px] sm:text-[10px] transition-all ${activeTab === 'REPORTS' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-400'}`}><FileText size={13} /><span>{tr('التقارير', 'Reports')}</span></button>
            </div>
            {activeTab === 'EMPLOYEES' && renderEmployees()}
            {activeTab === 'LEAVES' && renderLeaves()}
            {activeTab === 'DEDUCTIONS' && renderRecurringDeductions()}
            {activeTab === 'ATTENDANCE' && renderAttendance()}
            {activeTab === 'PAYROLL' && renderPayroll()}
            {activeTab === 'REPORTS' && renderReports()}
            {renderEmployeeStatementModal()}
            {renderEmployeeContractsModal()}
        </div>
    );
};

export default HRManager;




