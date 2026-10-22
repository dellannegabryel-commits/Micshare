import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useDiscoveredPCs, PCInfo } from '../discovery';
import { PairingClient } from '../pairing';
import { useNavigation } from '@react-navigation/native';

export function DiscoveryScreen() {
  const { pcs, refreshing, refresh } = useDiscoveredPCs();
  const [manualIp, setManualIp] = useState('');
  const navigation = useNavigation();

  const handlePair = async (pc: PCInfo) => {
    const code = await showCodePrompt(pc.name);
    if (!code) return;

    const pairing = new PairingClient(pc.ip, pc.ctrlPort);
    const result = await pairing.connect(code);

    if (result.success && result.sessionId) {
      navigation.navigate('Audio', {
        sessionId: result.sessionId,
        ip: pc.ip,
        audioPort: pc.audioPort,
        ctrlPort: pc.ctrlPort,
        pcName: pc.name,
      });
    } else {
      Alert.alert('Erro de pareamento', result.error || 'Código inválido');
    }
  };

  const handleManualConnect = async () => {
    if (!manualIp.trim()) return;
    const [ip, portStr] = manualIp.split(':');
    const port = parseInt(portStr || '41236', 10);
    const code = await showCodePrompt('IP manual');
    if (!code) return;

    const pairing = new PairingClient(ip, port);
    const result = await pairing.connect(code);

    if (result.success && result.sessionId) {
      navigation.navigate('Audio', {
        sessionId: result.sessionId,
        ip,
        audioPort: 41235,
        ctrlPort: port,
        pcName: 'Manual',
      });
    } else {
      Alert.alert('Erro', result.error || 'Falha na conexão');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Micshare</Text>
        <Text style={styles.subtitle}>Selecione um PC para conectar</Text>
      </View>

      {pcs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nenhum PC encontrado</Text>
          <Text style={styles.emptyHint}>
            Verifique se o Micshare está rodando no PC e ambos estão na mesma Wi-Fi.
          </Text>
        </View>
      ) : (
        <FlatList
          data={pcs}
          keyExtractor={(item) => `${item.name}@${item.ip}`}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.pcItem} onPress={() => handlePair(item)}>
              <View style={styles.pcInfo}>
                <Text style={styles.pcName}>{item.name}</Text>
                <Text style={styles.pcIp}>{item.ip}:{item.ctrlPort}</Text>
              </View>
              <Text style={styles.pcStatus}>{item.pair ? '🔒 Pareamento' : '🔓 Aberto'}</Text>
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        />
      )}

      <View style={styles.manualSection}>
        <Text style={styles.manualTitle}>Conexão manual (IP:porta)</Text>
        <View style={styles.manualInputRow}>
          <TextInput
            style={styles.manualInput}
            value={manualIp}
            onChangeText={setManualIp}
            placeholder="192.168.1.50:41236"
            placeholderTextColor="#666"
          />
          <TouchableOpacity style={styles.manualButton} onPress={handleManualConnect}>
            <Text style={styles.manualButtonText}>Conectar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function showCodePrompt(pcName: string): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.prompt(
      `Parear com ${pcName}`,
      'Digite o código de 6 dígitos mostrado no PC',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Conectar', onPress: (code) => resolve(code || null) },
      ],
      'plain-text',
      '',
      'numeric'
    );
  });
}

// Need to import TextInput
import { TextInput } from 'react-native';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#888' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 18, color: '#fff', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#666', textAlign: 'center' },
  pcItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  pcInfo: { flex: 1 },
  pcName: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 2 },
  pcIp: { fontSize: 14, color: '#888' },
  pcStatus: { fontSize: 14, color: '#4ade80' },
  manualSection: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#222' },
  manualTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  manualInputRow: { flexDirection: 'row', gap: 8 },
  manualInput: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16 },
  manualButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  manualButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});