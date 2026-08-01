import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useSignIn, useAuth } from '@clerk/clerk-expo'
import * as SecureStore from 'expo-secure-store'

/**
 * INTENSIVE DEBUGGING FOR CLERK SIGN-IN
 * 
 * Add this to your sign-in screen to see exactly what's failing
 */

export function useClerkDebugger() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const { isSignedIn, sessionId, userId, getToken } = useAuth()

  // Log everything on mount
  useEffect(() => {
    debugClerkState()
  }, [isLoaded, isSignedIn])

  const debugClerkState = async () => {
    console.log('\n🔍 ========== CLERK STATE DEBUG ==========')
    console.log('Time:', new Date().toISOString())
    
    // Basic state
    console.log('\n📊 Basic State:')
    console.log('  isLoaded:', isLoaded)
    console.log('  isSignedIn:', isSignedIn)
    console.log('  sessionId:', sessionId)
    console.log('  userId:', userId)
    
    // Environment
    console.log('\n🔧 Environment:')
    console.log('  CLERK_KEY:', process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.substring(0, 20) + '...')
    console.log('  Platform:', Platform.OS)
    
    // SecureStore test
    console.log('\n💾 SecureStore Test:')
    try {
      await SecureStore.setItemAsync('test_clerk_debug', 'test_value')
      const retrieved = await SecureStore.getItemAsync('test_clerk_debug')
      await SecureStore.deleteItemAsync('test_clerk_debug')
      console.log('  SecureStore:', retrieved === 'test_value' ? '✅ Working' : '❌ Failed')
    } catch (error) {
      console.log('  SecureStore:', '❌ Error:', error)
    }
    
    // Check stored tokens
    console.log('\n🔑 Stored Tokens:')
    try {
      const keys = ['__clerk_client_jwt', '__clerk_session_token', '__clerk_db_jwt']
      for (const key of keys) {
        const value = await SecureStore.getItemAsync(key)
        console.log(`  ${key}:`, value ? '✅ Present' : '❌ Missing')
      }
    } catch (error) {
      console.log('  Error checking tokens:', error)
    }
    
    // Token generation test
    if (isSignedIn) {
      console.log('\n🎫 Token Generation Test:')
      try {
        const token = await getToken({ template: 'supabase' })
        console.log('  Can get token:', token ? '✅ Yes' : '❌ No')
        if (token) {
          console.log('  Token length:', token.length)
        }
      } catch (error: any) {
        console.log('  Token error:', error.message)
      }
    }
    
    console.log('\n🔍 ========== END DEBUG ==========\n')
  }

  const debugSignIn = async (email: string, password: string) => {
    console.log('\n🔐 ========== SIGN-IN ATTEMPT DEBUG ==========')
    console.log('Starting sign-in at:', new Date().toISOString())
    
    try {
      // Step 1: Pre-flight checks
      console.log('\n✈️ Step 1: Pre-flight Checks')
      console.log('  isLoaded:', isLoaded)
      if (!isLoaded) {
        throw new Error('Clerk not loaded yet')
      }
      console.log('  ✅ Clerk is loaded')
      
      console.log('  Email:', email)
      console.log('  Password length:', password.length)
      
      // Step 2: Create sign-in
      console.log('\n📝 Step 2: Creating Sign-In Attempt')
      const startTime = Date.now()
      
      const result = await signIn.create({
        identifier: email,
        password: password,
      })
      
      const duration = Date.now() - startTime
      console.log('  ✅ Sign-in created in', duration, 'ms')
      console.log('  Status:', result.status)
      console.log('  Session ID:', result.createdSessionId)

      // Step 3: Check result details
      console.log('\n🔍 Step 3: Result Analysis')
      console.log('  First factor:', JSON.stringify(result.firstFactorVerification, null, 2))
      console.log('  Second factor:', JSON.stringify(result.secondFactorVerification, null, 2))
      
      // Step 4: Activate session
      if (result.status === 'complete') {
        console.log('\n✅ Step 4: Sign-In Complete - Activating Session')
        
        if (!result.createdSessionId) {
          throw new Error('No session ID created')
        }
        
        console.log('  Calling setActive with session:', result.createdSessionId)
        const activateStart = Date.now()
        
        await setActive({ session: result.createdSessionId })
        
        const activateDuration = Date.now() - activateStart
        console.log('  ✅ setActive completed in', activateDuration, 'ms')
        
        // Step 5: Verify activation
        console.log('\n🔍 Step 5: Verifying Session Activation')
        
        // Wait a bit for state to update
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Check if actually signed in
        console.log('  Checking auth state after setActive...')
        console.log('  useAuth().isSignedIn:', isSignedIn)
        console.log('  useAuth().sessionId:', sessionId)
        console.log('  useAuth().userId:', userId)
        
        // Try to get a token
        try {
          const token = await getToken({ template: 'supabase' })
          console.log('  Can get Supabase token:', !!token)
          if (token) {
            console.log('  Token length:', token.length)
            console.log('  ✅✅✅ SIGN-IN SUCCESSFUL!')
          } else {
            console.log('  ⚠️ Token is null - session might not be active')
          }
        } catch (tokenError: any) {
          console.log('  ❌ Token generation failed:', tokenError.message)
        }
        
      } else {
        console.log('\n⚠️ Sign-In Not Complete')
        console.log('  Status:', result.status)
        console.log('  This might require additional verification')
        console.log('  Check result.missingRequirements above')
      }
      
      console.log('\n🔐 ========== END SIGN-IN DEBUG ==========\n')
      return result
      
    } catch (error: any) {
      console.log('\n❌ ========== SIGN-IN ERROR ==========')
      console.log('Error type:', error.constructor.name)
      console.log('Error message:', error.message)
      
      if (error.errors && Array.isArray(error.errors)) {
        console.log('\nClerk Errors:')
        error.errors.forEach((err: any, index: number) => {
          console.log(`  Error ${index + 1}:`)
          console.log('    Code:', err.code)
          console.log('    Message:', err.message)
          console.log('    Long message:', err.long_message)
          console.log('    Meta:', JSON.stringify(err.meta, null, 2))
        })
      }
      
      console.log('\nFull error:', JSON.stringify(error, null, 2))
      console.log('\n❌ ========== END ERROR DEBUG ==========\n')
      throw error
    }
  }

  return {
    debugClerkState,
    debugSignIn,
  }
}

/**
 * EXAMPLE USAGE IN YOUR SIGN-IN SCREEN:
 */

/*
import { useClerkDebugger } from './debug-clerk-signin'

export function SignInScreen() {
  const { debugSignIn, debugClerkState } = useClerkDebugger()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  // Debug state on mount
  useEffect(() => {
    debugClerkState()
  }, [])
  
  const handleSignIn = async () => {
    try {
      const result = await debugSignIn(email, password)
      
      if (result.status === 'complete') {
        // Navigate
        router.replace('/(tabs)')
      }
    } catch (error) {
      Alert.alert('Error', error.message)
    }
  }
  
  return (
    // Your UI here
  )
}
*/