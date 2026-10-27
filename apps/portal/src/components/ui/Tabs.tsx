'use client';
/**
 * Tabs — Radix UI Tabs + brand styling.
 *
 * Usage:
 *   <Tabs defaultValue="all">
 *     <TabsList>
 *       <TabsTrigger value="all">All</TabsTrigger>
 *       <TabsTrigger value="active">Active</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="all">...</TabsContent>
 *     <TabsContent value="active">...</TabsContent>
 *   </Tabs>
 */
import * as _RadixTabs from '@radix-ui/react-tabs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RadixTabs = _RadixTabs as any;
import { clsx } from 'clsx';

/* Root */
interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  return (
    <RadixTabs.Root
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
      className={className}
    >
      {children}
    </RadixTabs.Root>
  );
}

/* List */
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <RadixTabs.List
      className={clsx(
        'inline-flex items-center gap-1 rounded-xl bg-cloud/60 p-1',
        className,
      )}
    >
      {children}
    </RadixTabs.List>
  );
}

/* Trigger */
interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold transition-all',
        'text-royal/60 hover:text-navy',
        'data-[state=active]:bg-white data-[state=active]:text-navy data-[state=active]:shadow-sm',
        className,
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

/* Content */
export function TabsContent({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  return (
    <RadixTabs.Content value={value} className={clsx('mt-4 outline-none', className)}>
      {children}
    </RadixTabs.Content>
  );
}
