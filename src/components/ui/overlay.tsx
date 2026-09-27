"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Dialog (14 px radius, the one elevation) ────────────────────────────────────────────────

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  hideClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(8_10_14/0.45)] data-[state=open]:animate-[enter_160ms_var(--motion-ease)]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-surface text-fg shadow-pop outline-none data-[state=open]:animate-enter",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 pt-4 pb-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-sm text-fg-3">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {hideClose ? null : (
            <DialogPrimitive.Close
              className="grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg"
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Side panel on the right (lead drill-down, mobile navigation from the left). */
export function SheetContent({
  side = "right",
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "right" | "left";
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(8_10_14/0.35)]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-0 bottom-0 z-50 flex w-[min(480px,100vw)] flex-col border-l bg-surface text-fg shadow-pop outline-none data-[state=open]:animate-enter",
          side === "right" ? "right-0" : "left-0 border-r border-l-0",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={description ? "mt-0.5 text-sm text-fg-3" : "sr-only"}
            >
              {description ?? title}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close
            className="grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ── Tooltip ─────────────────────────────────────────────────────────────────────────────────

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-1.5 rounded-md border bg-surface px-2 py-1 text-xs text-fg shadow-pop data-[state=delayed-open]:animate-enter"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ── Menu ────────────────────────────────────────────────────────────────────────────────────

export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;

export function MenuContent({
  className,
  align = "start",
  side = "bottom",
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        side={side}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-lg border bg-surface p-1 text-fg shadow-pop data-[state=open]:animate-enter",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-fg-3",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn("px-2 pt-1.5 pb-1 text-xs text-fg-3", className)}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-border" />;
}
