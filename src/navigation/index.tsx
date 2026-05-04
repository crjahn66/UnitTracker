import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import UnitListScreen from '../screens/UnitListScreen';
import UnitDetailScreen from '../screens/UnitDetailScreen';
import ReportsScreen from '../screens/ReportsScreen';
import DashboardScreen from '../screens/DashboardScreen';
import SyncStatusBar from '../components/SyncStatusBar';
import { Side } from '../types';

export type UnitStackParamList = {
  UnitList: { side: Side };
  UnitDetail: { unitId: string };
};

export type RootTabParamList = {
  NorthTab: undefined;
  SouthTab: undefined;
  DashboardTab: undefined;
  Reports: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<UnitStackParamList>();

const HEADER_STYLE = {
  backgroundColor: '#0d1117',
} as const;

function UnitStack({ side, title }: { side: Side; title: string }) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: HEADER_STYLE,
        headerTintColor: '#e6edf3',
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => <SyncStatusBar />,
      }}
    >
      <Stack.Screen
        name="UnitList"
        component={UnitListScreen}
        initialParams={{ side }}
        options={{ title }}
      />
      <Stack.Screen
        name="UnitDetail"
        component={UnitDetailScreen}
        options={({ route }) => ({ title: `Unit ${route.params.unitId}` })}
      />
    </Stack.Navigator>
  );
}

function NorthStack() {
  return <UnitStack side="North" title="North Side — 26 Units" />;
}

function SouthStack() {
  return <UnitStack side="South" title="South Side — 25 Units" />;
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: { backgroundColor: '#0d1117', borderTopColor: '#21262d' },
          tabBarActiveTintColor: '#58a6ff',
          tabBarInactiveTintColor: '#6e7681',
          tabBarIcon: ({ focused, color, size }) => {
            const icons: Record<string, [string, string]> = {
              NorthTab:     ['arrow-up-circle',   'arrow-up-circle-outline'],
              SouthTab:     ['arrow-down-circle', 'arrow-down-circle-outline'],
              DashboardTab: ['grid',              'grid-outline'],
              Reports:      ['bar-chart',         'bar-chart-outline'],
            };
            const [active, inactive] = icons[route.name] ?? ['ellipse', 'ellipse-outline'];
            return (
              <Ionicons
                name={(focused ? active : inactive) as React.ComponentProps<typeof Ionicons>['name']}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen
          name="DashboardTab"
          component={DashboardScreen}
          options={{
            headerShown: true,
            tabBarLabel: 'Dashboard',
            headerStyle: HEADER_STYLE,
            headerTintColor: '#e6edf3',
            title: 'Dashboard',
            headerRight: () => <SyncStatusBar />,
          }}
        />
        <Tab.Screen name="NorthTab" component={NorthStack} options={{ tabBarLabel: 'North (26)' }} />
        <Tab.Screen name="SouthTab" component={SouthStack} options={{ tabBarLabel: 'South (25)' }} />
        <Tab.Screen
          name="Reports"
          component={ReportsScreen}
          options={{
            headerShown: true,
            tabBarLabel: 'Reports',
            headerStyle: HEADER_STYLE,
            headerTintColor: '#e6edf3',
            title: 'Reports & Export',
            headerRight: () => <SyncStatusBar />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
