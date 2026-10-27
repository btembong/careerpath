import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '../../../src/lib/api';
import { colors } from '../../../src/lib/theme';

export default function FlashcardsListScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['flashcard-decks'],
    queryFn: () => api.get('/flashcards/decks').then(r => r.data),
  });

  if (isLoading) return (
    <SafeAreaView style={s.root}><ActivityIndicator style={{ marginTop: 60 }} color={colors.azure} /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>Flashcard Decks</Text>
      </View>
      <FlatList
        data={data ?? []}
        keyExtractor={d => d.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => router.push(`/(student)/flashcards/${item.id}`)}>
            <Text style={s.deckTitle}>{item.title}</Text>
            <Text style={s.deckSub}>{item.cardCount} cards · {item.course?.title}</Text>
            {item.aiGenerated && <View style={s.aiBadge}><Text style={s.aiText}>AI Generated</Text></View>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.empty}>No flashcard decks yet.</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: colors.surface },
  header:   { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 4 },
  back:     { color: colors.azure, fontWeight: '600', fontSize: 14 },
  title:    { fontSize: 22, fontWeight: '800', color: colors.navy },
  card:     { backgroundColor: colors.white, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.cloud },
  deckTitle:{ fontSize: 15, fontWeight: '700', color: colors.navy },
  deckSub:  { fontSize: 13, color: colors.muted, marginTop: 4 },
  aiBadge:  { marginTop: 8, alignSelf: 'flex-start', backgroundColor: colors.cloud, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  aiText:   { fontSize: 11, fontWeight: '600', color: colors.azure },
  empty:    { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 14 },
});
