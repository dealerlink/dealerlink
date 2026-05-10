import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base — prototype .btn style
  'inline-flex items-center justify-center gap-[6px] whitespace-nowrap rounded-[6px] text-[13px] font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // .btn (default) — hairline border, white bg
        default: 'h-[36px] px-3 border-line bg-white text-ink hover:bg-paper-2',
        // .btn-pri — ink bg (prototype primary action, NOT accent blue)
        primary: 'h-[36px] px-3 border-ink bg-ink text-white hover:bg-[#000]',
        // .btn-acc — accent indigo (high-stakes: "New deal", "Send quotation")
        accent: 'h-[36px] px-3 border-accent bg-accent text-white hover:bg-accent-2',
        // Ghost — no bg, no border, just hover
        ghost: 'h-[36px] px-3 border-transparent bg-transparent text-ink hover:bg-paper-2',
        // Destructive — rose
        destructive: 'h-[36px] px-3 border-rose bg-rose text-white hover:opacity-90',
        // Link style
        link: 'h-auto px-0 border-transparent underline-offset-4 hover:underline text-accent',
      },
      size: {
        default: 'h-[36px] px-3',
        sm: 'h-[28px] px-[10px] text-[12px] rounded-[5px]',
        icon: 'h-[32px] w-[32px] rounded-[6px] p-0 border-transparent bg-transparent text-mute hover:bg-paper-2 hover:text-ink',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
