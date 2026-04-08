import { colors } from "@/lib/theme";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, ChevronRight, CreditCard, Keyboard } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.screen },
  header: { alignItems: "center", paddingVertical: 16 },
  iconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: `${colors.teal}15`,
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 3 },
  subtitle: { fontSize: 12, color: colors.muted, textAlign: "center", paddingHorizontal: 24 },
  list: { gap: 8, paddingHorizontal: 16 },
  card: {
    flexDirection: "row", alignItems: "center", padding: 14,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  iconBox: {
    width: 38, height: 38, borderRadius: 9,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.heading, marginBottom: 2 },
  cardDesc: { fontSize: 12, color: colors.muted },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: colors.screen, paddingTop: 10, paddingBottom: 24,
    paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border,
  },
  backBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, backgroundColor: colors.panel,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border, gap: 6,
  },
});

const CardPaymentOptions = () => {
  const setView = usePaymentStore((s) => s.setView);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <CreditCard size={22} color={colors.teal} />
          </View>
          <Text style={styles.title}>Card Payment</Text>
          <Text style={styles.subtitle}>Select how you want to process the card transaction.</Text>
        </View>

        <View style={styles.list}>
          <TouchableOpacity onPress={() => setView("card")} activeOpacity={0.8} style={styles.card}>
            <View style={[styles.iconBox, { backgroundColor: `${colors.teal}15` }]}>
              <CreditCard size={18} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Use Card Reader</Text>
              <Text style={styles.cardDesc}>Tap, insert, or swipe on terminal</Text>
            </View>
            <ChevronRight size={16} color={colors.muted} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setView("manual")} activeOpacity={0.8} style={styles.card}>
            <View style={[styles.iconBox, { backgroundColor: "rgba(168,85,247,0.12)" }]}>
              <Keyboard size={18} color="#A855F7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Manual Entry</Text>
              <Text style={styles.cardDesc}>Type card number manually</Text>
            </View>
            <ChevronRight size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView("payment-method-selection")}>
          <ArrowLeft size={18} color={colors.muted} />
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 13 }}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CardPaymentOptions;
