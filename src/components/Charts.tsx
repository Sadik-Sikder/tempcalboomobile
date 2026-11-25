import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { palette } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';

export interface ChartPoint {
  label: string;
  value: number;
}

const LINE_COLOR = palette.indigo;

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, e => setWidth(e.nativeEvent.layout.width)];
}

function niceMax(value: number): number {
  if (value <= 2) return 2;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [2, 4, 6, 10].find(m => m * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function EmptyChart({ message }: { message: string }) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

const PAD = { top: 12, right: 8, bottom: 24, left: 28 };

function YGrid({
  width,
  height,
  max,
}: {
  width: number;
  height: number;
  max: number;
}) {
  const { colors } = useTheme();
  const plotHeight = height - PAD.top - PAD.bottom;
  const ticks = [0, max / 2, max];
  return (
    <>
      {ticks.map(tick => {
        const y = PAD.top + plotHeight - (tick / max) * plotHeight;
        return (
          <Line
            key={`grid-${tick}`}
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y}
            y2={y}
            stroke={colors.borderSoft}
            strokeWidth={1}
          />
        );
      })}
      {ticks.map(tick => {
        const y = PAD.top + plotHeight - (tick / max) * plotHeight;
        return (
          <SvgText
            key={`label-${tick}`}
            x={PAD.left - 6}
            y={y + 4}
            fontSize={10}
            fill={colors.textSecondary}
            textAnchor="end"
          >
            {Number.isInteger(tick) ? tick : tick.toFixed(1)}
          </SvgText>
        );
      })}
    </>
  );
}

// Show at most ~5 x labels so they never collide on a phone-width chart.
function labelEvery(count: number): number {
  return Math.max(1, Math.ceil(count / 5));
}

// Every `every`-th label plus the last one (so the range's end date is
// always shown), dropping a regular label that would crowd that last one.
function showXLabel(i: number, count: number, every: number): boolean {
  const last = count - 1;
  if (i === last) return true;
  return i % every === 0 && last - i >= every / 2;
}

export function AreaLineChart({
  points,
  height = 180,
}: {
  points: ChartPoint[];
  height?: number;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const max = niceMax(Math.max(0, ...points.map(p => p.value)));
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: PAD.left + (points.length > 1 ? i * step : plotWidth / 2),
    y: PAD.top + plotHeight - (p.value / max) * plotHeight,
  }));
  // Smoothed like the web's `smooth: true`, but with both control points
  // level with their endpoints, so a segment never overshoots outside its
  // two values — no dipping below zero between a 0 and a 3.
  const line = coords
    .map((c, i) => {
      if (i === 0) return `M${c.x},${c.y}`;
      const prev = coords[i - 1];
      const midX = (prev.x + c.x) / 2;
      return `C${midX},${prev.y} ${midX},${c.y} ${c.x},${c.y}`;
    })
    .join(' ');
  const baseline = PAD.top + plotHeight;
  const area =
    coords.length > 0
      ? `${line} L${coords[coords.length - 1].x},${baseline} L${
          coords[0].x
        },${baseline} Z`
      : '';
  const every = labelEvery(points.length);

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={LINE_COLOR} stopOpacity={0.3} />
              <Stop offset="1" stopColor={LINE_COLOR} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <YGrid width={width} height={height} max={max} />
          {area !== '' && <Path d={area} fill="url(#areaFill)" />}
          <Path
            d={line}
            stroke={LINE_COLOR}
            strokeWidth={2.5}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Dots only while they stay distinct; on long ranges they'd blur. */}
          {points.length <= 14 &&
            coords.map((c, i) => (
              <Circle
                key={`dot-${points[i].label}`}
                cx={c.x}
                cy={c.y}
                r={3}
                fill={colors.surface}
                stroke={LINE_COLOR}
                strokeWidth={2}
              />
            ))}
          {points.map((p, i) =>
            showXLabel(i, points.length, every) ? (
              <SvgText
                key={`x-${p.label}`}
                x={coords[i].x}
                y={height - 6}
                fontSize={10}
                fill={colors.textSecondary}
                // Edge labels anchor inward so they aren't clipped.
                textAnchor={
                  i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'
                }
              >
                {p.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      )}
    </View>
  );
}

export function BarChart({
  bars,
  height = 180,
}: {
  bars: ChartPoint[];
  height?: number;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const max = niceMax(Math.max(0, ...bars.map(b => b.value)));
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const slot = bars.length > 0 ? plotWidth / bars.length : 0;
  const barWidth = Math.min(48, slot * 0.5);

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} />
              <Stop offset="1" stopColor={LINE_COLOR} />
            </LinearGradient>
          </Defs>
          <YGrid width={width} height={height} max={max} />
          {bars.map((b, i) => {
            const h = (b.value / max) * plotHeight;
            const x = PAD.left + i * slot + (slot - barWidth) / 2;
            const y = PAD.top + plotHeight - h;
            return (
              <Rect
                key={`bar-${b.label}`}
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={Math.min(6, h / 2)}
                fill="url(#barFill)"
              />
            );
          })}
          {bars.map((b, i) => (
            <SvgText
              key={`bx-${b.label}`}
              x={PAD.left + i * slot + slot / 2}
              y={height - 6}
              fontSize={10.5}
              fill={colors.textSecondary}
              textAnchor="middle"
            >
              {b.label}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

export interface DonutSlice extends ChartPoint {
  color: string;
}

// SVG arc path for one donut segment, angles in radians from 12 o'clock.
function arcPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const point = (r: number, a: number) => [
    cx + r * Math.sin(a),
    cy - r * Math.cos(a),
  ];
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = point(outer, start);
  const [x2, y2] = point(outer, end);
  const [x3, y3] = point(inner, end);
  const [x4, y4] = point(inner, start);
  return [
    `M${x1},${y1}`,
    `A${outer},${outer} 0 ${large} 1 ${x2},${y2}`,
    `L${x3},${y3}`,
    `A${inner},${inner} 0 ${large} 0 ${x4},${y4}`,
    'Z',
  ].join(' ');
}

export function DonutChart({
  slices,
  size = 150,
}: {
  slices: DonutSlice[];
  size?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const outer = size / 2;
  const inner = outer * 0.62;
  let angle = 0;

  return (
    <View style={styles.donutRow}>
      <Svg width={size} height={size}>
        {slices.length === 1 ? (
          // A single 360° arc can't be drawn as one SVG arc; use a ring.
          <Circle
            cx={outer}
            cy={outer}
            r={(outer + inner) / 2}
            stroke={slices[0].color}
            strokeWidth={outer - inner}
            fill="none"
          />
        ) : (
          slices.map(s => {
            const sweep = (s.value / total) * Math.PI * 2;
            const d = arcPath(outer, outer, outer, inner, angle, angle + sweep);
            angle += sweep;
            return <Path key={s.label} d={d} fill={s.color} />;
          })
        )}
        <SvgText
          x={outer}
          y={outer + 2}
          fontSize={22}
          fontWeight="700"
          fill={colors.text}
          textAnchor="middle"
        >
          {total}
        </SvgText>
        <SvgText
          x={outer}
          y={outer + 18}
          fontSize={10.5}
          fill={colors.textSecondary}
          textAnchor="middle"
        >
          meetings
        </SvgText>
      </Svg>
      <View style={styles.legend}>
        {slices.map(s => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={styles.legendValue}>{s.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  empty: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12.5,
    color: c.textMuted,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: 12.5,
    color: c.text,
  },
  legendValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: c.text,
  },
}));
