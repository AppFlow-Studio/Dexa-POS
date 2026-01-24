#!/bin/bash

# scripts/setup-emulator-bridge.sh
# 
# This script sets up the ADB port forwarding required for the CFD app (running in one emulator)
# to communicate with the POS app (running in another emulator).
#
# It scans attached emulators to find the one running the POS Server.
# It then maps Host:8081 -> POS_Emulator:8080.

echo "🔍 Scanning for POS Server..."

# Get list of attached devices/emulators
DEVICES=$(adb devices | grep "device$" | cut -f1)

if [ -z "$DEVICES" ]; then
    echo "❌ No emulators found. Please start your emulators first."
    exit 1
fi

FOUND=0

for DEVICE in $DEVICES; do
    echo "   Checking $DEVICE..."
    
    # Check logcat for the "[WS] Server started" message
    # We use -d (dump) so it doesn't block
    if adb -s $DEVICE logcat -d -v time '*:S' 'ReactNativeJS:V' 2>/dev/null | grep -q "\[WS\] Server started"; then
        echo "✅ Found POS Server on $DEVICE"
        
        echo "   Setting up port forwarding..."
        # Clear existing forwards to avoid conflicts if previously set
        adb -s $DEVICE forward --remove-all
        
        # Forward Host:8081 -> Device:8080
        adb -s $DEVICE forward tcp:8081 tcp:8080
        
        if [ $? -eq 0 ]; then
            echo "✅ Bridge successfully established!"
            echo "   CFD App will connect via 10.0.2.2:8081"
            echo "   (Make sure you restart the POS app to pick up the new pairing info)"
            FOUND=1
            break
        else
            echo "❌ Failed to set up forwarding."
        fi
    fi
done

if [ $FOUND -eq 0 ]; then
    echo "❌ Could not find POS Server running on any emulator."
    echo "   Please make sure the POS app is started and 'npm start' is running."
    echo "   Once started, run this script again."
    exit 1
fi
