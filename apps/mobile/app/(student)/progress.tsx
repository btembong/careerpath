import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { api } from '../../src/lib/api';
import { colors } from '../../src/lib/theme';

const BADGE_LABEL: Record<string, string> = {
  FIRST_LESSON: 'First Lesson', FIRST_COURSE_COMPLETE: 'Course Complete', STREAK_7: '7-Day Streak',
  STREAK_30: '30-Day Streak', QUIZ_PERFECT: 'Perfect Quiz', TOP_OF_COHORT: 'Top of Cohort',
  FORUM_HELPER: 'Forum Helper', FAST_LEARNER: 'Fast Learner', CERTIFICATE_FIRST: 'First Certificate',
  PEER_REVIEWER: 'Peer Reviewer',
};

export default function ProgressScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['student-progress'],
    queryFn: () => api.get('/gamification/me').then(r => r.data),
  });

  if (isLoading) return <SafeAreaView style={s.root}><ActivityIndicator style={{ marginTop: 60 }} color={colors.azure} /></SafeAreaView>;

  const xpPct = Math.min(((data?.xpTotal ?? 0) % 1000) / 10, 100);

  return (
    <SafeAreaView style={s.root}>
      <ScrollView>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
          <Text style={s.title}>My Progress</Text>
        </View>

        <View style={s.xpCard}>
          <Text style={s.xpLabel}>Total XP</Text>
          <Text style={s.xpValue}>{data?.xpTotal ?? 0}</Text>
          <View style={s.xpBar}><View style={[s.xpFill, { width: `${xpPct}%` }]} /></View>
          <Text style={s.xpSub}>{1000 - ((data?.xpTotal ?? 0) % 1000)} XP to next level</Text>
          <View style={s.streakRow}>
            <Text style={s.streakIcon}>🔥</Text>
            <Text style={s.streakText}>{data?.streak ?? 0} day streak</Text>
          </View>
        </View>

        <Text style={s.section}>Badges</Text>
        <View style={s.badgeGrid}>
          {(data?.badges ?? []).map((b: any) => (
            <View key={b.badge} style={s.badge}>
              <Text style={s.badgeIcon}>🏅</Text>
              <Text style={s.badgeLabel}>{BADGE_LABEL[b.badge] ?? b.badge}</Text>
            </View>
          ))}
          {(!data?.badges?.length) && <Text style={s.empty}>No badges yet. Keep learning!</Text>}
        </View>

        <Text style={s.section}>Course Progress</Text>
        {(data?.courses ?? []).map((c: any) => (
          <View key={c.id} style={s.courseRow}>
            <Text style={s.courseName}>{c.title}</Text>
            <View style={s.bar}><View style={[s.fill, { width: `${c.progress}%` }]} /></View>
            <Text style={s.pct}>{c.progress}%</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.surface },
  header:     { padding: 20, paddingBottom: 8 },
  back:       { color: colors.azure, fontWeight: '600', fontSize: 14, marginBottom: 8 },
  title:      { fontSize: 22, fontWeight: '800', color: colors.navy },
  xpCard:     { margin: 16, backgroundColor: colors.white, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.cloud },
  xpLabel:    { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  xpValue:    { fontSize: 36, fontWeight: '900', color: colors.navy, marginTop: 4 },
  xpBar:      { height: 8, backgroundColor: colors.cloud, borderRadius: 4, marginTop: 12 },
  xpFill:     { height: 8, backgroundColor: colors.azure, borderRadius: 4 },
  xpSub:      { fontSize: 12, color: colors.muted, marginTop: 6 },
  streakRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  streakIcon: { fontSize: 20 },
  streakText: { fontSize: 14, fontWeight: '700', color: colors.navy },
  section:    { fontSize: 16, fontWeight: '700', color: colors.navy, paddingHorizontal: 20, marginTop: 8, marginBottom: 12 },
  badgeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  badge:      { backgroundColor: colors.white, borderRadius: 14, padding: 14, alignItems: 'center', width: '47%', borderWidth: 1, borderColor: colors.cloud },
  badgeIcon:  { fontSize: 28, marginBottom: 6 },
  badgeLabel: { fontSize: 12, fontWeight: '600', color: colors.navy, textAlign: 'center' },
  courseRow:  { marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.cloud },
  courseName: { fontSize: 14, fontWeight: '600', color: colors.navy, marginBottom: 8 },
  bar:        { height: 6, backgroundColor: colors.cloud, borderRadius: 3 },
  fill:       { height: 6, backgroundColor: colors.azure, borderRadius: 3 },
  pct:        { fontSize: 12, color: colors.muted, marginTop: 4 },
  empty:      { color: colors.muted, fontSize: 13, paddingHorizontal: 4 },
});
