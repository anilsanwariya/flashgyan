import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-b-[4px] border-primary/80 hover:-translate-y-0.5 hover:border-b-[5px] active:translate-y-[3px] active:border-b-0 shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground border-b-[4px] border-destructive/80 hover:-translate-y-0.5 hover:border-b-[5px] active:translate-y-[3px] active:border-b-0 shadow-sm",
        outline:
          "border-2 border-b-[4px] border-input bg-background hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5 active:translate-y-[2px] active:border-b-[2px] shadow-sm",
        secondary:
          "bg-secondary text-secondary-foreground border-b-[4px] border-foreground/10 hover:-translate-y-0.5 hover:border-b-[5px] hover:bg-secondary/80 active:translate-y-[3px] active:border-b-0 shadow-sm",
        ghost: "hover:bg-accent hover:text-accent-foreground active:scale-95",
        link: "text-primary underline-offset-4 hover:underline active:scale-95",
      },
      size: {
        default: "h-11 rounded-xl px-5 py-2",
        sm: "h-9 rounded-lg px-4 text-xs border-b-[3px] hover:border-b-[4px] active:translate-y-[2px]",
        lg: "h-14 rounded-2xl px-8 text-base border-b-[5px] hover:border-b-[6px] active:translate-y-[4px]",
        icon: "h-11 w-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
