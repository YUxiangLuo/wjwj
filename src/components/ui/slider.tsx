"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

type SliderProps = Omit<
  React.ComponentProps<typeof SliderPrimitive.Root>,
  "aria-label" | "aria-labelledby"
> & {
  "aria-label": string
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": accessibleLabel,
  ...props
}: SliderProps) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-muted-foreground data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-control bg-muted data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={
            _values.length > 1
              ? `${accessibleLabel}${index === 0 ? "下限" : index === _values.length - 1 ? "上限" : `第 ${index + 1} 个值`}`
              : accessibleLabel
          }
          className="block size-5 shrink-0 rounded-circle border-2 border-primary bg-card transition-[border-color,box-shadow] hover:ring-2 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden disabled:pointer-events-none disabled:border-input disabled:bg-muted"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
