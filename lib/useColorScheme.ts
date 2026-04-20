import { useColorScheme as useNativewindColorScheme } from 'nativewind'

export function useColorScheme () {
  const { colorScheme, setColorScheme, toggleColorScheme } =
    useNativewindColorScheme()
  const resolvedColorScheme = colorScheme ?? 'dark'
  return {
    colorScheme: resolvedColorScheme,
    isDarkColorScheme: resolvedColorScheme === 'dark',
    setColorScheme,
    toggleColorScheme
  }
}
