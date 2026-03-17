import { colors } from "@/lib/theme";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, ChevronRight, CreditCard, Keyboard } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.screen },
  header: { alignItems: "center", paddingVertical: 24 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: `${colors.teal}15`,
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.heading, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.muted, textAlign: "center", paddingHorizontal: 32 },
  list: { gap: 12, paddingHorizontal: 16 },
  card: {
    flexDirection: "row", alignItems: "center", padding: 18,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  iconBox: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 2 },
  cardDesc: { fontSize: 12, color: colors.muted },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: colors.screen, paddingTop: 12, paddingBottom: 32,
    paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border,
  },
  backBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, backgroundColor: colors.panel,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 8,
  },
});

const CardPaymentOptions = () => {
  const setView = usePaymentStore((s) => s.setView);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <CreditCard size={30} color={colors.teal} />
          </View>
          <Text style={styles.title}>Card Payment</Text>
          <Text style={styles.subtitle}>Select how you want to process the card transaction.</Text>
        </View>

        <View style={styles.list}>
          <TouchableOpacity onPress={() => setView("card")} activeOpacity={0.8} style={styles.card}>
            <View style={[styles.iconBox, { backgroundColor: `${colors.teal}15` }]}>
              <CreditCard size={24} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Use Card Reader</Text>
              <Text style={styles.cardDesc}>Tap, insert, or swipe on terminal</Text>
            </View>
            <ChevronRight size={20} color={colors.muted} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setView("manual")} activeOpacity={0.8} style={styles.card}>
            <View style={[styles.iconBox, { backgroundColor: "rgba(168,85,247,0.12)" }]}>
              <Keyboard size={24} color="#A855F7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Manual Entry</Text>
              <Text style={styles.cardDesc}>Type card number manually</Text>
            </View>
            <ChevronRight size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setView("payment-method-selection")}>
          <ArrowLeft size={18} color={colors.muted} />
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 15 }}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CardPaymentOptions;
