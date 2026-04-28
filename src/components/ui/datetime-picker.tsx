import * as React from "react";
import { DayPicker } from "react-day-picker";
import { zhCN } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parsePickerValue, toLocalDateTimeString, type ChinaWallClockDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

export { parseLocalDateTime } from "@/lib/datetime";

const nativeTimeSelectClass =
    "flex h-9 w-full rounded-none border border-transparent border-b-input bg-transparent px-0 py-2 text-sm text-foreground outline-none transition-[color,border-color] focus-visible:border-b-ring disabled:cursor-not-allowed disabled:opacity-50";

function dateCarrier(parts: Pick<ChinaWallClockDateTime, "year" | "month" | "day">) {
    return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

function formatLabel(parts: ChinaWallClockDateTime) {
    return `${parts.year}年${parts.month}月${parts.day}日 ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export interface DatetimePicker24Props {
    value: string;
    onChange: (value: string) => void;
    id?: string;
    "data-testid"?: string;
    disabled?: boolean;
    /** 未选择时按钮上的占位文案 */
    placeholder?: string;
    className?: string;
    /** 是否显示「清除」按钮（延长截止时间等场景可不展示） */
    allowClear?: boolean;
}

export function DatetimePicker24({
    value,
    onChange,
    id,
    "data-testid": dataTestId,
    disabled,
    placeholder = "选择日期与时间（24 小时制）",
    className,
    allowClear = true,
}: DatetimePicker24Props) {
    const parsed = React.useMemo(() => parsePickerValue(value), [value]);
    const defaultParts = React.useMemo(
        () => {
            const now = new Date();
            return parsePickerValue(now.toISOString()) ?? {
                year: now.getFullYear(),
                month: now.getMonth() + 1,
                day: now.getDate(),
                hour: 12,
                minute: 0,
            };
        },
        []
    );
    const selectedDate = parsed ? dateCarrier(parsed) : undefined;
    const defaultMonth = parsed ? selectedDate : dateCarrier(defaultParts);
    const activeParts = parsed ?? { ...defaultParts, hour: 12, minute: 0 };
    const hour = parsed?.hour ?? 12;
    const minute = parsed?.minute ?? 0;

    const handleHourChange = (h: number) => {
        onChange(toLocalDateTimeString({ ...activeParts, hour: h, minute }));
    };

    const handleMinuteChange = (m: number) => {
        onChange(toLocalDateTimeString({ ...activeParts, hour, minute: m }));
    };

    const handleDateSelect = (d: Date | undefined) => {
        if (!d) {
            if (allowClear) onChange("");
            return;
        }
        onChange(toLocalDateTimeString({
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            day: d.getDate(),
            hour,
            minute,
        }));
    };

    const label = parsed
        ? formatLabel(parsed)
        : placeholder;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    data-testid={dataTestId}
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !parsed && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon data-icon="inline-start" className="opacity-70" />
                    <span className="truncate">{label}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                    <div className="rounded-md p-1">
                        <DayPicker
                            mode="single"
                            locale={zhCN}
                            className="rounded-md"
                            selected={selectedDate}
                            onSelect={handleDateSelect}
                            defaultMonth={defaultMonth}
                        />
                    </div>
                    <div className="flex min-w-[200px] flex-col gap-3 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground">时（24 小时）</Label>
                            <select
                                className={nativeTimeSelectClass}
                                value={hour}
                                onChange={(e) => handleHourChange(Number(e.target.value))}
                            >
                                {Array.from({ length: 24 }, (_, h) => (
                                    <option key={h} value={h}>
                                        {String(h).padStart(2, "0")}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground">分</Label>
                            <select
                                className={nativeTimeSelectClass}
                                value={minute}
                                onChange={(e) => handleMinuteChange(Number(e.target.value))}
                            >
                                {Array.from({ length: 60 }, (_, m) => (
                                    <option key={m} value={m}>
                                        {String(m).padStart(2, "0")}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {allowClear ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onChange("")}
                            >
                                清除
                            </Button>
                        ) : null}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
