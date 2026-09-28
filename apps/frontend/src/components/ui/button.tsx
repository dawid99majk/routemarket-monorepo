import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Granat, nie teal: teal znaczy w tym systemie wyłącznie „na pewno”, a bursztyn
        // „być może” i głos agenta. Domyślny wariant w kolorze teal robił z każdego
        // przycisku bez klasy (logowanie, „Ułóż plan”, „Opublikuj”) fałszywy sygnał
        // decyzji; obrys i ghost podświetlały się bursztynem jak propozycja agenta.
        default: "bg-foreground text-background shadow-token-xs hover:bg-foreground/90 hover:shadow-token-sm active:scale-[0.98]",
        destructive: "bg-destructive text-destructive-foreground shadow-token-xs hover:bg-destructive/90 hover:shadow-token-sm active:scale-[0.98]",
        outline: "border border-border bg-card shadow-token-sm hover:bg-secondary hover:text-foreground active:scale-[0.98]",
        secondary: "bg-muted text-foreground hover:bg-muted/70 active:scale-[0.98]",
        ghost: "hover:bg-muted hover:text-foreground active:scale-[0.98]",
        link: "text-foreground underline underline-offset-4 decoration-foreground/40 hover:decoration-foreground",
        success: "bg-success text-success-foreground shadow-token-xs hover:bg-success/90 hover:shadow-token-sm active:scale-[0.98]",
        warning: "bg-warning text-warning-foreground shadow-token-xs hover:bg-warning/90 hover:shadow-token-sm active:scale-[0.98]",
        danger: "bg-danger text-danger-foreground shadow-token-xs hover:bg-danger/90 hover:shadow-token-sm active:scale-[0.98]",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-full px-4 text-body-sm",
        lg: "h-12 rounded-full px-7 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
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
