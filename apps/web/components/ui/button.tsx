'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  // Base premium: radios suaves, transición completa, feedback táctil (active:scale),
  // foco accesible y offset theme-aware (claro/oscuro).
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-white transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iconic-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:ring-offset-surface',
  {
    variants: {
      variant: {
        // Primario azul premium: highlight interno sutil + sombra de marca; táctil al hover/press.
        default:
          'bg-iconic-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_8px_-2px_rgba(0,93,214,0.45)] hover:bg-brand-600 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_18px_-4px_rgba(0,93,214,0.55)] active:bg-brand-700',
        destructive:
          'bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md active:bg-red-800',
        // Secundario "glass/frosted" en claro; en dark = superficie sólida sutil (visible, sin borde blanco).
        outline:
          'border border-gray-300/80 bg-white/70 text-gray-700 backdrop-blur-sm hover:bg-white active:bg-gray-100 dark:border-line dark:bg-surface-muted dark:text-content dark:backdrop-blur-none dark:hover:bg-surface-soft',
        secondary:
          'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 dark:bg-surface-muted dark:text-content dark:hover:bg-surface-soft',
        ghost:
          'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-content-muted dark:hover:bg-surface-muted dark:hover:text-content',
        link:
          'text-blue-700 underline-offset-4 hover:underline dark:text-iconic-cyan',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 px-8',
        icon: 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
