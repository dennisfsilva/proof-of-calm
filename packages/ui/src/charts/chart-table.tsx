import { cn } from '#lib/utils';

// Every chart's table view (ADR-0022): the same values as the marks, in a <details> beside the chart.
// It sits outside the role="img" element, whose content assistive technology does not read.

type ChartTableProps = {
  /** The disclosure's label, such as "Show as a table". */
  summary: string;
  caption?: string;
  columns: readonly string[];
  /** Formatted cells, one array per row, in the order of `columns`. */
  rows: readonly (readonly string[])[];
  /** Indexes of the columns that hold numbers: right-aligned, tabular. */
  numericColumns?: readonly number[];
  className?: string;
};

function ChartTable({ summary, caption, columns, rows, numericColumns = [], className }: ChartTableProps) {
  const numeric = (index: number) => numericColumns.includes(index);
  return (
    <details data-slot="chart-table" className={cn('text-14', className)}>
      <summary className="w-fit cursor-pointer py-3 text-ink-2 underline underline-offset-4 hover:text-ink">
        {summary}
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          {caption !== undefined && <caption className="pb-2 text-left text-13 text-ink-2">{caption}</caption>}
          <thead>
            <tr className="border-line-2 border-b">
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'px-2 py-2 font-medium text-13 text-ink-2',
                    numeric(index) ? 'text-right' : 'text-left',
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join('|')} className="border-line border-b">
                {row.map((cell, index) => (
                  <td
                    key={columns[index] ?? index}
                    className={cn('px-2 py-2 text-ink', numeric(index) && 'nums text-right')}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export { ChartTable, type ChartTableProps };
