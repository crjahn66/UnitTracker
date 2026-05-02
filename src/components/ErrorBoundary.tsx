import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={s.container}>
        <Text style={s.title}>App crashed</Text>
        <Text style={s.name}>{error.name}: {error.message}</Text>
        <ScrollView style={s.scroll}>
          <Text style={s.stack}>{error.stack}</Text>
        </ScrollView>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117', padding: 20, paddingTop: 60 },
  title: { color: '#f85149', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  name: { color: '#ff9900', fontSize: 14, marginBottom: 12 },
  scroll: { flex: 1 },
  stack: { color: '#e6edf3', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 },
});
