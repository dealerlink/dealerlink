import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Matches prototype input style: hairline border, paper-2 bg on focus
          'border-line text-ink flex h-[34px] w-full rounded-[5px] border bg-white px-3 text-[13px]',
          'placeholder:text-mute',
          'focus:ring-accent focus:border-accent focus:outline-none focus:ring-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
