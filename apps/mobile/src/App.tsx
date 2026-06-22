import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { registerGlobals } from '@livekit/react-native';
import { LiveKitRoom, VideoConference } from '@livekit/react-native';
import { api } from './api';

registerGlobals();

type Server = { id: string; name: string; role?: string };
type Channel = { id: string; name: string; type: 'TEXT' | 'VOICE'; allowVideo?: boolean; allowScreenShare?: boolean; requirePushToTalk?: boolean };
type Detail = { server: { id: string; name: string; channels: Channel[] } };
type VoiceToken = { token: string; wsUrl: string; roomName: string; policy?: { serverMuted?: boolean; allowVideo?: boolean; allowScreenShare?: boolean; requirePushToTalk?: boolean } };
type Settings = { pushToTalkEnabled?: boolean; lowPowerMode?: boolean; startMuted?: boolean; mobileDataSaver?: boolean };

export default function App() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [servers, setServers] = useState<Server[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [voice, setVoice] = useState<VoiceToken | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [error, setError] = useState('');

  async function login() {
    try {
      setError('');
      const data = await api<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function joinInvite() {
    if (!inviteCode.trim()) return;
    const data = await api<{ serverId: string }>('/invites/join', { token, method: 'POST', body: JSON.stringify({ code: inviteCode }) });
    setInviteCode('');
    await loadServers(data.serverId);
  }

  async function loadServers(openId?: string) {
    const data = await api<{ servers: Server[] }>('/servers', { token });
    setServers(data.servers);
    if (openId) openServer(openId);
  }

  useEffect(() => {
    if (!token) return;
    loadServers().catch((err) => setError(err.message));
    api<{ settings: Settings }>('/settings', { token }).then((data) => setSettings(data.settings)).catch(() => null);
  }, [token]);

  async function openServer(serverId: string) {
    const data = await api<Detail>(`/servers/${serverId}`, { token });
    setDetail(data);
  }

  async function joinVoice(channelId: string) {
    const [voiceData, settingsData] = await Promise.all([
      api<VoiceToken>('/livekit/token', { token, method: 'POST', body: JSON.stringify({ channelId }) }),
      api<{ settings: Settings }>('/settings', { token }),
    ]);
    setSettings(settingsData.settings);
    setVoice(voiceData);
  }

  async function toggleSetting(key: keyof Settings) {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    await api('/settings', { token, method: 'PUT', body: JSON.stringify({ [key]: next[key] }) });
  }

  if (voice) {
    return (
      <LiveKitRoom serverUrl={voice.wsUrl} token={voice.token} connect audio={!settings.startMuted && !voice.policy?.serverMuted} video={false}>
        <SafeAreaView style={styles.screen}>
          <View style={styles.voiceHeader}>
            <Text style={styles.title}>Ses Odası</Text>
            <Text style={styles.muted}>{voice.policy?.requirePushToTalk ? 'Push-to-talk gerekli' : 'Ses bağlantısı aktif'} · {settings.mobileDataSaver ? 'Veri tasarrufu açık' : 'Tam kalite'}</Text>
          </View>
          <VideoConference />
          <TouchableOpacity style={styles.dangerButton} onPress={() => setVoice(null)}><Text style={styles.buttonText}>Ayrıl</Text></TouchableOpacity>
        </SafeAreaView>
      </LiveKitRoom>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Let's Meet</Text>
          <Text style={styles.muted}>Native Android/iOS oyuncu ses, video ve ekran paylaşımı.</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="E-posta" placeholderTextColor="#8d94a6" autoCapitalize="none" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Şifre" placeholderTextColor="#8d94a6" secureTextEntry />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={login}><Text style={styles.buttonText}>Giriş yap</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Let's Meet</Text>
        <View style={styles.card}>
          <Text style={styles.subtitle}>Mobil oyun modu</Text>
          <Row label="Düşük güç" value={Boolean(settings.lowPowerMode)} onValueChange={() => toggleSetting('lowPowerMode')} />
          <Row label="Push-to-talk" value={Boolean(settings.pushToTalkEnabled)} onValueChange={() => toggleSetting('pushToTalkEnabled')} />
          <Row label="Kanala sessiz başla" value={Boolean(settings.startMuted)} onValueChange={() => toggleSetting('startMuted')} />
          <Row label="Mobil veri tasarrufu" value={Boolean(settings.mobileDataSaver)} onValueChange={() => toggleSetting('mobileDataSaver')} />
        </View>
        <View style={styles.inviteBox}>
          <TextInput style={styles.input} value={inviteCode} onChangeText={setInviteCode} placeholder="LM- davet kodu" placeholderTextColor="#8d94a6" />
          <TouchableOpacity style={styles.button} onPress={joinInvite}><Text style={styles.buttonText}>Katıl</Text></TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Sunucular</Text>
        {servers.map((server) => (
          <TouchableOpacity style={styles.row} key={server.id} onPress={() => openServer(server.id)}>
            <Text style={styles.rowText}>{server.name}</Text>
            <Text style={styles.muted}>{server.role}</Text>
          </TouchableOpacity>
        ))}
        {detail && (
          <>
            <Text style={styles.subtitle}>{detail.server.name}</Text>
            {detail.server.channels.map((channel) => (
              <TouchableOpacity style={styles.row} key={channel.id} onPress={() => channel.type === 'VOICE' && joinVoice(channel.id)}>
                <Text style={styles.rowText}>{channel.type === 'VOICE' ? '🔊' : '#'} {channel.name}</Text>
                <Text style={styles.muted}>{channel.type === 'VOICE' ? `${channel.allowVideo === false ? 'kamera kapalı' : 'kamera'} · ${channel.allowScreenShare === false ? 'ekran kapalı' : 'ekran'}` : 'metin'}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: () => void }) {
  return <View style={styles.switchRow}><Text style={styles.rowText}>{label}</Text><Switch value={value} onValueChange={onValueChange} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0e1015' },
  content: { padding: 18 },
  card: { marginBottom: 14, padding: 18, borderRadius: 24, backgroundColor: '#151821', gap: 12 },
  title: { color: '#f4f6fb', fontSize: 30, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#f4f6fb', fontSize: 22, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  muted: { color: '#9ba3b4' },
  input: { backgroundColor: '#0f121a', color: '#f4f6fb', padding: 14, borderRadius: 14, borderColor: 'rgba(255,255,255,.08)', borderWidth: 1 },
  button: { backgroundColor: '#7c5cff', padding: 15, borderRadius: 14, alignItems: 'center' },
  dangerButton: { backgroundColor: '#ff5c7a', padding: 15, borderRadius: 14, alignItems: 'center', margin: 12 },
  buttonText: { color: 'white', fontWeight: '800' },
  row: { backgroundColor: '#151821', padding: 16, borderRadius: 16, marginBottom: 10 },
  rowText: { color: '#f4f6fb', fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteBox: { gap: 10, marginBottom: 10 },
  voiceHeader: { padding: 16 },
  error: { color: '#ff5c7a' }
});
