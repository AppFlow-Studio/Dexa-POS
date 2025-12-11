import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Clock, CreditCard, DollarSign, Gauge, Lock, MessageSquare, Minus, Monitor, Plus, Send, Shield, Trash2, Zap } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

interface SavedCard {
    id: string;
    last4: string;
    brand: string;
    expiry: string;
    customerName: string;
}

interface KDSDisplay {
    id: string;
    name: string;
    ip: string;
    status: "online" | "offline";
    activeOrders: number;
}

const PaymentSystemsScreen = () => {
    // Zustand store
    const {
        dualPricing, setDualPricing,
        surcharging, setSurcharging,
        funding, setFunding,
        tokenizationEnabled,
        textToPayEnabled,
        throttling, setThrottling,
        kdsEnabled,
        prepCategories, adjustPrepTime,
        showPrepTimesToCustomers,
        autoAdjustPrepTimes,
        updateDiningSettings,
    } = useSettingsStore();

    // Local state for features not fully in store yet
    const [textToPayTestSent, setTextToPayTestSent] = useState(false);
    const [currentPrepAdjustment] = useState(5);


    // Local UI state
    const [calculatorAmount, setCalculatorAmount] = useState("100");
    const [savedCards] = useState<SavedCard[]>([
        { id: "1", last4: "4242", brand: "Visa", expiry: "12/25", customerName: "John Smith" },
        { id: "2", last4: "5555", brand: "Mastercard", expiry: "03/26", customerName: "Sarah Johnson" },
        { id: "3", last4: "0005", brand: "Amex", expiry: "08/24", customerName: "Mike Davis" },
    ]);
    const [kdsDisplays] = useState<KDSDisplay[]>([
        { id: "1", name: "Hot Line Display", ip: "192.168.1.50", status: "online", activeOrders: 12 },
        { id: "2", name: "Cold Line Display", ip: "192.168.1.51", status: "online", activeOrders: 5 },
        { id: "3", name: "Expo Display", ip: "192.168.1.52", status: "offline", activeOrders: 0 },
    ]);

    const [expandedSections, setExpandedSections] = useState({
        dual: true,
        surcharge: false,
        funding: false,
        token: false,
        text: false,
        throttle: false,
        kds: false,
        prep: false,
    });

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    const getCapacityColor = (value: number) => {
        if (value < 60) return { bg: "bg-green-600", text: "text-green-400" };
        if (value < 80) return { bg: "bg-yellow-600", text: "text-yellow-400" };
        return { bg: "bg-red-600", text: "text-red-400" };
    };

    const stateCompliance: Record<string, boolean> = {
        "California": true, "New York": true, "Texas": true, "Florida": true,
        "Colorado": false, "Connecticut": false, "Kansas": false, "Maine": false,
        "Massachusetts": false, "Oklahoma": false,
    };

    const renderSectionHeader = (title: string, icon: React.ReactNode, section: keyof typeof expandedSections) => (
        <TouchableOpacity
            onPress={() => toggleSection(section)}
            className="flex-row items-center justify-between p-4 bg-[#353535] rounded-t-xl border-b border-gray-700"
        >
            <View className="flex-row items-center">
                <View className="w-8 h-8 bg-[#454545] rounded-lg items-center justify-center mr-3">
                    {icon}
                </View>
                <Text className="text-white font-bold text-lg">{title}</Text>
            </View>
            {expandedSections[section] ? <ChevronUp size={20} color="#9ca3af" /> : <ChevronDown size={20} color="#9ca3af" />}
        </TouchableOpacity>
    );

    const cardTotal = parseFloat(calculatorAmount || "0") * (1 + parseFloat(dualPricing.discount || "0") / 100);

    return (
        <View className="flex-1 bg-[#212121] p-6">
            <View className="mb-6">
                <Text className="text-3xl font-bold text-white">Payment Systems</Text>
                <Text className="text-gray-400 mt-2">Advanced payment features, kitchen operations, and compliance tools.</Text>
            </View>

            <View className="h-px w-full bg-gray-700 mb-6" />

            <ScrollView showsVerticalScrollIndicator={false}>

                {/* DUAL PRICING */}
                <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Dual Pricing & Cash Discount", <DollarSign size={20} color="#4ade80" />, "dual")}
                    {expandedSections.dual && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Enable Cash Discount</Text>
                                    <Text className="text-gray-400 text-sm">Offset processing fees for cash payments</Text>
                                </View>
                                <Switch checked={dualPricing.enabled} onCheckedChange={(v) => setDualPricing({ enabled: v })} />
                            </View>

                            {dualPricing.enabled && (
                                <>
                                    <View className="mb-4">
                                        <Text className="text-gray-300 font-medium mb-2">Discount: {dualPricing.discount}%</Text>
                                        <View className="flex-row gap-2">
                                            {["1.0", "2.0", "2.5", "3.0", "3.5", "4.0"].map(val => (
                                                <TouchableOpacity
                                                    key={val}
                                                    onPress={() => setDualPricing({ discount: val })}
                                                    className={`flex-1 py-2 rounded-lg ${dualPricing.discount === val ? 'bg-green-600' : 'bg-[#404040]'}`}
                                                >
                                                    <Text className={`text-center font-bold ${dualPricing.discount === val ? 'text-white' : 'text-gray-400'}`}>{val}%</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View className="bg-[#404040] p-4 rounded-lg border border-gray-600 mb-4">
                                        <Text className="text-gray-400 text-xs mb-2 uppercase">Live Price Calculator</Text>
                                        <View className="flex-row items-center mb-3">
                                            <Text className="text-white mr-2">$</Text>
                                            <TextInput
                                                value={calculatorAmount}
                                                onChangeText={setCalculatorAmount}
                                                className="flex-1 bg-[#505050] p-2 rounded text-white text-lg"
                                                keyboardType="decimal-pad"
                                                placeholder="100"
                                                placeholderTextColor="#6b7280"
                                            />
                                        </View>
                                        <View className="flex-row justify-between mb-1"><Text className="text-gray-300">Cash Price</Text><Text className="text-green-400 font-bold">${parseFloat(calculatorAmount || "0").toFixed(2)}</Text></View>
                                        <View className="flex-row justify-between"><Text className="text-gray-300">Card Price</Text><Text className="text-white font-bold">${cardTotal.toFixed(2)}</Text></View>
                                    </View>

                                    <View className="flex-row items-center bg-green-600/10 p-3 rounded-lg border border-green-600/30 mb-4">
                                        <Shield size={20} color="#4ade80" />
                                        <View className="ml-3">
                                            <Text className="text-green-400 font-bold">Durbin Amendment Compliant</Text>
                                            <Text className="text-green-300/70 text-xs">Meets federal regulations</Text>
                                        </View>
                                    </View>

                                    <View className="bg-[#404040] p-4 rounded-lg border border-gray-600">
                                        <Text className="text-gray-300 font-medium mb-3">Signage Checklist</Text>
                                        {Object.entries(dualPricing.signageChecklist).map(([key, value]) => {
                                            const labels: Record<string, string> = { priceDisplay: "Price tags show cash price", registerSign: "Sign at register", entranceSign: "Sign at entrance", menuNote: "Note on menu" };
                                            return (
                                                <TouchableOpacity key={key} onPress={() => setDualPricing({ signageChecklist: { ...dualPricing.signageChecklist, [key]: !value } })} className="flex-row items-center py-2">
                                                    <View className={`w-5 h-5 rounded border mr-3 items-center justify-center ${value ? 'bg-green-600 border-green-500' : 'border-gray-500'}`}>
                                                        {value && <Check size={14} color="white" />}
                                                    </View>
                                                    <Text className="text-gray-300">{labels[key]}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </>
                            )}
                        </View>
                    )}
                </View>

                {/* SURCHARGING */}
                <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Credit Card Surcharging", <CreditCard size={20} color="#f87171" />, "surcharge")}
                    {expandedSections.surcharge && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Enable Surcharging</Text>
                                    <Text className="text-gray-400 text-sm">Pass processing fees to card customers</Text>
                                </View>
                                <Switch checked={surcharging.enabled} onCheckedChange={(v) => setSurcharging({ enabled: v })} />
                            </View>

                            {surcharging.enabled && (
                                <>
                                    <View className="mb-4">
                                        <Text className="text-gray-300 font-medium mb-2">Surcharge Rate (%)</Text>
                                        <View className="h-14 bg-[#404040] border border-gray-600 rounded-lg flex-row items-center overflow-hidden">
                                            <TextInput value={surcharging.rate} onChangeText={(t) => setSurcharging({ rate: t })} className="flex-1 p-3 text-white text-base" keyboardType="decimal-pad" />
                                            <View className="px-4 bg-[#505050] h-full justify-center border-l border-gray-600"><Text className="text-white font-bold">%</Text></View>
                                        </View>
                                    </View>

                                    <View className="mb-4">
                                        <Text className="text-gray-300 font-medium mb-2">Your State</Text>
                                        <View className="flex-row flex-wrap gap-2">
                                            {Object.keys(stateCompliance).slice(0, 6).map(state => (
                                                <TouchableOpacity key={state} onPress={() => setSurcharging({ selectedState: state })} className={`px-3 py-2 rounded-lg ${surcharging.selectedState === state ? 'bg-blue-600' : 'bg-[#404040]'}`}>
                                                    <Text className={`text-sm ${surcharging.selectedState === state ? 'text-white font-bold' : 'text-gray-400'}`}>{state}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <View className={`mt-3 p-3 rounded-lg flex-row items-center ${stateCompliance[surcharging.selectedState] ? 'bg-green-600/10 border border-green-600/30' : 'bg-red-600/10 border border-red-600/30'}`}>
                                            {stateCompliance[surcharging.selectedState] ? (
                                                <><Check size={18} color="#4ade80" /><Text className="text-green-400 ml-2">Surcharging is LEGAL in {surcharging.selectedState}</Text></>
                                            ) : (
                                                <><AlertTriangle size={18} color="#f87171" /><Text className="text-red-400 ml-2">Surcharging is NOT ALLOWED in {surcharging.selectedState}</Text></>
                                            )}
                                        </View>
                                    </View>

                                    <View className="bg-blue-900/20 p-3 rounded-lg border border-blue-900/50 mb-4">
                                        <Text className="text-blue-300 text-sm">ℹ️ Debit cards are automatically excluded from surcharges.</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    )}
                </View>

                {/* REAL-TIME FUNDING */}
                <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Real-Time Funding", <Zap size={20} color="#facc15" />, "funding")}
                    {expandedSections.funding && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Enable Instant Deposits</Text>
                                    <Text className="text-gray-400 text-sm">Get funds in minutes (1.5% fee)</Text>
                                </View>
                                <Switch checked={funding.instant} onCheckedChange={(v) => setFunding({ instant: v })} />
                            </View>

                            <View className="bg-[#404040] rounded-lg border border-gray-600 mb-4 overflow-hidden">
                                <View className="flex-row border-b border-gray-600">
                                    <View className="flex-1 p-3 border-r border-gray-600"><Text className="text-gray-400 text-xs uppercase text-center">Feature</Text></View>
                                    <View className="flex-1 p-3 border-r border-gray-600"><Text className="text-gray-400 text-xs uppercase text-center">Standard</Text></View>
                                    <View className="flex-1 p-3 bg-yellow-600/10"><Text className="text-yellow-400 text-xs uppercase text-center">Instant</Text></View>
                                </View>
                                <View className="flex-row border-b border-gray-600">
                                    <View className="flex-1 p-3 border-r border-gray-600"><Text className="text-gray-300 text-sm">Timing</Text></View>
                                    <View className="flex-1 p-3 border-r border-gray-600"><Text className="text-white text-sm text-center">2-3 days</Text></View>
                                    <View className="flex-1 p-3 bg-yellow-600/10"><Text className="text-white text-sm text-center font-bold">Minutes</Text></View>
                                </View>
                                <View className="flex-row">
                                    <View className="flex-1 p-3 border-r border-gray-600"><Text className="text-gray-300 text-sm">Fee</Text></View>
                                    <View className="flex-1 p-3 border-r border-gray-600"><Text className="text-green-400 text-sm text-center">Free</Text></View>
                                    <View className="flex-1 p-3 bg-yellow-600/10"><Text className="text-yellow-400 text-sm text-center">1.5%</Text></View>
                                </View>
                            </View>

                            <View className="bg-blue-900/20 p-4 rounded-lg border border-blue-900/50">
                                <Text className="text-blue-200 font-bold mb-1">Available for Deposit</Text>
                                <Text className="text-white text-3xl font-bold">${funding.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                                <TouchableOpacity className="bg-blue-600 mt-3 py-3 rounded-lg items-center flex-row justify-center">
                                    <Zap size={18} color="white" />
                                    <Text className="text-white font-bold ml-2">Transfer Now</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* TOKENIZATION */}
                <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Card Vault / Tokenization", <Lock size={20} color="#60a5fa" />, "token")}
                    {expandedSections.token && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Save Customer Cards</Text>
                                    <Text className="text-gray-400 text-sm">Securely store payment methods</Text>
                                </View>
                                <Switch checked={tokenizationEnabled} onCheckedChange={(v) => updateDiningSettings({ tokenizationEnabled: v })} />
                            </View>

                            <View className="flex-row gap-4 mb-4">
                                <View className="bg-[#404040] p-3 rounded-lg flex-1 border border-gray-600">
                                    <Text className="text-gray-400 text-xs uppercase">Saved Cards</Text>
                                    <Text className="text-white text-xl font-bold">1,240</Text>
                                </View>
                                <View className="bg-[#404040] p-3 rounded-lg flex-1 border border-gray-600">
                                    <Text className="text-gray-400 text-xs uppercase">Repeat Rate</Text>
                                    <Text className="text-white text-xl font-bold">45%</Text>
                                </View>
                            </View>

                            <Text className="text-gray-300 font-medium mb-2">Recent Saved Cards</Text>
                            {savedCards.map(card => (
                                <View key={card.id} className="bg-[#404040] p-3 rounded-lg border border-gray-600 mb-2 flex-row items-center justify-between">
                                    <View className="flex-row items-center">
                                        <CreditCard size={20} color="#9ca3af" />
                                        <View className="ml-3">
                                            <Text className="text-white font-medium">{card.brand} •••• {card.last4}</Text>
                                            <Text className="text-gray-500 text-xs">{card.customerName} • Exp {card.expiry}</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity className="p-2"><Trash2 size={16} color="#f87171" /></TouchableOpacity>
                                </View>
                            ))}

                            <View className="flex-row items-center bg-blue-900/20 p-3 rounded-lg border border-blue-900/50 mt-2">
                                <Shield size={18} color="#60a5fa" />
                                <Text className="text-blue-300 text-sm ml-2">PCI-DSS Level 1 Compliant Vault</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* TEXT-TO-PAY */}
                <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Text-to-Pay", <MessageSquare size={20} color="#a78bfa" />, "text")}
                    {expandedSections.text && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Enable SMS Payment Links</Text>
                                    <Text className="text-gray-400 text-sm">Send payment links via text</Text>
                                </View>
                                <Switch checked={textToPayEnabled} onCheckedChange={(v) => updateDiningSettings({ textToPayEnabled: v })} />
                            </View>

                            {textToPayEnabled && (
                                <>
                                    <View className="bg-[#404040] p-4 rounded-lg border border-gray-600 mb-4">
                                        <Text className="text-gray-400 text-xs mb-2">SMS Preview</Text>
                                        <View className="bg-[#303030] p-3 rounded-lg">
                                            <Text className="text-white text-sm">"Hi [Name], your order at Dexa POS is ready! Pay securely here: https://pay.dexa.app/abc123"</Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity onPress={() => setTextToPayTestSent(true)} className={`flex-row items-center justify-center py-3 rounded-lg border mb-4 ${textToPayTestSent ? 'bg-green-600/20 border-green-600' : 'border-blue-600'}`}>
                                        {textToPayTestSent ? (<><Check size={18} color="#4ade80" /><Text className="text-green-400 font-medium ml-2">Test Sent Successfully!</Text></>) : (<><Send size={18} color="#60a5fa" /><Text className="text-blue-400 font-medium ml-2">Send Test SMS</Text></>)}
                                    </TouchableOpacity>

                                    <View className="flex-row gap-4">
                                        <View className="bg-[#404040] p-3 rounded-lg flex-1 border border-gray-600">
                                            <Text className="text-gray-400 text-xs uppercase">Paid via Text</Text>
                                            <Text className="text-white text-xl font-bold">328</Text>
                                        </View>
                                        <View className="bg-[#404040] p-3 rounded-lg flex-1 border border-gray-600">
                                            <Text className="text-gray-400 text-xs uppercase">Avg. Pay Time</Text>
                                            <Text className="text-white text-xl font-bold">2.3 min</Text>
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>
                    )}
                </View>

                {/* KITCHEN THROTTLING */}
                <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Smart Kitchen Throttling", <Gauge size={20} color="#f97316" />, "throttle")}
                    {expandedSections.throttle && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Auto-Throttle</Text>
                                    <Text className="text-gray-400 text-sm">Automatically manage kitchen capacity</Text>
                                </View>
                                <Switch checked={throttling.enabled} onCheckedChange={(v) => setThrottling({ enabled: v })} />
                            </View>

                            {throttling.enabled && (
                                <>
                                    <View className="mb-4">
                                        <Text className="text-gray-300 font-medium mb-2">Throttle Threshold: {throttling.capacity}%</Text>
                                        <View className="flex-row gap-1 mb-2">
                                            {[50, 60, 70, 75, 80, 90].map(val => (
                                                <TouchableOpacity key={val} onPress={() => setThrottling({ capacity: val })} className={`flex-1 py-2 rounded ${throttling.capacity === val ? getCapacityColor(val).bg : 'bg-[#404040]'}`}>
                                                    <Text className={`text-center text-sm font-bold ${throttling.capacity === val ? 'text-white' : 'text-gray-500'}`}>{val}%</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <View className="flex-row h-3 rounded-full overflow-hidden">
                                            <View className="flex-[60] bg-green-600" />
                                            <View className="flex-[20] bg-yellow-600" />
                                            <View className="flex-[20] bg-red-600" />
                                        </View>
                                    </View>

                                    <View className={`p-4 rounded-lg border mb-4 ${getCapacityColor(throttling.currentLoad).bg}/10 border-${getCapacityColor(throttling.currentLoad).bg}/30`}>
                                        <View className="flex-row justify-between items-center">
                                            <Text className="text-white font-bold">Current Kitchen Load</Text>
                                            <Text className={`text-2xl font-bold ${getCapacityColor(throttling.currentLoad).text}`}>{throttling.currentLoad}%</Text>
                                        </View>
                                        <Text className="text-gray-400 text-sm mt-1">12 active orders • 3 pending fire</Text>
                                    </View>

                                    <Text className="text-gray-300 font-medium mb-2">Actions When Threshold Reached</Text>
                                    <View className="bg-[#404040] p-3 rounded-lg border border-gray-600">
                                        <View className="flex-row items-center justify-between py-2 border-b border-gray-700">
                                            <Text className="text-white">Pause online orders</Text>
                                            <Switch checked={throttling.pauseOnline} onCheckedChange={(v) => setThrottling({ pauseOnline: v })} />
                                        </View>
                                        <View className="flex-row items-center justify-between py-2 border-b border-gray-700">
                                            <Text className="text-white">Increase prep times</Text>
                                            <Switch checked={throttling.increasePrepTime} onCheckedChange={(v) => setThrottling({ increasePrepTime: v })} />
                                        </View>
                                        <View className="flex-row items-center justify-between py-2">
                                            <Text className="text-white">Alert manager</Text>
                                            <Switch checked={throttling.alertManager} onCheckedChange={(v) => setThrottling({ alertManager: v })} />
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>
                    )}
                </View>

                {/* KDS */}
                <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Kitchen Display (KDS)", <Monitor size={20} color="#2dd4bf" />, "kds")}
                    {expandedSections.kds && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Enable KDS Integration</Text>
                                    <Text className="text-gray-400 text-sm">Connect kitchen display screens</Text>
                                </View>
                                <Switch checked={kdsEnabled} onCheckedChange={(v) => updateDiningSettings({ kdsEnabled: v })} />
                            </View>

                            {kdsEnabled && (
                                <>
                                    {kdsDisplays.map(display => (
                                        <View key={display.id} className="bg-[#404040] p-3 rounded-lg border border-gray-600 mb-2 flex-row items-center justify-between">
                                            <View className="flex-row items-center">
                                                <View className={`w-3 h-3 rounded-full mr-3 ${display.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}`} />
                                                <View>
                                                    <Text className="text-white font-medium">{display.name}</Text>
                                                    <Text className="text-gray-500 text-xs">{display.ip} • {display.activeOrders} orders</Text>
                                                </View>
                                            </View>
                                            <TouchableOpacity className="bg-[#505050] px-3 py-1 rounded">
                                                <Text className="text-blue-400 text-sm">Test</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                    <TouchableOpacity className="bg-[#404040] p-3 rounded-lg border border-dashed border-gray-600 flex-row items-center justify-center mt-2">
                                        <Plus size={18} color="#60a5fa" />
                                        <Text className="text-blue-400 font-medium ml-2">Add KDS Display</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    )}
                </View>

                {/* PREP TIMES */}
                <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Prep Time Configuration", <Clock size={20} color="#ec4899" />, "prep")}
                    {expandedSections.prep && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Show Prep Times to Customers</Text>
                                    <Text className="text-gray-400 text-sm">Display estimated wait times</Text>
                                </View>
                                <Switch checked={showPrepTimesToCustomers} onCheckedChange={(v) => updateDiningSettings({ showPrepTimesToCustomers: v })} />
                            </View>

                            <Text className="text-gray-300 font-medium mb-3">Category Defaults</Text>
                            {prepCategories.map(cat => (
                                <View key={cat.id} className="flex-row items-center justify-between py-2 border-b border-gray-700">
                                    <Text className="text-white">{cat.name}</Text>
                                    <View className="flex-row items-center">
                                        <TouchableOpacity onPress={() => adjustPrepTime(cat.id, -1)} className="w-8 h-8 bg-[#505050] rounded items-center justify-center">
                                            <Minus size={16} color="#9ca3af" />
                                        </TouchableOpacity>
                                        <Text className="text-white font-bold mx-3 w-12 text-center">{cat.minutes} min</Text>
                                        <TouchableOpacity onPress={() => adjustPrepTime(cat.id, 1)} className="w-8 h-8 bg-[#505050] rounded items-center justify-center">
                                            <Plus size={16} color="#9ca3af" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}

                            <View className="flex-row items-center justify-between py-3 mt-2">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Auto-Adjust for Load</Text>
                                    <Text className="text-gray-400 text-sm">Increase times when kitchen is busy</Text>
                                </View>
                                <Switch checked={autoAdjustPrepTimes} onCheckedChange={(v) => updateDiningSettings({ autoAdjustPrepTimes: v })} />
                            </View>

                            {autoAdjustPrepTimes && (
                                <View className="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/30 mt-2">
                                    <Text className="text-yellow-400 font-medium">Current Adjustment: +{currentPrepAdjustment} min</Text>
                                    <Text className="text-yellow-200/70 text-xs">Kitchen is moderately busy</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>

                <View className="h-10" />
            </ScrollView>
        </View>
    );
};

export default PaymentSystemsScreen;
