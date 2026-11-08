// Bottom tab navigator.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '@/theme';

function TabIcon({ emoji, focused, elevated = false }: { emoji: string; focused: boolean; elevated?: boolean }) {
  return (
    <View style={[styles.icon, elevated && styles.elevatedIcon, elevated && focused && styles.elevatedFocused]}>
      <Text style={{ fontSize: elevated ? 26 : 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  elevatedIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
  },
  elevatedFocused: { borderColor: colors.accent },
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: { backgroundColor: colors.bgAlt, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="squad"
        options={{
          title: 'My Squad',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏉" focused={focused} elevated />,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: 'Players',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="fixtures"
        options={{
          title: 'Fixtures',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: 'Leagues',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
