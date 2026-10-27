import { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api } from '../../src/lib/api';
import { colors } from '../../src/lib/theme';

export default function SearchScreen() {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'courses' | 'teachers'>('courses');
  const [results, setResults] = useState<{ courses: any[]; teachers: any[] }>({ courses: [], teachers: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults({ courses: [], teachers: [] }); return; }
      setLoading(true);
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(q)}`);
        setResults(data);
      } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const list = tab === 'courses' ? results.courses : results.teachers;

  return (
    <SafeAreaView style={s.root}>
      <View style={s.searchBar}>
        <TextInput style={s.input} placeholder="Search courses and teachers…"
          placeholderTextColor={colors.muted} value={q} onChangeText={setQ} autoFocus />
      </View>
      <View style={s.tabs}>
        {(['courses', 'teachers'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.azure} /> : (
        <FlatList data={list} keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => tab === 'courses' ? (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/(student)/courses/${item.id}`)}>
              <Text style={s.cardTitle}>{item.title}</Text>
              <Text style={s.cardSub}>{item.teacherName} · {item.subject}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/(student)/teachers/${item.id}`)}>
              <Text style={s.cardTitle}>{item.name}</Text>
              <Text style={s.cardSub}>{item.subjects?.join(', ')} · ⭐ {item.avgRating ?? 'New'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={q.trim() ? <Text style={s.empty}>No {tab} found.</Text> : <Text style={s.empty}>Type to search…</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.surface },
  searchBar:  { margin: 16, marginBottom: 0 },
  input:      { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.cloud, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.text },
  tabs:       { flexDirection: 'row', margin: 16, marginBottom: 0, gap: 8 },
  tab:        { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cloud, alignItems: 'center' },
  tabActive:  { backgroundColor: colors.azure, borderColor: colors.azure },
  tabText:    { fontSize: 13, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: '#fff' },
  card:       { backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.cloud },
  cardTitle:  { fontSize: 14, fontWeight: '700', color: colors.navy },
  cardSub:    { fontSize: 13, color: colors.muted, marginTop: 4 },
  empty:      { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 14 },
});
