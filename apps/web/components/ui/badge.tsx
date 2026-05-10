import * as React from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Prototype .chip style — inline-flex, 11px text, 20px height, 4px radius
const badgeVariants = cva(
  'inline-flex items-center gap-[6px] px-2 h-[20px] rounded-[4px] border text-[11px] font-medium',
  {
    variants: {
      variant: {
        default: 'border-line bg-white text-ink',
        ink: 'border-ink bg-ink text-white',
        em: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]',
        am: 'border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]',
        ro: 'border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]',
        in: 'border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]',
        mu: 'border-[#E5E7EB] bg-[#F3F4F6] text-[#4B5563]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
