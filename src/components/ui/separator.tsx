import type * as React from 'react'

import { cn } from '../../lib/utils'

export function Separator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="separator"
      className={cn('shrink-0 bg-neutral-200 data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px h-px w-full', className)}
      {...props}
    />
  )
}
