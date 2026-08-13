import { NativeModules, Platform } from "react-native";

interface LockTaskNative {
  enterLockTask(): Promise<boolean>;
  exitLockTask(): Promise<boolean>;
  isLockTaskActive(): Promise<boolean>;
}

const { LockTaskModule } = NativeModules as {
  LockTaskModule?: LockTaskNative;
};

export async function enterLockTask(): Promise<boolean> {
  if (Platform.OS !== "android" || !LockTaskModule) return false;
  return LockTaskModule.enterLockTask();
}

export async function exitLockTask(): Promise<boolean> {
  if (Platform.OS !== "android" || !LockTaskModule) return false;
  return LockTaskModule.exitLockTask();
}

export async function isLockTaskActive(): Promise<boolean> {
  if (Platform.OS !== "android" || !LockTaskModule) return false;
  return LockTaskModule.isLockTaskActive();
}
