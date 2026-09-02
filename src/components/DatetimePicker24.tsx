import * as React from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    formatPickerDateTimeValue,
    getCurrentPickerDateTimeValue,
    parsePickerValue,
    toPickerCalendarDate,
} from "@/lib/datetime";
import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

export { parseLocalDateTime } from "@/lib/datetime";

/** Composite China Standard Time picker used by task scheduling workflows. */
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
    const generatedId = React.useId();
    const fieldPrefix = id ?? generatedId;
    const hourId = `${fieldPrefix}-hour`;
    const minuteId = `${fieldPrefix}-minute`;
    const parsed = React.useMemo(() => parsePickerValue(value), [value]);
    const current = getCurrentPickerDateTimeValue();
    const hour = parsed?.hour ?? 12;
    const minute = parsed?.minute ?? 0;
    const calendarDate = parsed ? toPickerCalendarDate(parsed) : undefined;
    const calendarToday = current ? toPickerCalendarDate(current) : new Date();

    const handleHourChange = (h: number) => {
        const base = parsed ?? current;
        if (!base) return;
        onChange(formatPickerDateTimeValue({ ...base, hour: h, minute }));
    };

    const handleMinuteChange = (m: number) => {
        const base = parsed ?? current;
        if (!base) return;
        onChange(formatPickerDateTimeValue({ ...base, hour, minute: m }));
    };

    const handleDateSelect = (d: Date | undefined) => {
        if (!d) {
            if (allowClear) onChange("");
            return;
        }
        onChange(formatPickerDateTimeValue({
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            day: d.getDate(),
            hour,
            minute,
        }));
    };

    const label = calendarDate
        ? `${format(calendarDate, "yyyy年M月d日", { locale: zhCN })} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
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
                        "w-full justify-start bg-background text-left font-normal text-foreground",
                        !parsed && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                    <span className="truncate">{label}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                aria-label="日期与时间选择器"
                className="w-auto p-0"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <div className="flex gap-3 p-3 flex-row items-start">
                    <div className="rounded-control p-1">
                        <DayPicker
                            mode="single"
                            locale={zhCN}
                            className="rounded-control"
                            classNames={{
                                weekday: "rdp-weekday !text-meta font-medium text-muted-foreground !opacity-100",
                            }}
                            selected={calendarDate}
                            onSelect={handleDateSelect}
                            defaultMonth={calendarDate ?? calendarToday}
                            today={calendarToday}
                        />
                    </div>
                    <div className="flex min-w-[200px] flex-col gap-3 border-border border-l border-t-0 pl-3 pt-0">
                        <div className="space-y-1.5">
                            <Label htmlFor={hourId} className="text-meta text-muted-foreground">时（24 小时）</Label>
                            <select
                                id={hourId}
                                className="flex h-10 w-full rounded-control border border-input bg-card px-2 text-label text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
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
                        <div className="space-y-1.5">
                            <Label htmlFor={minuteId} className="text-meta text-muted-foreground">分</Label>
                            <select
                                id={minuteId}
                                className="flex h-10 w-full rounded-control border border-input bg-card px-2 text-label text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
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
                                className="text-muted-foreground"
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
