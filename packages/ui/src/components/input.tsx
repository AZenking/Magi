import * as React from "react"
import { XIcon } from "lucide-react"

import { cn } from "#lib/utils"

function Input({ className, type, onClear, ...props }: React.ComponentProps<"input"> & {
  onClear?: () => void
}) {
  const hasValue = props.value !== undefined && props.value !== ""
  const showClear = onClear && hasValue && !props.disabled

  return (
    <div className="relative">
      <input
        type={type}
        data-slot="input"
        className={cn(
          "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          showClear && "pr-9",
          className
        )}
        {...props}
      />
      {showClear && (
        <button
          type="button"
          data-slot="input-clear"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={onClear}
          tabIndex={-1}
          aria-hidden="true"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export { Input }
