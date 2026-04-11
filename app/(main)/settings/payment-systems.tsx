import { Switch } from "@/components/ui/switch";
import { colors } from "@/lib/theme";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import {
  Check,
  ChevronDown,
  ChevronUp,
  DollarSign,
  MessageSquare,
  Send,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PaymentSystemsScreen = () => {
  const dualPricingEnabled = useLocationConfigStore(s => s.config.payment.dualPricingEnabled);
  const dualPricingCashDiscountPercent = useLocationConfigStore(s => s.config.payment.dualPricingCashDiscountPercent);
  const textToPayEnabled = useLocationConfigStore(s => s.config.payment.textToPayEnabled);
  const updateConfig = useLocationConfigStore(s => s.updateConfig);

  // Local state for the discount text input (allows partial edits like "4.")
  const [discountText, setDiscountText] = useState(dualPricingCashDiscountPercent.toString());

  // Local UI state
  const [textToPayTestSent, setTextToPayTestSent] = useState(false);
  const [calculatorAmount, setCalculatorAmount] = useState("100");

  const [expandedSections, setExpandedSections] = useState({
    dual: true,
    surcharge: false,
    funding: false,
    token: false,
    text: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const stateCompliance: Record<string, boolean> = {
    California: true,
    "New York": true,
    Texas: true,
    Florida: true,
    Colorado: false,
    Connecticut: false,
    Kansas: false,
    Maine: false,
    Massachusetts: false,
    Oklahoma: false,
  };

  // ---- Section rendering ----

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 14,
        backgroundColor: colors.panel,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 32, height: 32, backgroundColor: colors.teal + "15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
          {icon}
        </View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>{title}</Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={16} color={colors.label} />
      ) : (
        <ChevronDown size={16} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  const cardTotal =
    parseFloat(calculatorAmount || "0") *
    (1 + dualPricingCashDiscountPercent / 100);

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: 14, paddingVertical: 10 }}>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}>Payment & Pricing</Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>
          Dual pricing, surcharging, funding options, and text-to-pay.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* DUAL PRICING */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Dual Pricing (Cash Discount)",
            <DollarSign size={20} color={colors.teal} />,
            "dual"
          )}
          {expandedSections.dual && (
            <View style={{ paddingHorizontal: 20, paddingVertical: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={{ color: colors.heading, fontWeight: "500" }}>Enable Dual Pricing</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>Show separate cash & card prices</Text>
                </View>
                <Switch
                  checked={dualPricingEnabled}
                  onCheckedChange={(v) => updateConfig('payment', { dualPricingEnabled: v })}
                />
              </View>

              {dualPricingEnabled && (
                <>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 8 }}>Cash Discount Percentage</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <TextInput
                        value={discountText}
                        onChangeText={(v) => {
                          setDiscountText(v);
                          const parsed = parseFloat(v);
                          if (!isNaN(parsed)) updateConfig('payment', { dualPricingCashDiscountPercent: parsed });
                        }}
                        keyboardType="decimal-pad"
                        placeholder="4.0"
                        placeholderTextColor={colors.muted}
                        style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.heading, fontSize: 16, fontWeight: "bold", width: 80, textAlign: "center" }}
                      />
                      <Text style={{ color: colors.heading, fontSize: 16 }}>%</Text>
                    </View>
                  </View>

                  {/* Price calculator */}
                  <View style={{ backgroundColor: colors.screen, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 8 }}>Price Calculator</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <Text style={{ color: colors.muted, fontSize: 13 }}>Cash price: $</Text>
                      <TextInput
                        value={calculatorAmount}
                        onChangeText={setCalculatorAmount}
                        keyboardType="decimal-pad"
                        style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: colors.heading, fontSize: 13, width: 80, textAlign: "center" }}
                      />
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.muted, fontSize: 13 }}>Card price:</Text>
                      <Text style={{ color: colors.heading, fontSize: 16, fontWeight: "bold" }}>${cardTotal.toFixed(2)}</Text>
                    </View>
                  </View>

                  {/* State compliance */}
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 8 }}>Surcharging Compliance by State</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {Object.entries(stateCompliance).map(([state, allowed]) => (
                        <View key={state} style={{
                          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
                          backgroundColor: allowed ? colors.success + "20" : colors.danger + "20",
                          borderWidth: 1, borderColor: allowed ? colors.success + "40" : colors.danger + "40",
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: "500", color: allowed ? colors.success : colors.danger }}>
                            {state}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* TEXT-TO-PAY */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Text-to-Pay",
            <MessageSquare size={20} color={colors.teal} />,
            "text"
          )}
          {expandedSections.text && (
            <View style={{ paddingHorizontal: 20, paddingVertical: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={{ color: colors.heading, fontWeight: "500" }}>
                    Enable SMS Payment Links
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    Send payment links via text
                  </Text>
                </View>
                <Switch
                  checked={textToPayEnabled}
                  onCheckedChange={(v) => updateConfig('payment', { textToPayEnabled: v })}
                />
              </View>

              {textToPayEnabled && (
                <>
                  <View style={{ backgroundColor: colors.screen, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 8 }}>
                      SMS Preview
                    </Text>
                    <View style={{ backgroundColor: colors.panel, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8 }}>
                      <Text style={{ color: colors.heading, fontSize: 13 }}>
                        "Hi [Name], your order at Dexa POS is ready! Pay
                        securely here: https://pay.dexa.app/abc123"
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => setTextToPayTestSent(true)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, marginBottom: 12, backgroundColor: textToPayTestSent ? colors.success + "20" : colors.teal + "20", borderColor: textToPayTestSent ? colors.success + "50" : colors.teal + "50" }}
                  >
                    {textToPayTestSent ? (
                      <>
                        <Check size={14} color={colors.success} />
                        <Text style={{ color: colors.success, fontWeight: "600", fontSize: 12, marginLeft: 6 }}>
                          Test Sent Successfully!
                        </Text>
                      </>
                    ) : (
                      <>
                        <Send size={14} color={colors.teal} />
                        <Text style={{ color: colors.teal, fontWeight: "600", fontSize: 12, marginLeft: 6 }}>
                          Send Test SMS
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <View style={{ backgroundColor: colors.screen, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, flex: 1, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ color: colors.muted, fontSize: 11, textTransform: "uppercase", fontWeight: "600" }}>
                        Paid via Text
                      </Text>
                      <Text style={{ color: colors.heading, fontSize: 18, fontWeight: "bold", marginTop: 4 }}>328</Text>
                    </View>
                    <View style={{ backgroundColor: colors.screen, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, flex: 1, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ color: colors.muted, fontSize: 11, textTransform: "uppercase", fontWeight: "600" }}>
                        Avg. Pay Time
                      </Text>
                      <Text style={{ color: colors.heading, fontSize: 18, fontWeight: "bold", marginTop: 4 }}>
                        2.3 min
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

export default PaymentSystemsScreen;
