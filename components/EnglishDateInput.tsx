import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { toEnglishDigits } from '../utils/forceEnglishDigits';

type DisplayFormat = 'DMY' | 'YMD';

interface EnglishDateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    value: string;
    onChange: (nextIsoDate: string) => void;
    wrapperClassName?: string;
    showCalendarButton?: boolean;
    calendarButtonClassName?: string;
    calendarIconClassName?: string;
    autoSegment?: boolean;
    displayFormat?: DisplayFormat;
}

const MAX_DATE_DIGITS = 8;

const normalizeDateTextInput = (value: string): string =>
    toEnglishDigits(String(value || '')).replace(/[^\d/.\-]/g, '');

const extractDigits = (value: string): string =>
    toEnglishDigits(String(value || '')).replace(/\D/g, '').slice(0, MAX_DATE_DIGITS);

const getSegmentLengths = (displayFormat: DisplayFormat): number[] =>
    displayFormat === 'YMD' ? [4, 2, 2] : [2, 2, 4];

const getSegmentDigitBoundaries = (displayFormat: DisplayFormat): number[] => {
    const lengths = getSegmentLengths(displayFormat);
    const boundaries: number[] = [];
    let sum = 0;
    for (let i = 0; i < lengths.length - 1; i += 1) {
        sum += lengths[i];
        boundaries.push(sum);
    }
    return boundaries;
};

const getSegmentStartPositions = (displayFormat: DisplayFormat): number[] => {
    const lengths = getSegmentLengths(displayFormat);
    const starts: number[] = [0];
    let cursor = 0;
    for (let i = 0; i < lengths.length - 1; i += 1) {
        cursor += lengths[i];
        cursor += 1; // slash separator
        starts.push(cursor);
    }
    return starts;
};

const isValidIsoDate = (isoDate: string): boolean => {
    const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const check = new Date(Date.UTC(y, m - 1, d));
    return check.getUTCFullYear() === y && check.getUTCMonth() + 1 === m && check.getUTCDate() === d;
};

const parseDateTextToIso = (value: string): string | null => {
    const cleaned = normalizeDateTextInput(value)
        .replace(/[.\-]/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/|\/$/g, '');

    if (!cleaned) return null;
    const parts = cleaned.split('/');
    if (parts.length !== 3) return null;

    let year = '';
    let month = '';
    let day = '';

    if (parts[0].length === 4) {
        [year, month, day] = parts;
    } else if (parts[2].length === 4) {
        [day, month, year] = parts;
    } else {
        return null;
    }

    const iso = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
};

const isoToDigits = (isoDate: string, displayFormat: DisplayFormat): string => {
    if (!isValidIsoDate(isoDate)) return '';
    const [year, month, day] = isoDate.split('-');
    return displayFormat === 'YMD' ? `${year}${month}${day}` : `${day}${month}${year}`;
};

const digitsToIso = (digits: string, displayFormat: DisplayFormat): string | null => {
    const normalized = extractDigits(digits);
    if (normalized.length !== MAX_DATE_DIGITS) return null;

    let year = '';
    let month = '';
    let day = '';

    if (displayFormat === 'YMD') {
        year = normalized.slice(0, 4);
        month = normalized.slice(4, 6);
        day = normalized.slice(6, 8);
    } else {
        day = normalized.slice(0, 2);
        month = normalized.slice(2, 4);
        year = normalized.slice(4, 8);
    }

    const iso = `${year}-${month}-${day}`;
    return isValidIsoDate(iso) ? iso : null;
};

const maskDateDigits = (digits: string, displayFormat: DisplayFormat): string => {
    const normalized = extractDigits(digits);
    if (!normalized) return '';

    const lengths = getSegmentLengths(displayFormat);
    let cursor = 0;
    let output = '';

    lengths.forEach((segmentLength, index) => {
        const segment = normalized.slice(cursor, cursor + segmentLength);
        if (!segment) return;

        output += segment;
        cursor += segment.length;

        const hasNextSegment = index < lengths.length - 1;
        const segmentComplete = segment.length === segmentLength;
        const hasMoreDigits = normalized.length > cursor;

        if (hasNextSegment && (segmentComplete || hasMoreDigits)) {
            output += '/';
        }
    });

    return output;
};

const formatIsoDateForDisplay = (isoDate: string, displayFormat: DisplayFormat): string => {
    if (!isoDate) return '';
    if (isValidIsoDate(isoDate)) {
        const [year, month, day] = isoDate.split('-');
        return displayFormat === 'YMD' ? `${year}/${month}/${day}` : `${day}/${month}/${year}`;
    }
    const parsed = parseDateTextToIso(isoDate);
    if (!parsed) return maskDateDigits(isoDate, displayFormat);
    return formatIsoDateForDisplay(parsed, displayFormat);
};

const displayIndexToDigitIndex = (display: string, displayIndex: number): number => {
    const safeDisplayIndex = Math.max(0, Math.min(displayIndex, display.length));
    let digitsCount = 0;
    for (let i = 0; i < safeDisplayIndex; i += 1) {
        if (/\d/.test(display.charAt(i))) digitsCount += 1;
    }
    return digitsCount;
};

const digitIndexToDisplayIndex = (display: string, digitIndex: number): number => {
    const safeDigitIndex = Math.max(0, digitIndex);
    if (safeDigitIndex <= 0) return 0;

    let seenDigits = 0;
    for (let i = 0; i < display.length; i += 1) {
        if (/\d/.test(display.charAt(i))) {
            seenDigits += 1;
            if (seenDigits === safeDigitIndex) return i + 1;
        }
    }
    return display.length;
};

const resolveNextSegmentStart = (
    displayIndex: number,
    displayFormat: DisplayFormat,
    fallback: number
): number => {
    const starts = getSegmentStartPositions(displayFormat);
    const next = starts.find(start => start > displayIndex);
    return typeof next === 'number' ? next : fallback;
};

const openNativeDatePicker = (input: HTMLInputElement | null): void => {
    if (!input) return;
    const maybeShowPicker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
    if (typeof maybeShowPicker === 'function') {
        maybeShowPicker.call(input);
        return;
    }
    input.focus();
    input.click();
};

const EnglishDateInput: React.FC<EnglishDateInputProps> = ({
    value,
    onChange,
    wrapperClassName = '',
    className = '',
    showCalendarButton = true,
    calendarButtonClassName = '',
    calendarIconClassName = '',
    autoSegment = true,
    displayFormat: displayFormatProp = 'DMY',
    placeholder,
    onBlur,
    onFocus,
    onKeyDown,
    onPaste,
    disabled,
    ...rest
}) => {
    const displayFormat: DisplayFormat = displayFormatProp === 'YMD' ? 'YMD' : 'DMY';
    const textInputRef = useRef<HTMLInputElement | null>(null);
    const nativeDateInputRef = useRef<HTMLInputElement | null>(null);
    const pendingCaretRef = useRef<number | null>(null);
    const [displayValue, setDisplayValue] = useState(formatIsoDateForDisplay(value, displayFormat));
    const [isLocallyInvalid, setIsLocallyInvalid] = useState(false);

    useEffect(() => {
        setDisplayValue(formatIsoDateForDisplay(value, displayFormat));
        setIsLocallyInvalid(false);
    }, [value, displayFormat]);

    useLayoutEffect(() => {
        if (pendingCaretRef.current === null) return;
        const input = textInputRef.current;
        if (!input) return;
        const nextCaret = Math.max(0, Math.min(pendingCaretRef.current, displayValue.length));
        input.setSelectionRange(nextCaret, nextCaret);
        pendingCaretRef.current = null;
    }, [displayValue]);

    const inputClassName = [
        'w-full dir-ltr',
        showCalendarButton ? 'pl-10' : '',
        isLocallyInvalid ? 'ring-1 ring-red-200' : '',
        className
    ]
        .filter(Boolean)
        .join(' ');

    const placeholderValue = placeholder ?? (displayFormat === 'YMD' ? 'YYYY/MM/DD' : 'DD/MM/YYYY');
    const segmentBoundaries = getSegmentDigitBoundaries(displayFormat);

    const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const previousDigits = extractDigits(displayValue);
        const rawValue = event.target.value;
        const rawCaret = event.target.selectionStart ?? rawValue.length;
        const nextDigits = extractDigits(rawValue);
        const nextMaskedValue = maskDateDigits(nextDigits, displayFormat);

        const caretDigitIndex = Math.min(
            displayIndexToDigitIndex(rawValue, rawCaret),
            nextDigits.length
        );

        let nextCaret = digitIndexToDisplayIndex(nextMaskedValue, caretDigitIndex);
        const nativeInputEvent = event.nativeEvent as InputEvent;
        const inputType = nativeInputEvent?.inputType || '';
        const isInsertion = inputType.startsWith('insert');
        const boundaryReached = segmentBoundaries.includes(caretDigitIndex);

        if (
            autoSegment &&
            isInsertion &&
            boundaryReached &&
            nextDigits.length >= previousDigits.length &&
            nextMaskedValue.charAt(nextCaret) === '/'
        ) {
            nextCaret += 1;
        }

        pendingCaretRef.current = Math.min(nextCaret, nextMaskedValue.length);
        setDisplayValue(nextMaskedValue);

        if (!nextDigits) {
            setIsLocallyInvalid(false);
            if (value) onChange('');
            return;
        }

        if (nextDigits.length === MAX_DATE_DIGITS) {
            const parsed = digitsToIso(nextDigits, displayFormat);
            if (parsed) {
                setIsLocallyInvalid(false);
                if (parsed !== value) onChange(parsed);
            } else {
                setIsLocallyInvalid(true);
            }
            return;
        }

        setIsLocallyInvalid(false);
    };

    const handleTextBlur = (event: React.FocusEvent<HTMLInputElement>) => {
        const trimmed = displayValue.trim();
        const digits = extractDigits(trimmed);

        if (!digits) {
            setIsLocallyInvalid(false);
            if (value) onChange('');
            onBlur?.(event);
            return;
        }

        if (digits.length === MAX_DATE_DIGITS) {
            const parsedFromDigits = digitsToIso(digits, displayFormat);
            if (parsedFromDigits) {
                if (parsedFromDigits !== value) onChange(parsedFromDigits);
                setDisplayValue(formatIsoDateForDisplay(parsedFromDigits, displayFormat));
                setIsLocallyInvalid(false);
                onBlur?.(event);
                return;
            }
        }

        const parsedFromText = parseDateTextToIso(trimmed);
        if (parsedFromText) {
            if (parsedFromText !== value) onChange(parsedFromText);
            setDisplayValue(formatIsoDateForDisplay(parsedFromText, displayFormat));
            setIsLocallyInvalid(false);
        } else {
            setDisplayValue(formatIsoDateForDisplay(value, displayFormat));
            setIsLocallyInvalid(false);
        }

        onBlur?.(event);
    };

    const handleTextKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? start;
        const hasSelection = start !== end;

        if (!hasSelection && event.key === 'Backspace' && start > 0 && displayValue.charAt(start - 1) === '/') {
            event.preventDefault();
            input.setSelectionRange(start - 1, start - 1);
        } else if (!hasSelection && event.key === 'Delete' && displayValue.charAt(start) === '/') {
            event.preventDefault();
            input.setSelectionRange(start + 1, start + 1);
        } else if (!hasSelection && event.key === 'ArrowLeft' && start > 0 && displayValue.charAt(start - 1) === '/') {
            event.preventDefault();
            input.setSelectionRange(start - 1, start - 1);
        } else if (!hasSelection && event.key === 'ArrowRight' && displayValue.charAt(start) === '/') {
            event.preventDefault();
            input.setSelectionRange(start + 1, start + 1);
        } else if (autoSegment && !hasSelection && ['/', '-', '.'].includes(event.key)) {
            event.preventDefault();
            const nextStart = resolveNextSegmentStart(start, displayFormat, displayValue.length);
            input.setSelectionRange(nextStart, nextStart);
        }

        onKeyDown?.(event);
    };

    const handleTextPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
        const pastedText = event.clipboardData.getData('text');
        if (!pastedText) {
            onPaste?.(event);
            return;
        }

        event.preventDefault();
        const normalizedPastedText = normalizeDateTextInput(pastedText);

        let parsedIso: string | null = null;
        const isoCandidate = toEnglishDigits(pastedText.trim());
        if (isValidIsoDate(isoCandidate)) {
            parsedIso = isoCandidate;
        } else {
            parsedIso = parseDateTextToIso(normalizedPastedText);
        }

        const nextDigits = parsedIso
            ? isoToDigits(parsedIso, displayFormat)
            : extractDigits(normalizedPastedText);

        const nextMaskedValue = maskDateDigits(nextDigits, displayFormat);
        setDisplayValue(nextMaskedValue);
        pendingCaretRef.current = nextMaskedValue.length;

        if (!nextDigits) {
            setIsLocallyInvalid(false);
            if (value) onChange('');
            onPaste?.(event);
            return;
        }

        if (nextDigits.length === MAX_DATE_DIGITS) {
            const parsed = parsedIso ?? digitsToIso(nextDigits, displayFormat);
            if (parsed) {
                setIsLocallyInvalid(false);
                if (parsed !== value) onChange(parsed);
            } else {
                setIsLocallyInvalid(true);
            }
        } else {
            setIsLocallyInvalid(false);
        }

        onPaste?.(event);
    };

    return (
        <div className={['relative', wrapperClassName].filter(Boolean).join(' ')}>
            <input
                ref={textInputRef}
                {...rest}
                type="text"
                value={displayValue}
                onChange={handleTextChange}
                onBlur={handleTextBlur}
                onFocus={onFocus}
                onKeyDown={handleTextKeyDown}
                onPaste={handleTextPaste}
                placeholder={placeholderValue}
                autoComplete="off"
                inputMode="numeric"
                lang="en-GB-u-nu-latn"
                dir="ltr"
                disabled={disabled}
                className={inputClassName}
                aria-invalid={isLocallyInvalid || rest['aria-invalid']}
                style={{
                    paddingLeft: showCalendarButton ? '2.5rem' : undefined,
                    ...rest.style
                }}
            />
            {showCalendarButton ? (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 pointer-events-auto">
                    <button
                        type="button"
                        tabIndex={-1}
                        className={[
                            'w-full h-full flex items-center justify-center rounded-lg text-blue-500 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50',
                            calendarButtonClassName
                        ].filter(Boolean).join(' ')}
                        disabled={disabled}
                        aria-label="Pick date"
                        onClick={() => openNativeDatePicker(nativeDateInputRef.current)}
                    >
                        <CalendarIcon size={14} className={calendarIconClassName} />
                    </button>
                    <input
                        ref={nativeDateInputRef}
                        type="date"
                        value={value || ''}
                        onChange={event => {
                            const nextValue = event.target.value;
                            onChange(nextValue);
                            setDisplayValue(formatIsoDateForDisplay(nextValue, displayFormat));
                            setIsLocallyInvalid(false);
                        }}
                        disabled={disabled}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-none"
                    />
                </div>
            ) : (
                <input
                    ref={nativeDateInputRef}
                    type="date"
                    value={value || ''}
                    onChange={event => {
                        const nextValue = event.target.value;
                        onChange(nextValue);
                        setDisplayValue(formatIsoDateForDisplay(nextValue, displayFormat));
                        setIsLocallyInvalid(false);
                    }}
                    tabIndex={-1}
                    aria-hidden="true"
                    disabled={disabled}
                    className="absolute left-0 top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none"
                />
            )}
        </div>
    );
};

export default EnglishDateInput;
