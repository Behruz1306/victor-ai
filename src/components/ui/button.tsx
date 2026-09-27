import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium select-none transition-[background-color,color,box-shadow,opacity] duration-[120ms] ease-out disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-accent/90 active:bg-accent/85",
        outline:
          "border border-border-strong bg-surface text-fg hover:bg-surface-2 active:bg-surface-3",
        ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg active:bg-surface-3",
        subtle: "bg-surface-2 text-fg hover:bg-surface-3",
        danger: "bg-critical text-white hover:bg-critical/90",
        link: "px-0 text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 text-base",
        sm: "h-8 px-3 text-sm",
        xs: "h-7 px-2 text-xs [&_svg]:size-3.5",
        lg: "h-11 px-5 text-base",
        icon: "size-8 [&_svg]:size-4",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
