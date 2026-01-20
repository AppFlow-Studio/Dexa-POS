import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useAuth, useUser } from '@clerk/clerk-expo'
import * as SecureStore from 'expo-secure-store'

/**
 * Clerk Configuration Verification Component
 * 
 * Use this to quickly check if your Clerk setup is correct
 * Place this component temporarily in your app to diagnose issues
 */
export function ClerkVerificationScreen() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth()
  const { user } = useUser()
  
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [details, setDetails] = useState<Record<string, string>>({})

  useEffect(() => {
    runChecks()
  }, [isLoaded, isSignedIn])

  const runChecks = async () => {
    const newChecks: Record<string, boolean> = {}
    const newDetails: Record<string, string> = {}

    // Check 1: Clerk loaded
    newChecks['clerk_loaded'] = isLoaded
    newDetails['clerk_loaded'] = isLoaded ? 'Clerk SDK is loaded' : 'Waiting for Clerk to load...'

    // Check 2: User signed in
    newChecks['signed_in'] = isSignedIn
    newDetails['signed_in'] = isSignedIn ? `Signed in as user: ${userId}` : 'Not signed in'

    // Check 3: User object available
    newChecks['user_object'] = !!user
    newDetails['user_object'] = user ? `Email: ${user.primaryEmailAddress?.emailAddress}` : 'No user object'

    // Check 4: Can get token
    if (isSignedIn) {
      try {
        const token = await getToken({ template: 'supabase' })
        newChecks['token_retrieval'] = !!token
        newDetails['token_retrieval'] = token 
          ? `Token length: ${token.length} chars` 
          : 'Token is null'
      } catch (error: any) {
        newChecks['token_retrieval'] = false
        newDetails['token_retrieval'] = `Error: ${error.message}`
      }
    } else {
      newChecks['token_retrieval'] = false
      newDetails['token_retrieval'] = 'Not signed in, cannot test token'
    }

    // Check 5: SecureStore working
    try {
      await SecureStore.setItemAsync('test_key', 'test_value')
      const retrieved = await SecureStore.getItemAsync('test_key')
      await SecureStore.deleteItemAsync('test_key')
      
      newChecks['secure_store'] = retrieved === 'test_value'
      newDetails['secure_store'] = retrieved === 'test_value' 
        ? 'SecureStore is working' 
        : 'SecureStore read/write failed'
    } catch (error: any) {
      newChecks['secure_store'] = false
      newDetails['secure_store'] = `Error: ${error.message}`
    }

    // Check 6: Environment variables
    const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    newChecks['env_vars'] = !!clerkKey && clerkKey.startsWith('pk_')
    newDetails['env_vars'] = clerkKey 
      ? `Key: ${clerkKey.substring(0, 20)}...` 
      : 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY not set'

    setChecks(newChecks)
    setDetails(newDetails)
  }

  const CheckItem = ({ 
    id, 
    label 
  }: { 
    id: string
    label: string 
  }) => {
    const passed = checks[id]
    const detail = details[id]
    
    return (
      <View style={{ 
        backgroundColor: passed ? '#10b98120' : '#ef444420',
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: passed ? '#10b981' : '#ef4444',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 20, marginRight: 8 }}>
            {passed ? '✅' : '❌'}
          </Text>
          <Text style={{ 
            color: '#fff', 
            fontWeight: 'bold',
            fontSize: 16,
          }}>
            {label}
          </Text>
        </View>
        <Text style={{ color: '#ccc', fontSize: 14, marginLeft: 28 }}>
          {detail}
        </Text>
      </View>
    )
  }

  const allPassed = Object.values(checks).every(check => check === true)

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#1a1a1a', padding: 20 }}>
      {/* Header */}
      <Text style={{ 
        color: '#fff', 
        fontSize: 28, 
        fontWeight: 'bold', 
        marginBottom: 8 
      }}>
        Clerk Configuration Check
      </Text>
      
      <Text style={{ color: '#999', fontSize: 14, marginBottom: 24 }}>
        Verifying your Clerk + Supabase setup
      </Text>

      {/* Overall Status */}
      <View style={{ 
        backgroundColor: allPassed ? '#10b981' : '#f59e0b',
        padding: 16,
        borderRadius: 8,
        marginBottom: 24,
      }}>
        <Text style={{ 
          color: '#fff', 
          fontWeight: 'bold',
          fontSize: 18,
          textAlign: 'center',
        }}>
          {allPassed 
            ? '✅ All Checks Passed!' 
            : '⚠️  Some Checks Failed'}
        </Text>
      </View>

      {/* Individual Checks */}
      <CheckItem 
        id="env_vars"
        label="Environment Variables" 
      />
      
      <CheckItem 
        id="clerk_loaded"
        label="Clerk SDK Loaded" 
      />
      
      <CheckItem 
        id="secure_store"
        label="SecureStore Working" 
      />
      
      <CheckItem 
        id="signed_in"
        label="User Signed In" 
      />
      
      <CheckItem 
        id="user_object"
        label="User Object Available" 
      />
      
      <CheckItem 
        id="token_retrieval"
        label="Can Generate Supabase Token" 
      />

      {/* Recheck Button */}
      <TouchableOpacity
        onPress={runChecks}
        style={{
          backgroundColor: '#3b82f6',
          padding: 16,
          borderRadius: 8,
          alignItems: 'center',
          marginTop: 12,
          marginBottom: 40,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>
          Recheck Configuration
        </Text>
      </TouchableOpacity>

      {/* Recommendations */}
      {!allPassed && (
        <View style={{ 
          backgroundColor: '#2a2a2a', 
          padding: 16, 
          borderRadius: 8,
          marginBottom: 40,
        }}>
          <Text style={{ 
            color: '#fff', 
            fontWeight: 'bold',
            fontSize: 16,
            marginBottom: 12,
          }}>
            Recommendations:
          </Text>

          {!checks['env_vars'] && (
            <Text style={{ color: '#ccc', marginBottom: 8 }}>
              • Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in .env
            </Text>
          )}

          {!checks['secure_store'] && (
            <Text style={{ color: '#ccc', marginBottom: 8 }}>
              • Install expo-secure-store: npx expo install expo-secure-store
            </Text>
          )}

          {!checks['clerk_loaded'] && (
            <Text style={{ color: '#ccc', marginBottom: 8 }}>
              • Ensure ClerkProvider wraps your app in _layout.tsx
            </Text>
          )}

          {!checks['signed_in'] && (
            <Text style={{ color: '#ccc', marginBottom: 8 }}>
              • Sign in to test full functionality
            </Text>
          )}

          {!checks['token_retrieval'] && checks['signed_in'] && (
            <Text style={{ color: '#ccc', marginBottom: 8 }}>
              • Create 'supabase' JWT template in Clerk Dashboard
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  )
}