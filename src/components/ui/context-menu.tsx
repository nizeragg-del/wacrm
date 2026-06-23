"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function ContextMenu({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="context-menu" {...props}>{children}</div>
}

function ContextMenuTrigger({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="context-menu-trigger" {...props}>{children}</div>
}

function ContextMenuContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="context-menu-content"
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function ContextMenuItem({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="context-menu-item"
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem }
