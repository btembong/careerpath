import { useState, useRef, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../src/lib/api';
import { useAuthStore } from '../../../src/store/auth';
import { colors } from '../../../src/lib/theme';

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { user } = useAuthStore();
  const [body, setBody] = useState('');
  const listRef = useRef<FlatList>(null);
  const qc = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', threadId],
    queryFn: () => api.get(`/messages/threads/${threadId}`).then(r => r.data),
    refetchInterval: 4_000,
  });

  const { mutate: send, isPending } = useMutation({
    mutationFn: (body: string) => api.post(`/messages/threads/${threadId}`, { body }),
    onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['messages', threadId] }); },
  });

  useEffect(() => { if (messages?.length) listRef.current?.scrollToEnd({ animated: true }); }, [messages?.length]);

  const sorted = [...(messages ?? [])].reverse();

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>←</Text></TouchableOpacity>
        <Text style={s.topTitle}>Conversation</Text>
      </View>
      {isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.azure} /> : (
        <FlatList ref={listRef} data={sorted} keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => {
            const own = item.senderId === user?.id;
            return (
              <View style={[s.bubble, own ? s.ownBubble : s.otherBubble]}>
                <Text style={[s.bubbleText, own && s.ownText]}>{item.body}</Text>
                {own && item.readAt && <Text style={s.read}>Read</Text>}
              </View>
            );
          }}
        />
      )}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.inputRow}>
          <TextInput style={s.input} placeholder="Message…" placeholderTextColor={colors.muted}
            value={body} onChangeText={setBody} multiline />
          <TouchableOpacity style={[s.sendBtn, !body.trim() && s.sendDisabled]}
            onPress={() => body.trim() && send(body.trim())} disabled={isPending || !body.trim()}>
            {isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendText}>↑</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.surface },
  topbar:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.cloud },
  back:       { fontSize: 20, color: colors.azure, fontWeight: '600' },
  topTitle:   { fontSize: 16, fontWeight: '700', color: colors.navy },
  bubble:     { maxWidth: '80%', padding: 12, borderRadius: 16 },
  ownBubble:  { backgroundColor: colors.azure, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  otherBubble:{ backgroundColor: colors.white, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.cloud },
  bubbleText: { fontSize: 14, color: colors.text },
  ownText:    { color: '#fff' },
  read:       { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2, alignSelf: 'flex-end' },
  inputRow:   { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.cloud },
  input:      { flex: 1, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: colors.text, maxHeight: 100 },
  sendBtn:    { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.azure, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: colors.cloud },
  sendText:   { color: '#fff', fontSize: 18, fontWeight: '700' },
});
