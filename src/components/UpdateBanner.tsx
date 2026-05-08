import React, { useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUpdateCheck } from '../hooks/useUpdateCheck';
import { downloadAndInstallApk, formatBytes } from '../utils/appUpdater';

export default function UpdateBanner() {
  const { updateInfo, dismiss, webUpdateAvailable, dismissWeb } = useUpdateCheck();
  const [modalOpen, setModalOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);

  // ── Web update banner ─────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    if (!webUpdateAvailable) return null;
    return (
      <>
        <TouchableOpacity style={s.banner} onPress={() => setModalOpen(true)} activeOpacity={0.85}>
          <Ionicons name="cloud-download" size={14} color="#fff" style={{ marginRight: 6 }} />
          <Text style={s.bannerText}>Update available</Text>
          <Text style={s.bannerCta}>  ·  Tap to reload</Text>
        </TouchableOpacity>
        <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.header}>
                <Text style={s.title}>Update Available</Text>
                <TouchableOpacity onPress={() => setModalOpen(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={22} color="#8b949e" />
                </TouchableOpacity>
              </View>
              <Text style={s.versionLine}>A new version of UnitTracker has been deployed.</Text>
              <View style={s.btnRow}>
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => { dismissWeb(); setModalOpen(false); }} activeOpacity={0.8}>
                  <Text style={s.btnGhostText}>Later</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => (window as any).location.reload()} activeOpacity={0.8}>
                  <Ionicons name="refresh" size={16} color="#0d1117" style={{ marginRight: 6 }} />
                  <Text style={s.btnPrimaryText}>Reload Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // ── APK update banner ─────────────────────────────────────────────────────
  if (!updateInfo) return null;

  const { remote, installedVersion, forced } = updateInfo;

  const startInstall = async () => {
    setInstalling(true);
    setDownloaded(0);
    setTotal(0);
    try {
      await downloadAndInstallApk(remote, (d, t) => {
        setDownloaded(d);
        setTotal(t);
      });
      // Installer launched. Leave modal open in case user cancels.
    } catch (e: any) {
      Alert.alert(
        'Update Failed',
        (e?.message ?? 'Unknown error') + '\n\nIf prompted, allow "Install unknown apps" for UnitTracker in Settings.',
      );
    } finally {
      setInstalling(false);
    }
  };

  const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

  return (
    <>
      <TouchableOpacity
        style={[s.banner, forced && s.bannerForced]}
        onPress={() => setModalOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="cloud-download" size={14} color="#fff" style={{ marginRight: 6 }} />
        <Text style={s.bannerText}>
          {forced ? 'Required update' : 'Update available'}: v{remote.version}
        </Text>
        <Text style={s.bannerCta}>  ·  Tap to install</Text>
      </TouchableOpacity>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => !installing && setModalOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.header}>
              <Text style={s.title}>{forced ? 'Required Update' : 'Update Available'}</Text>
              {!forced && !installing && (
                <TouchableOpacity onPress={() => setModalOpen(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={22} color="#8b949e" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={s.versionLine}>
              <Text style={s.versionLabel}>Installed: </Text>v{installedVersion}
              {'   '}
              <Text style={s.versionLabel}>New: </Text>v{remote.version}
            </Text>

            {!!remote.notes && (
              <ScrollView style={s.notesScroll} contentContainerStyle={{ paddingVertical: 4 }}>
                <Text style={s.notesText}>{remote.notes}</Text>
              </ScrollView>
            )}

            {installing && (
              <View style={s.progressWrap}>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${pct}%` }]} />
                </View>
                <Text style={s.progressText}>
                  {pct}%   {formatBytes(downloaded)}{total > 0 ? ` / ${formatBytes(total)}` : ''}
                </Text>
              </View>
            )}

            <View style={s.btnRow}>
              {!forced && !installing && (
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => { dismiss(); setModalOpen(false); }} activeOpacity={0.8}>
                  <Text style={s.btnGhostText}>Later</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.btn, s.btnPrimary, installing && s.btnDisabled]}
                onPress={startInstall}
                disabled={installing}
                activeOpacity={0.8}
              >
                <Ionicons name="download" size={16} color="#0d1117" style={{ marginRight: 6 }} />
                <Text style={s.btnPrimaryText}>{installing ? 'Downloading…' : 'Update Now'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f6feb',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  bannerForced: { backgroundColor: '#c93c37' },
  bannerText: { color: '#ffffff', fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  bannerCta: { color: '#cfe1ff', fontSize: 12, fontWeight: '500' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#161b22', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: '#30363d' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: '#e6edf3', fontSize: 18, fontWeight: '700' },

  versionLine: { color: '#e6edf3', fontSize: 13, marginBottom: 12 },
  versionLabel: { color: '#8b949e' },

  notesScroll: { maxHeight: 200, backgroundColor: '#0d1117', borderRadius: 8, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#21262d' },
  notesText: { color: '#c9d1d9', fontSize: 13, lineHeight: 18 },

  progressWrap: { marginBottom: 14 },
  progressBar: { height: 8, backgroundColor: '#21262d', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: '#3fb950' },
  progressText: { color: '#8b949e', fontSize: 12, textAlign: 'center' },

  btnRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#3fb950' },
  btnPrimaryText: { color: '#0d1117', fontSize: 14, fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: '#30363d' },
  btnGhostText: { color: '#c9d1d9', fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
});
