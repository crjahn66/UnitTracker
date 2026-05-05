import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useUser } from '../context/UserContext';
import { useStore } from '../store/useStore';
import { COMPONENTS } from '../types';

const DAYS_BACK = 3;
const SPEED = 60; // px/sec
const REFRESH_MS = 30 * 60 * 1000;
const SEP = '     ★     ';
const MAX_NOTE = 70;

function buildTickerText(): string {
  const { units } = useStore.getState();
  const cutoff = Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000;
  const items: Array<{ date: string; text: string }> = [];

  for (const unit of Object.values(units)) {
    for (const comp of COMPONENTS) {
      const label = unit.customComponentLabels?.[comp.key] ?? comp.label;
      for (const issue of unit.components[comp.key].issues) {
        if (issue.deleted || issue.resolved) continue;
        try { if (new Date(issue.dateFound).getTime() < cutoff) continue; } catch { continue; }
        const notes = issue.notes.length > MAX_NOTE ? issue.notes.slice(0, MAX_NOTE) + '…' : issue.notes;
        items.push({ date: issue.dateFound, text: `${unit.id}  ${label} — ${notes}` });
      }
    }
    for (const misc of (unit.miscEquipment ?? [])) {
      const label = misc.label || 'Misc Equipment';
      for (const issue of (misc.issues ?? [])) {
        if (issue.deleted || issue.resolved) continue;
        try { if (new Date(issue.dateFound).getTime() < cutoff) continue; } catch { continue; }
        const notes = issue.notes.length > MAX_NOTE ? issue.notes.slice(0, MAX_NOTE) + '…' : issue.notes;
        items.push({ date: issue.dateFound, text: `${unit.id}  ${label} — ${notes}` });
      }
    }
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  if (items.length === 0) return '';
  return items.map(i => i.text).join(SEP);
}

export default function IssueTicker() {
  const { isViewOnly } = useUser();
  const { width: screenWidth } = useWindowDimensions();
  const [text, setText] = useState('');
  const [contentWidth, setContentWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const refresh = useCallback(() => setText(buildTickerText()), []);

  useEffect(() => {
    if (!isViewOnly) return;
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [isViewOnly, refresh]);

  useEffect(() => {
    if (!text || contentWidth === 0 || screenWidth === 0) return;

    animRef.current?.stop();
    translateX.setValue(screenWidth);

    const duration = ((screenWidth + contentWidth) / SPEED) * 1000;

    animRef.current = Animated.loop(
      Animated.timing(translateX, {
        toValue: -contentWidth,
        duration,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
        isInteraction: false,
      })
    );
    animRef.current.start();

    return () => { animRef.current?.stop(); };
  }, [text, contentWidth, screenWidth, translateX]);

  if (!isViewOnly || !text) return null;

  return (
    <View style={s.container} pointerEvents="none">
      {/* Hidden render at unconstrained width to measure natural text width */}
      <View style={s.measureWrap}>
        <Text style={s.text} onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}>
          {text}
        </Text>
      </View>
      <Animated.Text style={[s.text, { transform: [{ translateX }] }]} numberOfLines={1}>
        {text}
      </Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    height: 30,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  measureWrap: {
    position: 'absolute',
    opacity: 0,
    width: 99999,
  },
  text: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '500',
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
  },
});
