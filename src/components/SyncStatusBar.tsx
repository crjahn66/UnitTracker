import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getSyncStatus, subscribeSyncStatus } from '../utils/sync';

function timeAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function SyncStatusBar() {
  const [status, setStatus] = useState(getSyncStatus);
  const [, tick] = useState(0);

  useEffect(() => {
    const unsub = subscribeSyncStatus(() => setStatus(getSyncStatus()));
    // Re-render every 15s so "X ago" stays fresh
    const interval = setInterval(() => tick((n) => n + 1), 15000);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  const online = status.isOnline;
  const dotColor = online ? '#3fb950' : '#f85149';
  const label = online
    ? status.lastSyncedAt
      ? `Synced ${timeAgo(status.lastSyncedAt)}`
      : 'Online'
    : 'Offline';

  return (
    <View style={s.bar}>
      <View style={[s.dot, { backgroundColor: dotColor }]} />
      <Text style={[s.text, { color: online ? '#8b949e' : '#f85149' }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  text: { fontSize: 11, fontWeight: '500' },
});
