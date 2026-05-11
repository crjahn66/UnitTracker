import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as Application from 'expo-application';

const YEAR = new Date().getFullYear();
const VERSION = Platform.OS === 'web'
  ? (require('../../app.json').expo.version as string)
  : (Application.nativeApplicationVersion ?? '');

export default function CopyrightFooter() {
  return (
    <View style={s.wrap}>
      <Text style={s.text}>© {YEAR} CustomIsTheName</Text>
      {!!VERSION && <Text style={s.version}>v{VERSION}</Text>}
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
  version: {
    color: '#484f58',
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
