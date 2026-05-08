import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getSyncStatus, subscribeSyncStatus } from '../utils/sync';
import { useStore } from '../store/useStore';

function timeAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

const isLocal = (u: string) => !!u && !u.startsWith('https://');

export default function SyncStatusBar() {
  const [status, setStatus] = useState(getSyncStatus);
  const [, tick] = useState(0);

  const hasPendingPhotos = useStore((state) => {
    for (const unit of Object.values(state.units)) {
      for (const comp of Object.values(unit.components)) {
        if ((comp.progressImages ?? []).some(isLocal)) return true;
        if ((comp.goodImages ?? []).some(isLocal)) return true;
        for (const issue of comp.issues) {
          if ((issue.images ?? []).some(isLocal)) return true;
        }
      }
      for (const item of (unit.miscEquipment ?? [])) {
        if ((item.progressImages ?? []).some(isLocal)) return true;
        if ((item.goodImages ?? []).some(isLocal)) return true;
        for (const issue of item.issues) {
          if ((issue.images ?? []).some(isLocal)) return true;
        }
      }
    }
    return false;
  });

  useEffect(() => {
    const unsub = subscribeSyncStatus(() => setStatus(getSyncStatus()));
    const interval = setInterval(() => tick((n) => n + 1), 15000);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  if (hasPendingPhotos || status.hasPendingChanges) {
    return (
      <View style={s.bar}>
        <View style={[s.dot, { backgroundColor: '#d29922' }]} />
        <Text style={[s.text, { color: '#d29922' }]}>Sync needed</Text>
      </View>
    );
  }

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
  bar: { flexDirection: 'row', alignItems: 'center', paddingRight: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  text: { fontSize: 11, fontWeight: '500' },
});
