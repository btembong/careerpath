import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '../../../src/lib/api';
import { colors } from '../../../src/lib/theme';

export default function CoursesScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => api.get('/portals/student/courses').then(r => r.data),
  });

  if (isLoading) return (
    <SafeAreaView style={s.root}>
      <ActivityIndicator style={{ marginTop: 60 }} color={colors.azure} size="large" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}><Text style={s.title}>My Courses</Text></View>
      <FlatList
        data={data ?? []}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => router.push(`/(student)/courses/${item.id}`)}>
            <Text style={s.courseTitle}>{item.title}</Text>
            <Text style={s.teacher}>{item.teacherName}</Text>
            <View style={s.progress}>
              <View style={[s.fill, { width: `${item.progress ?? 0}%` }]} />
            </View>
            <Text style={s.pct}>{item.progress ?? 0}%</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.empty}>No courses yet. Buy a package to get started.</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: colors.navy },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.cloud },
  courseTitle: { fontSize: 15, fontWeight: '700', color: colors.navy, marginBottom: 4 },
  teacher: { fontSize: 13, color: colors.muted, marginBottom: 12 },
  progress: { height: 6, backgroundColor: colors.cloud, borderRadius: 3 },
  fill: { height: 6, backgroundColor: colors.azure, borderRadius: 3 },
  pct: { fontSize: 12, color: colors.muted, marginTop: 4 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 14 },
});
