/**
 * Event Tracer - Debug Panel (Phase 4.4)
 *
 * Visual debug panel showing recent event bus activity.
 * Only displays in development mode.
 *
 * Usage:
 *   Import and add to your main layout or dev tools panel:
 *   <EventTracer />
 *
 * Features:
 * - Shows last 10 events
 * - Displays event names, payloads, and timestamps
 * - Auto-refreshes every second
 * - Only visible in development mode
 */

import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { eventBus } from "@/lib/eventBus";

export function EventTracer() {
  const [events, setEvents] = useState(() => eventBus.getHistory());
  const [subscriptions, setSubscriptions] = useState(() =>
    eventBus.getActiveSubscriptions()
  );

  useEffect(() => {
    // Refresh event history every second
    const interval = setInterval(() => {
      setEvents(eventBus.getHistory());
      setSubscriptions(eventBus.getActiveSubscriptions());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Only show in development
  if (process.env.NODE_ENV !== "development" && !__DEV__) {
    return null;
  }

  const recentEvents = events.slice(-10).reverse();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          🔊 Event Bus Trace (Last {recentEvents.length})
        </Text>
      </View>

      {/* Subscriptions Summary */}
      <View style={styles.subscriptionsSection}>
        <Text style={styles.sectionTitle}>
          Active Subscriptions ({subscriptions.length})
        </Text>
        {subscriptions.map((sub, i) => (
          <Text key={i} style={styles.subscriptionText}>
            • {sub.event}: {sub.count} subscriber{sub.count !== 1 ? "s" : ""}
          </Text>
        ))}
      </View>

      {/* Recent Events */}
      <ScrollView style={styles.eventsScroll}>
        {recentEvents.length === 0 && (
          <Text style={styles.noEventsText}>No events yet...</Text>
        )}

        {recentEvents.map((e, i) => (
          <View key={i} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <Text style={styles.eventName}>{e.event}</Text>
              <Text style={styles.eventTime}>
                {new Date(e.timestamp).toLocaleTimeString()}
              </Text>
            </View>
            <Text style={styles.eventPayload}>
              {JSON.stringify(e.payload, null, 2)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    maxHeight: 400,
    width: 400,
    borderTopWidth: 2,
    borderTopColor: "#00ff00",
    zIndex: 9999,
  },
  header: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerText: {
    color: "#00ff00",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  subscriptionsSection: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  sectionTitle: {
    color: "#00ffff",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 5,
    fontFamily: "monospace",
  },
  subscriptionText: {
    color: "#aaa",
    fontSize: 10,
    fontFamily: "monospace",
  },
  eventsScroll: {
    flex: 1,
  },
  noEventsText: {
    color: "#666",
    fontSize: 11,
    fontFamily: "monospace",
    padding: 10,
  },
  eventCard: {
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    padding: 10,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  eventName: {
    color: "#00ffff",
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  eventTime: {
    color: "#888",
    fontSize: 10,
    fontFamily: "monospace",
  },
  eventPayload: {
    color: "#aaa",
    fontSize: 10,
    fontFamily: "monospace",
  },
});
