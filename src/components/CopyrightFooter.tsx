import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const YEAR = new Date().getFullYear();

export default function CopyrightFooter() {
  return (
    <View style={s.wrap}>
      <Text style={s.text}>© {YEAR} CustomIsTheName</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  text: {
    color: '#6e7681',
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
