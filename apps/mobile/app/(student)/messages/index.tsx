import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '../../../src/lib/api';
import { colors } from '../../../src/lib/theme';

export default function MessagesScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: () => api.get('/messages/threads').then(r => r.data),
    refetchInterval: 10_000,
  });

  if (isLoading) return (
    <SafeAreaView style={s.root}>
      <ActivityIndicator style={{ marginTop: 60 }} color={colors.azure} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}><Text style={s.title}>Messages</Text></View>
      <FlatList
        data={data ?? []}
        keyExtractor={t => t.id}
        contentContainerStyle={{ padding: 0 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => router.push(`/(student)/messages/${item.id}`)}>
            <View style={s.avatar}><Text style={s.avatarText}>{(item.other.name ?? 'U')[0]}</Text></View>
            <View style={s.info}>
              <View style={s.nameRow}>
                <Text style={s.name}>{item.other.name}</Text>
                {item.unread && <View style={s.dot} />}
              </View>
              <Text style={s.preview} numberOfLines={1}>{item.lastMessage?.body ?? 'No messages yet'}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.empty}>No conversations yet.</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.white },
  header:  { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.cloud },
  title:   { fontSize: 22, fontWeight: '800', color: colors.navy },
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.cloud, gap: 14 },
  avatar:  { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cloud, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.royal },
  info:    { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name:    { fontSize: 14, fontWeight: '700', color: colors.navy },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.azure },
  preview: { fontSize: 13, color: colors.muted },
  empty:   { textAlign: 'center', color: colors.muted, marginTop: 60, fontSize: 14 },
});
