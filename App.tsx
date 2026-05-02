import './src/errorInit';
import React from 'react';
import { Platform, View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import ErrorBoundary from './src/components/ErrorBoundary';

export default function App() {
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: '#c00', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 24 }}>REACT IS ALIVE</Text>
      </View>
    );
  }
  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Navigation />
    </ErrorBoundary>
  );
}
