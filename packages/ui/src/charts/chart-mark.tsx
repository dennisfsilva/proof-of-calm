// A mark at a point of a stretched chart: a zero-length stroke with a round or square cap, whose width
// is its size in pixels whatever the viewBox does to the rest (vector-effect non-scaling-stroke). Rings
// and hollow squares are two of them, the inner one in the chart's backdrop (lib/backdrop.ts).

type ChartDotProps = {
  /** In viewBox units. */
  x: number;
  y: number;
  /** In pixels. */
  size: number;
  square?: boolean;
  className: string;
};

function ChartDot({ x, y, size, square = false, className }: ChartDotProps) {
  return (
    <path
      d={`M${x} ${y}h0`}
      strokeWidth={size}
      strokeLinecap={square ? 'square' : 'round'}
      vectorEffect="non-scaling-stroke"
      className={className}
    />
  );
}

export { ChartDot, type ChartDotProps };
