import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';

interface Props { onLogin: () => void; }

export default function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    const u = username.trim();
    if (!u || !password) { setError('Please enter your username and password.'); return; }
    const email = u.includes('@') ? u : `${u}@red.group`;
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError('Invalid username or password.');
    } else {
      onLogin();
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <View style={s.logoRow}>
          <Ionicons name="flash" size={36} color="#58a6ff" />
        </View>
        <Text style={s.appName}>UnitTracker</Text>
        <Text style={s.subtitle}>Commissioning Management</Text>

        <View style={s.form}>
          <Text style={s.label}>Username</Text>
          <TextInput
            style={s.input}
            value={username}
            onChangeText={(v) => { setUsername(v); setError(null); }}
            placeholder="Enter username"
            placeholderTextColor="#6e7681"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[s.label, { marginTop: 14 }]}>Password</Text>
          <View style={s.passRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              placeholder="Enter password"
              placeholderTextColor="#6e7681"
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass((v) => !v)}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6e7681" />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={15} color="#f85149" style={{ marginRight: 6 }} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.loginBtn, loading && s.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#0d1117" size="small" />
              : <Text style={s.loginBtnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#161b22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#21262d',
    padding: 36,
    alignItems: 'center',
  },
  logoRow: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#58a6ff22',
    borderWidth: 1,
    borderColor: '#58a6ff44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appName: {
    color: '#e6edf3',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#6e7681',
    fontSize: 13,
    marginBottom: 32,
  },
  form: { width: '100%' },
  label: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 12,
    color: '#e6edf3',
    fontSize: 15,
    marginBottom: 4,
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eyeBtn: {
    padding: 12,
    marginLeft: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8514922',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f8514966',
    padding: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  errorText: { color: '#f85149', fontSize: 13, flex: 1 },
  loginBtn: {
    backgroundColor: '#58a6ff',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#0d1117', fontSize: 15, fontWeight: '700' },
});
