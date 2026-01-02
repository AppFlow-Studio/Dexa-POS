import { getSecureString, setSecureString } from '@/lib/storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'dexa-pos-device-id';

/**
 * Gets or generates a persistent device ID for this device.
 * The ID is stored in encrypted MMKV storage and persists across app restarts.
 * Uses synchronous MMKV for instant access.
 */
export function getDeviceId(): string {
    try {
        // Try to get existing device ID (synchronous)
        const existingId = getSecureString(DEVICE_ID_KEY);
        if (existingId) {
            return existingId;
        }

        // Generate new device ID if none exists
        const newId = uuidv4();
        setSecureString(DEVICE_ID_KEY, newId);
        return newId;
    } catch (error) {
        console.error('Error getting device ID:', error);
        // Fallback to a new UUID if storage fails
        return uuidv4();
    }
}
