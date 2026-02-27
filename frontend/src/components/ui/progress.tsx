import React from "react";
import { cn } from "@/lib/utils";

type TProgressType = "default" | "success" | "warning" | "error" | "secondary";

interface ProgressProps extends React.HTMLAttributes<HTMLProgressElement> {
  value: number;
  max?: number;
  colors?: { [key: string]: string };
  type?: TProgressType;
}

const getColor = (value: number, type: TProgressType, colors?: Record<string, string>) => {
  if (colors) {
    const keys = Object.keys(colors).sort((a, b) => parseInt(a) - parseInt(b));
    for (let i = keys.length - 1; i >= 0; i--) {
      if (value >= parseInt(keys[i])) {
        return colors[keys[i]];
      }
    }
  }
  switch (type) {
    case "success":
      return "hsl(var(--primary))";
    case "error":
      return "hsl(var(--destructive))";
    case "warning":
      return "hsl(var(--warning))";
    case "secondary":
      return "hsl(var(--muted-foreground))";
    default:
      return "hsl(var(--primary))";
  }
};

export const Progress = ({
  value,
  max = 100,
  colors,
  type = "default",
  className,
  ...props
}: ProgressProps) => {
  const fillColor = getColor(value, type, colors);

  return (
    <progress
      value={value}
      max={max}
      className={cn(
        "progress-step h-2.5 w-full appearance-none border-none",
        "[&::-webkit-progress-bar]:rounded-[5px] [&::-webkit-progress-bar]:bg-muted",
        "[&::-webkit-progress-value]:rounded-[5px] [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:duration-300 [&::-webkit-progress-value]:ease-out",
        "[&::-moz-progress-bar]:rounded-[5px] [&::-moz-progress-bar]:transition-all [&::-moz-progress-bar]:duration-300 [&::-moz-progress-bar]:ease-out",
        className
      )}
      style={{ ["--progress-fill" as string]: fillColor } as React.CSSProperties}
      {...props}
    />
  );
};
