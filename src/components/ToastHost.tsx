import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useToastStore } from '../utils/toast';

const DEFAULT_DURATION = 5000;

export default function ToastHost() {
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track which toast id has had its action fired, so the auto-dismiss
  // doesn't also call onDismissNoAction.
  const actionedIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!current) return;
    const myId = current.id;
    Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          if (actionedIdRef.current !== myId) current.onDismissNoAction?.();
          dismiss();
        }
      });
    }, current.durationMs ?? DEFAULT_DURATION);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, opacity, dismiss]);

  if (!current) return null;

  const handleAction = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    actionedIdRef.current = current.id;
    current.onAction?.();
    dismiss();
  };

  return (
    <Animated.View pointerEvents="box-none" style={[s.wrap, { opacity }]}>
      <View style={s.toast}>
        <Text style={s.msg} numberOfLines={2}>{current.message}</Text>
        {current.actionLabel && (
          <TouchableOpacity onPress={handleAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.action}>{current.actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 80,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#21262d',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 240,
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  msg: { color: '#e6edf3', fontSize: 13, flex: 1, marginRight: 12 },
  action: { color: '#58a6ff', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
