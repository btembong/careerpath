import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../src/store/auth';
import { colors } from '../src/lib/theme';

export default function Index() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
        <ActivityIndicator size="large" color={colors.azure} />
      </View>
    );
  }

  if (!user) return <Redirect href="/auth/login" />;

  const roleRoute: Record<string, string> = {
    STUDENT: '/(student)/dashboard',
    TEACHER: '/(teacher)/dashboard',
    ADMIN: '/(admin)/dashboard',
    COUNTRY_REP: '/(country-rep)/dashboard',
    SUBJECT_REVIEWER: '/(reviewer)/dashboard',
  };

  return <Redirect href={(roleRoute[user.role] ?? '/(student)/dashboard') as any} />;
}
