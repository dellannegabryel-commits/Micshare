import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useDiscoveredPCs } from '../discovery';
import { PCInfo } from '../types';
import { PairingClient } from '../pairing';
import { useNavigation } from '@react-navigation/native';

export function DiscoveryScreen() {
  const { pcs, refreshing, refresh } = useDiscoveredPCs();
  const [manualIp, setManualIp] = useState('');
  const [pairingPc, setPairingPc] = useState<PCInfo | null>(null);
  const [code, setCode] = useState('');
  const navigation = useNavigation<any>();

  const openPairModal = (pc: PCInfo) => {
    setPairingPc(pc);
    setCode(pc.code || '');
  };

  const handlePairSubmit = async () => {
    if (!pairingPc) return;
    const targetPc = pairingPc;
    const inputCode = code.trim();
    setPairingPc(null);
    setCode('');

    const pairing = new PairingClient(targetPc.ip, targetPc.ctrlPort);
    const result = await pairing.connect(inputCode);

    if (result.success && result.sessionId) {
      navigation.navigate('Audio', {
        sessionId: result.sessionId,
        ip: targetPc.ip,
        audioPort: targetPc.audioPort,
        ctrlPort: targetPc.ctrlPort,
        pcName: targetPc.name,
      });
    } else {
      Alert.alert('Erro de pareamento', result.error || 'Código inválido');
    }
  };

  const handleManualConnect = async () => {
    if (!manualIp.trim()) return;
    const [ipPart, portStr] = manualIp.split(':');
    const ip = (ipPart || '').trim();
    const port = parseInt(portStr || '41236', 10);
    if (!ip) return;

    openPairModal({
      name: 'Manual',
      ip,
      audioPort: 41235,
      ctrlPort: port,
      pair: true,
      code: '',
      lastSeen: Date.now(),
    });
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
            <TouchableOpacity style={styles.pcItem} onPress={() => openPairModal(item)}>
              <View style={styles.pcInfo}>
                <Text style={styles.pcName}>{item.name}</Text>
                <Text style={styles.pcIp}>{item.ip}:{item.ctrlPort}</Text>
              </View>
              <Text style={styles.pcStatus}>{item.pair ? '🔒 Parear' : '🔓 Conectar'}</Text>
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
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.manualButton} onPress={handleManualConnect}>
            <Text style={styles.manualButtonText}>Conectar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={pairingPc !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Parear com {pairingPc?.name}</Text>
            <Text style={styles.modalSubtitle}>Digite o código de 6 dígitos mostrado no PC:</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor="#666"
              keyboardType="numeric"
              maxLength={6}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setPairingPc(null)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handlePairSubmit}
              >
                <Text style={styles.confirmBtnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  header: { marginBottom: 24, marginTop: 16 },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#aaa', marginBottom: 16 },
  codeInput: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 14,
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    marginBottom: 20,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#2a2a2a' },
  cancelBtnText: { color: '#aaa', fontWeight: '600' },
  confirmBtn: { backgroundColor: '#3b82f6' },
  confirmBtnText: { color: '#fff', fontWeight: '600' },
});
