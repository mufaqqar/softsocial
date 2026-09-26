import * as React from "react";
import { AlertCircleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "destructive";

const iconByVariant: Record<AlertVariant, React.ComponentType<{ className?: string }>> = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertCircleIcon,
  destructive: AlertCircleIcon,
};

const classByVariant: Record<AlertVariant, string> = {
  info: "border-info/40 bg-info/10 text-foreground [&>svg]:text-info",
  success: "border-success/40 bg-success/10 text-foreground [&>svg]:text-success",
  warning: "border-warning/50 bg-warning/10 text-foreground [&>svg]:text-warning",
  destructive:
    "border-destructive/40 bg-destructive/10 text-foreground [&>svg]:text-destructive",
};

function Alert({
  className,
  variant = "info",
  ...props
}: React.ComponentProps<"div"> & { variant?: AlertVariant }) {
  const Icon = iconByVariant[variant];

  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        classByVariant[variant],
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">{props.children}</div>
    </div>
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
