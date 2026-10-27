import { ScrollView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/auth';
import { colors } from '../../src/lib/theme';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => api.get('/portals/student/dashboard').then(r => r.data),
  });

  return (
    <SafeAreaView style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.greeting}>Hello, {user?.name?.split(' ')[0] ?? 'there'} 👋</Text>
          <Text style={s.sub}>Ready to learn today?</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.azure} size="large" />
        ) : (
          <>
            <View style={s.statsRow}>
              <StatCard label="Packages" value={data?.activePackages ?? 0} />
              <StatCard label="Certificates" value={data?.certificates ?? 0} />
              <StatCard label="Wallet" value={`${data?.walletBalance ?? 0}`} />
            </View>

            {data?.upcomingClass && (
              <TouchableOpacity style={s.liveCard} onPress={() => router.push(`/(student)/live/${data.upcomingClass.id}`)}>
                <View style={s.liveBadge}><Text style={s.liveBadgeText}>LIVE</Text></View>
                <Text style={s.liveTitle}>{data.upcomingClass.title}</Text>
                <Text style={s.liveSub}>Tap to join</Text>
              </TouchableOpacity>
            )}

            <Text style={s.sectionTitle}>Continue Learning</Text>
            {(data?.recentCourses ?? []).map((c: any) => (
              <TouchableOpacity key={c.id} style={s.courseCard} onPress={() => router.push(`/(student)/courses/${c.id}`)}>
                <Text style={s.courseTitle}>{c.title}</Text>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${c.progress ?? 0}%` }]} />
                </View>
                <Text style={s.progressText}>{c.progress ?? 0}% complete</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.surface },
  header:     { padding: 20, paddingBottom: 8 },
  greeting:   { fontSize: 22, fontWeight: '800', color: colors.navy },
  sub:        { fontSize: 14, color: colors.muted, marginTop: 2 },
  statsRow:   { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 16 },
  stat:       { flex: 1, backgroundColor: colors.white, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.cloud },
  statValue:  { fontSize: 20, fontWeight: '800', color: colors.navy },
  statLabel:  { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: '600' },
  liveCard:   { margin: 20, backgroundColor: colors.azure, borderRadius: 16, padding: 18 },
  liveBadge:  { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  liveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  liveTitle:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  liveSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.navy, paddingHorizontal: 20, marginTop: 4, marginBottom: 10 },
  courseCard: { backgroundColor: colors.white, marginHorizontal: 20, marginBottom: 10, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.cloud },
  courseTitle: { fontSize: 14, fontWeight: '600', color: colors.navy, marginBottom: 10 },
  progressBar: { height: 6, backgroundColor: colors.cloud, borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: colors.azure, borderRadius: 3 },
  progressText: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
