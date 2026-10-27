import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/lib/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IoniconsName; focused: boolean }) {
  return <Ionicons name={focused ? name : `${name}-outline` as IoniconsName} size={22} color={focused ? colors.azure : colors.muted} />;
}

export default function StudentLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.azure,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.cloud, height: Platform.OS === 'ios' ? 84 : 60 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: Platform.OS === 'ios' ? 0 : 4 },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} /> }} />
      <Tabs.Screen name="courses/index" options={{ title: 'Courses', tabBarIcon: ({ focused }) => <TabIcon name="book" focused={focused} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ focused }) => <TabIcon name="search" focused={focused} /> }} />
      <Tabs.Screen name="messages/index" options={{ title: 'Messages', tabBarIcon: ({ focused }) => <TabIcon name="chatbubble" focused={focused} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ focused }) => <TabIcon name="grid" focused={focused} /> }} />
    </Tabs>
  );
}
