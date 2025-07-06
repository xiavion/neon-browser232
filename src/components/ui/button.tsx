import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "relative bg-primary text-primary-foreground shadow-[0_0_15px_rgba(255,0,255,0.5)] hover:shadow-[0_0_25px_rgba(255,0,255,0.8)] hover:brightness-110 transition-all",
        destructive:
          "relative bg-destructive text-destructive-foreground shadow-[0_0_15px_rgba(255,0,0,0.5)] hover:shadow-[0_0_25px_rgba(255,0,0,0.8)] hover:brightness-110",
        outline:
          "relative border border-input bg-transparent text-foreground shadow-[0_0_5px_rgba(255,255,255,0.2)] hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] hover:border-primary hover:text-primary",
        secondary:
          "relative bg-secondary text-secondary-foreground shadow-[0_0_15px_rgba(0,255,255,0.5)] hover:shadow-[0_0_25px_rgba(0,255,255,0.8)] hover:brightness-110",
        ghost: "hover:bg-muted hover:text-accent",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/90",
        neon: "relative overflow-hidden bg-transparent border border-primary text-primary hover:text-primary-foreground transition-all duration-300 neon-text before:absolute before:inset-0 before:bg-primary/0 before:hover:bg-primary/100 before:transition-all before:duration-300 before:-z-10",
        accent: "relative bg-accent text-accent-foreground shadow-[0_0_15px_rgba(255,0,128,0.5)] hover:shadow-[0_0_25px_rgba(255,0,128,0.8)] hover:brightness-110",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  forwardedAs?: React.ElementType
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, forwardedAs, ...props }, ref) => {
    const Comp = asChild ? Slot : forwardedAs || "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
