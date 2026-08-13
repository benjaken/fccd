import * as React from "react";

import { cn } from "@/lib/utils";

export type SwitchProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "role"
> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { checked, onCheckedChange, className, disabled, onClick, ...props },
    ref,
  ) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      ref={ref}
      className={cn("ui-switch", checked && "ui-switch-checked", className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled) return;
        onCheckedChange?.(!checked);
      }}
      {...props}
    >
      <span className="ui-switch-thumb" aria-hidden="true" />
    </button>
  ),
);
Switch.displayName = "Switch";

export { Switch };
