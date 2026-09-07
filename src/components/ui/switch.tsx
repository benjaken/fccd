import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

export type SwitchProps = Omit<
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  "checked"
> & {
  checked: boolean;
};

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(
  (
    { checked, className, ...props },
    ref,
  ) => (
    <SwitchPrimitive.Root
      ref={ref}
      checked={checked}
      data-slot="switch"
      className={cn("ui-switch", checked && "ui-switch-checked", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="ui-switch-thumb"
      />
    </SwitchPrimitive.Root>
  ),
);
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
