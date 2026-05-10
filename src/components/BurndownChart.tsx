import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { BurndownPoint } from '../utils/burndown';

const PAD = { top: 12, right: 12, bottom: 28, left: 30 };
const CHART_H = 160;

interface Props {
  data: BurndownPoint[];
}

export default function BurndownChart({ data }: Props) {
  const [width, setWidth] = useState(320);

  if (data.length < 2) return null;

  const chartW = width - PAD.left - PAD.right;
  const chartH = CHART_H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map((d) => d.total), 1);

  const xPos = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
  const yPos = (v: number) => PAD.top + chartH - (v / maxVal) * chartH;

  const pts = (key: keyof Pick<BurndownPoint, 'n' | 's' | 'total'>) =>
    data.map((d, i) => `${xPos(i).toFixed(1)},${yPos(d[key]).toFixed(1)}`).join(' ');

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const xLabelIndices = (() => {
    const base = data.map((_, i) => i).filter((i) => i % 7 === 0);
    const last = data.length - 1;
    if (last - (base[base.length - 1] ?? 0) >= 4) base.push(last);
    return base;
  })();

  return (
    <View style={s.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width={width} height={CHART_H}>
        {/* Horizontal grid + Y labels */}
        {yTicks.map((v) => (
          <React.Fragment key={v}>
            <Line
              x1={PAD.left} y1={yPos(v)}
              x2={PAD.left + chartW} y2={yPos(v)}
              stroke="#21262d" strokeWidth={1}
            />
            <SvgText
              x={PAD.left - 5} y={yPos(v) + 4}
              fontSize={9} fill="#6e7681" textAnchor="end"
            >{v}</SvgText>
          </React.Fragment>
        ))}

        {/* X axis */}
        <Line
          x1={PAD.left} y1={PAD.top + chartH}
          x2={PAD.left + chartW} y2={PAD.top + chartH}
          stroke="#30363d" strokeWidth={1}
        />

        {/* Data lines */}
        <Polyline points={pts('total')} fill="none" stroke="#8b949e" strokeWidth={1.5} strokeDasharray="5,3" />
        <Polyline points={pts('n')} fill="none" stroke="#58a6ff" strokeWidth={2} />
        <Polyline points={pts('s')} fill="none" stroke="#f0883e" strokeWidth={2} />

        {/* X labels */}
        {xLabelIndices.map((i) => (
          <SvgText
            key={i}
            x={xPos(i)} y={CHART_H - 6}
            fontSize={9} fill="#6e7681" textAnchor="middle"
          >{data[i].date.slice(5)}</SvgText>
        ))}
      </Svg>

      <View style={s.legend}>
        <LegendItem color="#58a6ff" label={`N: ${data[data.length - 1].n}`} />
        <LegendItem color="#f0883e" label={`S: ${data[data.length - 1].s}`} />
        <LegendItem color="#8b949e" label={`Total: ${data[data.length - 1].total}`} dashed />
      </View>
    </View>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendLine, { backgroundColor: dashed ? 'transparent' : color, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingTop: 8 },
  legend: { flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingBottom: 10, paddingTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLine: { width: 18, height: 2, borderWidth: 1 },
  legendText: { color: '#8b949e', fontSize: 11 },
});
