import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import { api } from '../../../src/lib/api';
import { colors } from '../../../src/lib/theme';

export default function CoursePlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeLesson, setActiveLesson] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => api.get(`/portals/student/courses/${id}`).then(r => r.data),
    onSuccess: (d) => { if (!activeLesson && d.modules?.[0]?.lessons?.[0]) setActiveLesson(d.modules[0].lessons[0]); },
  });

  if (isLoading) return (
    <SafeAreaView style={s.root}>
      <ActivityIndicator style={{ marginTop: 60 }} color={colors.azure} size="large" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>{data?.title}</Text>
      </View>

      {activeLesson?.videoUrl ? (
        <WebView source={{ uri: activeLesson.videoUrl }} style={s.video} allowsFullscreenVideo />
      ) : (
        <View style={[s.video, s.noVideo]}><Text style={s.noVideoText}>No video for this lesson</Text></View>
      )}

      <ScrollView style={s.sidebar}>
        {(data?.modules ?? []).map((mod: any) => (
          <View key={mod.id}>
            <Text style={s.modTitle}>{mod.title}</Text>
            {mod.lessons.map((lesson: any) => (
              <TouchableOpacity key={lesson.id} style={[s.lessonRow, activeLesson?.id === lesson.id && s.lessonActive]}
                onPress={() => setActiveLesson(lesson)}>
                <Text style={[s.lessonText, activeLesson?.id === lesson.id && s.lessonTextActive]}>
                  {lesson.completed ? '✓ ' : ''}{lesson.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.surface },
  topbar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.cloud },
  back:    { paddingHorizontal: 4 },
  backText:{ color: colors.azure, fontWeight: '600', fontSize: 14 },
  topTitle:{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.navy },
  video:   { height: 220, backgroundColor: '#000' },
  noVideo: { alignItems: 'center', justifyContent: 'center' },
  noVideoText: { color: '#fff', fontSize: 14 },
  sidebar: { flex: 1 },
  modTitle:{ fontSize: 13, fontWeight: '700', color: colors.muted, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface, textTransform: 'uppercase', letterSpacing: 0.5 },
  lessonRow:{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.cloud, backgroundColor: colors.white },
  lessonActive: { backgroundColor: colors.cloud },
  lessonText: { fontSize: 14, color: colors.text },
  lessonTextActive: { color: colors.azure, fontWeight: '600' },
});
