import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth';
import { colors } from '../../src/lib/theme';

const MENU = [
  { label: 'Live Classes', route: '/(student)/live/index' },
  { label: 'Assignments', route: '/(student)/assignments' },
  { label: 'Certificates', route: '/(student)/certificates' },
  { label: 'Flashcards', route: '/(student)/flashcards/index' },
  { label: 'My Progress', route: '/(student)/progress' },
  { label: 'Mentorship', route: '/(student)/mentorship' },
  { label: 'Billing', route: '/(student)/billing' },
  { label: 'Notifications', route: '/(student)/notifications' },
  { label: 'Support', route: '/(student)/support' },
  { label: 'Settings', route: '/settings' },
];

export default function MoreScreen() {
  const { user, logout } = useAuthStore();

  return (
    <SafeAreaView style={s.root}>
      <ScrollView>
        <View style={s.profile}>
          <View style={s.avatar}><Text style={s.avatarText}>{(user?.name ?? 'U')[0]}</Text></View>
          <View>
            <Text style={s.name}>{user?.name ?? user?.email}</Text>
            <Text style={s.role}>Student</Text>
          </View>
        </View>
        {MENU.map(item => (
          <TouchableOpacity key={item.label} style={s.row} onPress={() => router.push(item.route as any)}>
            <Text style={s.rowLabel}>{item.label}</Text>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.logout} onPress={() => { logout(); router.replace('/auth/login'); }}>
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.surface },
  profile:    { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.cloud, marginBottom: 8 },
  avatar:     { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.cloud, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.royal },
  name:       { fontSize: 16, fontWeight: '700', color: colors.navy },
  role:       { fontSize: 13, color: colors.muted },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.cloud },
  rowLabel:   { fontSize: 15, color: colors.text },
  arrow:      { fontSize: 18, color: colors.muted },
  logout:     { margin: 20, padding: 16, backgroundColor: '#fee2e2', borderRadius: 14, alignItems: 'center' },
  logoutText: { color: colors.red, fontWeight: '700', fontSize: 15 },
});
