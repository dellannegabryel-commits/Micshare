import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Slider, Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { audioCapture } from '../audio';
import { audioSender } from '../transport';
import { controlClient, ControlCallbacks } from '../control';
import { encodeCtrl, Mute, Volume, Bye } from '@micshare/protocol';

type RouteParams = {
  sessionId: string;
  ip: string;
  audioPort: number;
  ctrlPort: number;
  pcName: string;
};

export function AudioScreen() {
  const navigation = useNavigation();
  const route = useRoute<{ params: RouteParams }>();
  const { sessionId, ip, audioPort, ctrlPort, pcName } = route.params;

  const [connected, setConnected] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [stats, setStats] = useState({ lossPct: 0, bufferMs: 0, seqGaps: 0, reconnects: 0 });
  const [reconnecting, setReconnecting] = useState(false);

  const callbacks: ControlCallbacks = {
    onStats: (s) => setStats(s),
    onError: (code, message) => {
      console.error('[control] error:', code, message);
      if (code === 'bad_token') {
        Alert.alert('Sessão expirada', 'O código de pareamento expirou. Reconecte.');
        handleDisconnect();
      }
    },
    onClose: () => {
      if (connected) {
        setReconnecting(true);
      }
    },
  };

  useEffect(() => {
    // Start capture
    audioCapture.start({
      onFrame: (pcm) => audioSender.sendFrame(pcm),
      onError: (err) => console.error('[capture] error:', err),
      onStart: () => console.log('[capture] started'),
      onStop: () => console.log('[capture] stopped'),
    });

    // Start UDP sender
    audioSender.start(ip, audioPort);

    // Connect control WS
    controlClient.connect(ip, ctrlPort, callbacks);

    return () => {
      audioCapture.stop();
      audioSender.stop();
      controlClient.disconnect();
    };
  }, [ip, audioPort, ctrlPort]);

  const handleMuteToggle = useCallback(() => {
    const newMuted = !muted;
    setMuted(newMuted);
    audioSender.setMuted(newMuted);
    controlClient.sendMute(newMuted);
  }, [muted]);

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    controlClient.sendVolume(value);
  }, []);

  const handleDisconnect = useCallback(() => {
    controlClient.sendBye();
    controlClient.disconnect();
    audioSender.stop();
    audioCapture.stop();
    setConnected(false);
    navigation.goBack();
  }, [navigation]);

  if (!connected) {
    return null; // Will unmount via goBack
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDisconnect} style={styles.backButton}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.pcName}>{pcName}</Text>
          <Text style={styles.pcIp}>{ip}:{ctrlPort}</Text>
        </View>
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, reconnecting ? styles.statusReconnecting : styles.statusConnected]} />
          <Text style={[styles.statusText, reconnecting && styles.statusReconnectingText]}>
            {reconnecting ? 'Reconectando...' : 'Conectado'}
          </Text>
        </View>
      </View>

      <View style={styles.muteButton} onPress={handleMuteToggle}>
        <Text style={[styles.muteText, muted && styles.muteActive]}>{muted ? '🔇 MUDO' : '🎙 ATIVO'}</Text>
      </View>

      <View style={styles.volumeSection}>
        <Text style={styles.volumeLabel}>Volume: {Math.round(volume * 100)}%</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={4}
          step={0.1}
          value={volume}
          onValueChange={handleVolumeChange}
          minimumTrackTintColor="#3b82f6"
          maximumTrackTintColor="#222"
          thumbTintColor="#fff"
        />
      </View>

      <View style={styles.statsGrid}>
        <StatCard title="Loss" value={`${stats.lossPct.toFixed(1)}%`} color={stats.lossPct > 5 ? '#ef4444' : '#4ade80'} />
        <StatCard title="Buffer" value={`${stats.bufferMs}ms`} color={stats.bufferMs > 80 ? '#ef4444' : '#4ade80'} />
        <StatCard title="Gaps" value={String(stats.seqGaps)} color={stats.seqGaps > 10 ? '#ef4444' : '#4ade80'} />
        <StatCard title="Reconects" value={String(stats.reconnects)} color={stats.reconnects > 3 ? '#ef4444' : '#4ade80'} />
      </View>

      <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
        <Text style={styles.disconnectText}>Desconectar</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backButton: { padding: 8 },
  backText: { color: '#888', fontSize: 16 },
  headerCenter: { flex: 1, alignItems: 'center' },
  pcName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  pcIp: { fontSize: 12, color: '#666' },
  statusContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusConnected: { backgroundColor: '#4ade80' },
  statusReconnecting: { backgroundColor: '#fbbf24' },
  statusText: { fontSize: 12, color: '#888' },
  statusReconnectingText: { color: '#fbbf24' },
  muteButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 48,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 3,
    borderColor: '#333',
  },
  muteText: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 2 },
  muteActive: { color: '#ef4444', borderColor: '#ef4444' },
  volumeSection: { marginBottom: 24 },
  volumeLabel: { fontSize: 16, color: '#fff', marginBottom: 8, textAlign: 'center' },
  slider: { height: 40 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statTitle: { fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'uppercase' },
  statValue: { fontSize: 24, fontWeight: '700' },
  disconnectButton: { backgroundColor: '#222', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 'auto' },
  disconnectText: { color: '#888', fontSize: 16, fontWeight: '600' },
});