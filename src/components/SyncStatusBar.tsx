import React, { useEffect, useState } from 'react';
import { Platform, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
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

function useUpdateAvailable() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let buildTs: number | null = null;

    async function check() {
      try {
        const res = await fetch('/_v.json?_=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { b } = await res.json();
        if (buildTs === null) {
          buildTs = b;
        } else if (b !== buildTs) {
          setUpdateAvailable(true);
        }
      } catch {}
    }

    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return updateAvailable;
}

export default function SyncStatusBar() {
  const [status, setStatus] = useState(getSyncStatus);
  const [, tick] = useState(0);
  const updateAvailable = useUpdateAvailable();

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

  if (updateAvailable) {
    return (
      <TouchableOpacity style={s.bar} onPress={() => (window as any).location.reload()} activeOpacity={0.7}>
        <View style={[s.dot, { backgroundColor: '#58a6ff' }]} />
        <Text style={[s.text, { color: '#58a6ff' }]}>Update available — tap to reload</Text>
      </TouchableOpacity>
    );
  }

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
