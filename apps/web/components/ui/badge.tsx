import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-iconic-primary focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-iconic-primary text-white',
        secondary:
          'border-transparent bg-gray-100 text-gray-900 dark:bg-surface-muted dark:text-content',
        destructive:
          'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
        outline:
          'text-gray-700 border-gray-300 dark:text-content-muted dark:border-line',
        success:
          'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
        warning:
          'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
