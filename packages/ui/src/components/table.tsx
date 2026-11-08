/// <reference types="vite/client" />
'use client';

import { ChevronDownIcon } from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '#lib/utils';

// shadcn's base-nova Table on the tokens (docs/DESIGN.md §5 and §7): dense 14 px text, 48 px rows that
// grow with their text (no fixed heights, WCAG 1.4.12), numeric columns right-aligned with tabular
// figures, month group headers, and rows that expand to a detail row with a disclosure button.

/** The caption's id, and how a mounted caption tells the table it is there to name the region. */
const Caption = createContext<{ id: string; mounted: (present: boolean) => void } | undefined>(undefined);

type TableProps = ComponentProps<'table'> & {
  /** The name of the scrolling region when the table has no caption, or the caption is not a name. */
  label?: string;
};

/**
 * A table that scrolls sideways inside its wrapper when it is wider. Only while it is wider does the
 * wrapper take a tab stop, so a keyboard user can scroll it (WCAG 2.1.1), and become a region named by
 * the `label` or the caption; a table that fits adds no landmark and no tab stop. A focused wrapper
 * keeps both until it loses focus, or focus would fall to the page when the table fits again. The wrapper
 * is padded by the focus ring's extent and pulled out by as much, so its overflow never clips a focused
 * row's ring and the table keeps its place (docs/DESIGN.md §6).
 */
function Table({ className, label, ...props }: TableProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const id = useId();
  const [scrolls, setScrolls] = useState(false);
  const [focused, setFocused] = useState(false);
  const [captioned, setCaptioned] = useState(false);
  const caption = useMemo(() => ({ id, mounted: setCaptioned }), [id]);
  useEffect(() => {
    const element = wrapper.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setScrolls(element.scrollWidth > element.clientWidth));
    observer.observe(element);
    if (element.firstElementChild !== null) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);
  // focus and blur do not bubble, so these hear the wrapper only, never a button inside the table.
  useEffect(() => {
    const element = wrapper.current;
    if (element === null) return;
    const hold = () => setFocused(true);
    const release = () => setFocused(false);
    element.addEventListener('focus', hold);
    element.addEventListener('blur', release);
    return () => {
      element.removeEventListener('focus', hold);
      element.removeEventListener('blur', release);
    };
  }, []);
  const focusable = scrolls || focused;
  const name = label === undefined ? (captioned ? { 'aria-labelledby': id } : undefined) : { 'aria-label': label };
  const unnamed = focusable && name === undefined;
  const reported = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !unnamed || reported.current) return;
    reported.current = true;
    // biome-ignore lint/suspicious/noConsole: a development-only report, so the story tests show an unnamed tab stop
    console.error('Table: a table that scrolls needs a TableCaption or a `label` to name its region.');
  }, [unnamed]);
  const region = focusable ? { tabIndex: 0, ...(name === undefined ? {} : { role: 'region', ...name }) } : {};
  return (
    <Caption.Provider value={caption}>
      <div
        ref={wrapper}
        data-slot="table-container"
        className="relative -m-[calc(var(--focus-offset)+var(--focus-width))] overflow-x-auto p-[calc(var(--focus-offset)+var(--focus-width))]"
        {...region}
      >
        <table data-slot="table" className={cn('w-full border-collapse text-14 text-ink', className)} {...props} />
      </div>
    </Caption.Provider>
  );
}

function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('border-line-2 border-b', className)} {...props} />;
}

function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return <tfoot data-slot="table-footer" className={cn('border-line-2 border-t font-medium', className)} {...props} />;
}

function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={cn('h-row border-line border-b', className)} {...props} />;
}

type CellProps = { /** Right-aligned with tabular figures (docs/DESIGN.md §5.9). */ numeric?: boolean };

function TableHead({ className, numeric = false, ...props }: ComponentProps<'th'> & CellProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'px-3 py-2 align-bottom font-medium text-13 text-ink-2',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, numeric = false, ...props }: ComponentProps<'td'> & CellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-3 py-2 align-middle', numeric && 'nums whitespace-nowrap text-right', className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  const caption = useContext(Caption);
  useEffect(() => {
    caption?.mounted(true);
    return () => caption?.mounted(false);
  }, [caption]);
  return (
    <caption
      id={caption?.id}
      data-slot="table-caption"
      className={cn('pb-2 text-left text-13 text-ink-2', className)}
      {...props}
    />
  );
}

/** A month header inside the body ("October 2026" and its totals), spanning every column. */
function TableGroupHeader({ className, colSpan, children, ...props }: ComponentProps<'th'> & { colSpan: number }) {
  return (
    <tr data-slot="table-group-header" className="border-line border-b bg-surface-2">
      <th
        scope="colgroup"
        colSpan={colSpan}
        className={cn('px-3 py-2 text-left font-medium text-13 text-ink-2', className)}
        {...props}
      >
        {children}
      </th>
    </tr>
  );
}

type TableExpandableRowProps = {
  /** The first cell: the button that opens the detail, labelled by what it shows (the coin, the date). */
  summary: ReactNode;
  /** The other cells of the row. */
  children?: ReactNode;
  /** What opens below the row. */
  detail: ReactNode;
  /** The number of columns the detail spans. */
  colSpan: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** A row that opens a detail row below it: holdings on phones, a transaction's items in the Log. */
function TableExpandableRow({
  summary,
  children,
  detail,
  colSpan,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: TableExpandableRowProps) {
  const [own, setOwn] = useState(defaultOpen);
  const expanded = open ?? own;
  const detailId = useId();
  return (
    <>
      <tr
        data-slot="table-row"
        data-expanded={expanded || undefined}
        className={cn('h-row border-line border-b', className)}
      >
        <td className="p-0 align-middle">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={() => {
              setOwn(!expanded);
              onOpenChange?.(!expanded);
            }}
            className="flex min-h-row w-full cursor-pointer items-center gap-2 px-3 text-left text-14 text-ink hover:bg-surface-2"
          >
            <ChevronDownIcon
              aria-hidden
              className={cn(
                'size-5 shrink-0 text-ink-2 transition-transform duration-(--duration-base) ease-enter',
                expanded && 'rotate-180',
              )}
            />
            {summary}
          </button>
        </td>
        {children}
      </tr>
      <tr id={detailId} data-slot="table-detail-row" hidden={!expanded} className="border-line border-b bg-surface-2">
        <td colSpan={colSpan} className="px-3 py-3">
          {detail}
        </td>
      </tr>
    </>
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableExpandableRow,
  TableFooter,
  TableGroupHeader,
  TableHead,
  TableHeader,
  TableRow,
};
