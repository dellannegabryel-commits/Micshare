import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute } from '@react-navigation/native';
import { audioCapture } from '../audio';
import { audioSender } from '../transport';
import { controlClient, ControlCallbacks } from '../control';

type RouteParams = {
  sessionId: string;
  ip: string;
  audioPort: number;
  ctrlPort: number;
  pcName: string;
};

export function AudioScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { sessionId = '', ip = '', audioPort = 41235, ctrlPort = 41236, pcName = 'PC' } =
    (route.params || {}) as RouteParams;

  const [connected, setConnected] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [stats, setStats] = useState({ lossPct: 0, bufferMs: 0, seqGaps: 0, reconnects: 0 });
  const [reconnecting, setReconnecting] = useState(false);

  const handleDisconnect = useCallback(() => {
    setConnected(false);
    audioCapture.stop();
    audioSender.stop();
    controlClient.sendBye();
    controlClient.disconnect();
    navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    const callbacks: ControlCallbacks = {
      onStats: (s) => {
        setStats(s);
        setReconnecting(false);
      },
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

    // Start capture
    audioCapture
      .start({
        onFrame: (pcm) => audioSender.sendFrame(pcm),
        onError: (err) => console.error('[capture] error:', err),
        onStart: () => console.log('[capture] started'),
        onStop: () => console.log('[capture] stopped'),
      })
      .catch((err) => {
        Alert.alert('Erro no microfone', err.message);
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
  }, [ip, audioPort, ctrlPort, connected, handleDisconnect]);

  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    audioSender.setMuted(next);
    controlClient.sendMute(next);
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    controlClient.sendVolume(val);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pcName}>{pcName}</Text>
          <Text style={styles.sessionText}>Sessão: {sessionId.slice(0, 8)}</Text>
        </View>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              reconnecting ? styles.statusReconnecting : styles.statusConnected,
            ]}
          />
          <Text style={[styles.statusText, reconnecting && styles.statusReconnectingText]}>
            {reconnecting ? 'Reconectando...' : 'Conectado'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.muteButton, muted && styles.muteButtonActive]}
        onPress={handleMuteToggle}
        activeOpacity={0.8}
      >
        <Text style={[styles.muteText, muted && styles.muteActiveText]}>
          {muted ? '🔇 MUDO' : '🎙 ATIVO'}
        </Text>
      </TouchableOpacity>

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
          maximumTrackTintColor="#333"
          thumbTintColor="#3b82f6"
        />
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          title="Loss"
          value={`${stats.lossPct.toFixed(1)}%`}
          color={stats.lossPct > 5 ? '#ef4444' : '#4ade80'}
        />
        <StatCard
          title="Buffer"
          value={`${stats.bufferMs}ms`}
          color={stats.bufferMs > 80 ? '#ef4444' : '#4ade80'}
        />
        <StatCard title="Seq Gaps" value={String(stats.seqGaps)} color="#aaa" />
        <StatCard title="Reconns" value={String(stats.reconnects)} color="#aaa" />
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
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 24, justifyContent: 'space-between' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  pcName: { fontSize: 24, fontWeight: '700', color: '#fff' },
  sessionText: { fontSize: 13, color: '#666', marginTop: 2 },
  statusContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusConnected: { backgroundColor: '#4ade80' },
  statusReconnecting: { backgroundColor: '#facc15' },
  statusText: { fontSize: 14, color: '#4ade80', fontWeight: '500' },
  statusReconnectingText: { color: '#facc15' },
  muteButton: {
    backgroundColor: '#1e3a5f',
    borderRadius: 24,
    paddingVertical: 48,
    alignItems: 'center',
    marginVertical: 16,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  muteButtonActive: {
    backgroundColor: '#451a1a',
    borderColor: '#ef4444',
  },
  muteText: { fontSize: 32, fontWeight: '700', color: '#60a5fa' },
  muteActiveText: { color: '#f87171' },
  volumeSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
  },
  volumeLabel: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  slider: { width: '100%', height: 40 },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statTitle: { fontSize: 12, color: '#666', marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '600' },
  disconnectButton: {
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  disconnectText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
});
