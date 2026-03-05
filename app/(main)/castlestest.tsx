// ============================================================
// CastlesPay Terminal Diagnostic Test Screen
// File: screens/debug/CastlesTerminalTestScreen.tsx
// ============================================================
// Drop this screen into your app navigation for testing.
// It walks through each layer: ping → TCP → getData → sale
// and shows exactly where the chain breaks.
//
// REMOVE THIS SCREEN BEFORE PRODUCTION RELEASE.
// ============================================================

import {
    CastlesService,
    probeCastlesTerminal,
} from "@/services/terminals/castles-service";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

// ── Types ──

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: "info" | "success" | "error" | "warn" | "data";
}

type TestStatus = "idle" | "running" | "pass" | "fail";

interface TestState {
  probe: TestStatus;
  tcp: TestStatus;
  getData: TestStatus;
  sale: TestStatus;
}

// ── Constants ──

const COLORS = {
  bg: "#0C0F1A",
  panel: "#161B2E",
  elevated: "#1E2340",
  border: "#2A3050",
  teal: "#2DD4BF",
  amber: "#FBBF24",
  red: "#F87171",
  green: "#34D399",
  text: "#E2E8F0",
  textDim: "#94A3B8",
  textMuted: "#64748B",
};

const STATUS_COLORS: Record<TestStatus, string> = {
  idle: COLORS.textMuted,
  running: COLORS.amber,
  pass: COLORS.green,
  fail: COLORS.red,
};

const STATUS_LABELS: Record<TestStatus, string> = {
  idle: "○",
  running: "◌ ...",
  pass: "✓ Pass",
  fail: "✗ Fail",
};

const STATUS_DISPLAY: Record<string, string> = {
  CARD_ENTRY_REQUESTED: "Waiting for card...",
  CARD_INSERTED: "Card inserted",
  CARD_TAPPED: "Card tapped",
  CARD_SWIPED: "Card swiped",
  MANUAL_INPUT: "Manual card entry",
  PIN_REQUESTED: "Enter PIN on terminal",
  PIN_ENTRY_FAIL: "PIN entry failed",
  PIN_ENTRY_SUCCESS: "PIN accepted",
  COMMUNICATE_WITH_HOST: "Communicating with host...",
  TIP_REQUESTED: "Tip requested",
  TIP_ACCEPTED: "Tip accepted",
  TIP_DECLINED: "Tip declined",
  DONATION_REQUESTED: "Donation requested",
  DONATION_ACCEPTED: "Donation accepted",
  DONATION_DECLINED: "Donation declined",
  LOYALTY_IN_PROGRESS: "Loyalty in progress",
  QRCODE_TXN: "QR code transaction",
};

// ── Component ──

export default function CastlesTerminalTestScreen() {
  // Config
  const [host, setHost] = useState("192.168.1.");
  const [port, setPort] = useState("8080");
  const [saleAmount, setSaleAmount] = useState("1.00");

  // State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tests, setTests] = useState<TestState>({
    probe: "idle",
    tcp: "idle",
    getData: "idle",
    sale: "idle",
  });
  const [terminalInfo, setTerminalInfo] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<string | null>(null);

  // Diagnostic tuning
  const [delimiter, setDelimiterState] = useState<string>("");
  const [noDelay, setNoDelay] = useState(false);
  const [skipR2I, setSkipR2I] = useState(false);
  const [postConnectDelay, setPostConnectDelay] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Refs
  const serviceRef = useRef<CastlesService>(new CastlesService());
  const scrollRef = useRef<ScrollView>(null);
  const logIdRef = useRef(0);

  // ── Logging ──

  const addLog = useCallback(
    (message: string, level: LogEntry["level"] = "info") => {
      const entry: LogEntry = {
        id: String(++logIdRef.current),
        timestamp: new Date().toISOString().slice(11, 23),
        message,
        level,
      };
      setLogs((prev) => [...prev, entry]);
      // Auto-scroll after render
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    },
    [],
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
    setTests({ probe: "idle", tcp: "idle", getData: "idle", sale: "idle" });
    setTerminalInfo(null);
  }, []);

  const setTest = useCallback((key: keyof TestState, status: TestStatus) => {
    setTests((prev) => ({ ...prev, [key]: status }));
  }, []);

  // ── Sync diagnostic settings to service ──

  useEffect(() => {
    const s = serviceRef.current;
    s.setDelimiter(delimiter);
    s.setNoDelay(noDelay);
    s.setSkipReturn2Idle(skipR2I);
    s.setPostConnectDelay(postConnectDelay);
  }, [delimiter, noDelay, skipR2I, postConnectDelay]);

  // ── Status notification callback ──

  useEffect(() => {
    const service = serviceRef.current;
    service.setOnStatusNotification(({ txnStatus, txnStatusMessage }) => {
      const raw = txnStatus ?? txnStatusMessage ?? "unknown";
      const label = (txnStatus && STATUS_DISPLAY[txnStatus]) ?? raw;
      setTerminalStatus(label);
      addLog(`Terminal status: ${label}`, "data");
    });

    return () => {
      service.setOnStatusNotification(null);
    };
  }, [addLog]);

  // ── Test 1: TCP Probe ──

  const runProbe = useCallback(async (): Promise<boolean> => {
    setTest("probe", "running");
    addLog(`Probing TCP ${host}:${port}...`);

    const result = await probeCastlesTerminal(host, parseInt(port, 10), 5000);

    if (result.online) {
      addLog(`TCP port is OPEN — terminal is reachable`, "success");
      setTest("probe", "pass");
      return true;
    } else {
      addLog(`TCP probe FAILED: ${result.error}`, "error");
      if (result.error?.includes("ECONNREFUSED")) {
        addLog(
          "→ CastlesPay CMD SERVICE is not running or not in Socket Server mode",
          "warn",
        );
      } else if (result.error?.includes("timed out")) {
        addLog(
          "→ Terminal not reachable. Check: same WiFi? Correct IP? AP isolation off?",
          "warn",
        );
      }
      setTest("probe", "fail");
      return false;
    }
  }, [host, port, addLog, setTest]);

  // ── Test 2: TCP Connect + Handshake ──

  const runConnect = useCallback(async (): Promise<boolean> => {
    setTest("tcp", "running");
    addLog(`Connecting to ${host}:${port} with handshake verification...`);

    try {
      const service = serviceRef.current;
      // Graceful disconnect gives terminal time to release previous session
      await service.gracefulDisconnect();

      await service.connect({
        host,
        port: parseInt(port, 10),
      });

      addLog("TCP connected + getData handshake succeeded", "success");
      setTest("tcp", "pass");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Connect FAILED: ${msg}`, "error");

      if (msg.includes("timed out") && msg.includes("Buffer")) {
        addLog(
          "→ TCP connected but CastlesPay did not respond to getData",
          "warn",
        );
        addLog(
          "→ Check: is the CMD SERVICE actually started (green status)?",
          "warn",
        );
        addLog("→ Try restarting CastlesPay app on the Saturn1000", "warn");
      } else if (msg.includes("timed out")) {
        addLog("→ Could not establish TCP connection within timeout", "warn");
      }

      setTest("tcp", "fail");
      return false;
    }
  }, [host, port, addLog, setTest]);

  // ── Test 3: getData ──

  const runGetData = useCallback(async (): Promise<boolean> => {
    setTest("getData", "running");
    addLog("Sending getData command...");

    try {
      const service = serviceRef.current;
      const result = await service.getTerminalData("000001");

      if (result.success && result.data) {
        const data = result.data;
        setTerminalInfo(data as Record<string, unknown>);

        addLog("getData response received!", "success");
        addLog(`  Serial: ${data.infSN ?? "N/A"}`, "data");
        addLog(`  App version: ${data.infAppVersion ?? "N/A"}`, "data");
        addLog(`  EMV version: ${data.infEmvVersion ?? "N/A"}`, "data");
        addLog(`  EMVCL version: ${data.infEmvclVersion ?? "N/A"}`, "data");
        addLog(`  Android: ${data.infAndroidVersion ?? "N/A"}`, "data");
        addLog(`  Return code: ${data.txnReturnCode ?? "N/A"}`, "data");

        // Parse host info (acquirers)
        if (data.txnHostInfo && Array.isArray(data.txnHostInfo)) {
          addLog(`  Acquirers: ${data.txnHostInfo.length}`, "data");
          for (const hostInfo of data.txnHostInfo) {
            const h = hostInfo as Record<string, string>;
            addLog(
              `    → ${h.txnAcquirerName}: TID=${h.txnTid}, MID=${h.txnMid}`,
              "data",
            );
          }
        }

        setTest("getData", "pass");
        return true;
      } else {
        addLog(`getData returned error: ${result.error}`, "error");
        setTest("getData", "fail");
        return false;
      }
    } catch (err) {
      addLog(
        `getData EXCEPTION: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
      setTest("getData", "fail");
      return false;
    }
  }, [addLog, setTest]);

  // ── Test 4: Sale ──

  const runSale = useCallback(async (): Promise<boolean> => {
    const amount = parseFloat(saleAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog("Invalid sale amount", "error");
      setTest("sale", "fail");
      return false;
    }

    setTest("sale", "running");
    setTerminalStatus(null);
    addLog(`Processing sale for $${amount.toFixed(2)}...`);
    addLog("→ Present a card on the terminal when prompted", "warn");

    try {
      const service = serviceRef.current;
      const result = await service.processSale({
        amount,
        tipAmount: 0,
        referenceId: String(Math.floor(Math.random() * 999999)).padStart(
          6,
          "0",
        ),
      });

      setTerminalStatus(null);

      if (result.success && result.raw) {
        addLog("SALE APPROVED!", "success");
        addLog(`  Return code: ${result.raw.txnReturnCode}`, "data");
        addLog(`  Auth code: ${result.raw.txnApprovalCode ?? "N/A"}`, "data");
        addLog(
          `  Card: ${result.raw.txnCardBrand ?? "?"} ****${result.raw.txnMaskedCardNum?.slice(-4) ?? "????"}`,
          "data",
        );
        addLog(`  Entry: ${result.raw.txnEntryMode ?? "N/A"}`, "data");
        addLog(`  RRN: ${result.raw.txnRrn ?? "N/A"}`, "data");
        addLog(`  STAN: ${result.raw.txnStan ?? "N/A"}`, "data");
        addLog(
          `  Batch: ${result.raw.txnBatchNo ?? result.raw.txnBatchNum ?? "N/A"}`,
          "data",
        );
        addLog(`  Amount: ${result.raw.txnAmtTrans ?? "N/A"}`, "data");

        if (result.terminalResponse) {
          addLog("  Terminal response JSONB (for process_payment_v6):", "data");
          addLog(
            `  ${JSON.stringify(result.terminalResponse).slice(0, 300)}`,
            "data",
          );
        }

        setTest("sale", "pass");
        return true;
      } else {
        addLog(`Sale DECLINED/FAILED: ${result.error}`, "error");
        if (result.raw?.txnReturnCode) {
          addLog(`  Return code: ${result.raw.txnReturnCode}`, "data");
          addLog(`  Host message: ${result.raw.txnHostMsg ?? "N/A"}`, "data");
        }
        setTest("sale", "fail");
        return false;
      }
    } catch (err) {
      setTerminalStatus(null);
      addLog(
        `Sale EXCEPTION: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
      setTest("sale", "fail");
      return false;
    }
  }, [saleAmount, addLog, setTest]);

  // ── Run All Tests ──

  const runAllTests = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    clearLogs();

    addLog("═══════════════════════════════════════", "info");
    addLog("  CastlesPay Terminal Diagnostic Suite", "info");
    addLog("═══════════════════════════════════════", "info");
    addLog("");

    // Test 1: Probe
    addLog("── Step 1/4: TCP Port Probe ──");
    const probeOk = await runProbe();
    if (!probeOk) {
      addLog("");
      addLog("STOPPED: Cannot reach terminal. Fix network first.", "error");
      setIsRunning(false);
      return;
    }
    addLog("");

    // Test 2: Connect + handshake
    addLog("── Step 2/4: TCP Connect + getData Handshake ──");
    const connectOk = await runConnect();
    if (!connectOk) {
      addLog("");
      addLog("STOPPED: TCP connects but CastlesPay not responding.", "error");
      addLog("Check CMD SERVICE status on the Saturn1000.", "warn");
      setIsRunning(false);
      return;
    }
    addLog("");

    // Test 3: getData (separate from handshake — tests persistent connection)
    addLog("── Step 3/4: getData on Persistent Connection ──");
    const getDataOk = await runGetData();
    if (!getDataOk) {
      addLog("");
      addLog("STOPPED: getData failed on established connection.", "error");
      setIsRunning(false);
      return;
    }
    addLog("");

    // Test 4: Sale (requires user to present card)
    addLog("── Step 4/4: Test Sale ──");
    addLog(`Amount: $${parseFloat(saleAmount).toFixed(2)}`, "info");

    const doSale = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Ready for test sale?",
        `This will charge $${parseFloat(saleAmount).toFixed(2)} to a real card.\n\nHave a test card ready to tap/insert.`,
        [
          { text: "Skip", style: "cancel", onPress: () => resolve(false) },
          { text: "Run sale", onPress: () => resolve(true) },
        ],
      );
    });

    if (doSale) {
      await runSale();
    } else {
      addLog("Sale test skipped by user", "warn");
      setTest("sale", "idle");
    }

    addLog("");
    addLog("═══════════════════════════════════════", "info");
    addLog("  Diagnostic complete", "info");
    addLog("═══════════════════════════════════════", "info");

    setIsRunning(false);
  }, [
    isRunning,
    clearLogs,
    addLog,
    runProbe,
    runConnect,
    runGetData,
    runSale,
    saleAmount,
    setTest,
  ]);

  // ── Individual test runners ──

  const runSingleTest = useCallback(
    async (testFn: () => Promise<boolean>) => {
      if (isRunning) return;
      setIsRunning(true);
      await testFn();
      setIsRunning(false);
    },
    [isRunning],
  );

  // ── Disconnect ──

  const handleDisconnect = useCallback(() => {
    serviceRef.current.disconnect();
    addLog("Disconnected (hard)", "warn");
    setTests((prev) => ({
      ...prev,
      tcp: "idle",
      getData: "idle",
      sale: "idle",
    }));
  }, [addLog]);

  const handleGracefulDisconnect = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    addLog("Graceful disconnect: sending return2Idle → closing socket...");
    await serviceRef.current.gracefulDisconnect();
    addLog("Graceful disconnect complete", "success");
    setTests((prev) => ({
      ...prev,
      tcp: "idle",
      getData: "idle",
      sale: "idle",
    }));
    setIsRunning(false);
  }, [isRunning, addLog]);

  // ── Raw getData on existing connection (no reconnect) ──

  const runRawGetData = useCallback(async () => {
    if (isRunning) return;
    const service = serviceRef.current;
    if (!service.isConnected()) {
      addLog("Not connected — connect first", "error");
      return;
    }
    setIsRunning(true);
    addLog("Sending getData on EXISTING socket (no reconnect)...");
    try {
      const result = await service.getTerminalData(
        String(Math.floor(Math.random() * 999999)).padStart(6, "0"),
      );
      if (result.success) {
        addLog("getData OK — persistent connection is alive!", "success");
        if (result.data) {
          addLog(`  SN: ${result.data.infSN ?? "N/A"}, App: ${result.data.infAppVersion ?? "N/A"}`, "data");
        }
      } else {
        addLog(`getData failed: ${result.error}`, "error");
      }
    } catch (err) {
      addLog(`getData exception: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
    setIsRunning(false);
  }, [isRunning, addLog]);

  // ── Diagnose: test all delimiters automatically ──

  const runDiagnose = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    addLog("═══════════════════════════════════════", "info");
    addLog("  TCP Connection Diagnosis", "info");
    addLog("═══════════════════════════════════════", "info");
    addLog(`Target: ${host}:${port}`);

    try {
      const result = await serviceRef.current.diagnoseTcpConnection({
        host,
        port: parseInt(port, 10),
      });

      // Dump diagnostic log entries
      for (const line of result.log) {
        const isErr = line.toLowerCase().includes("fail");
        const isOk = line.toLowerCase().includes("success");
        addLog(line, isErr ? "error" : isOk ? "success" : "info");
      }

      if (result.dataReceived) {
        addLog(`Working delimiter: ${result.delimiterUsed}`, "success");
        if (result.rawResponse) {
          addLog(`Raw response: ${result.rawResponse.slice(0, 300)}`, "data");
        }
      } else {
        addLog("No delimiter produced a response from the terminal", "error");
        if (result.tcpConnected) {
          addLog("→ TCP connects fine — the issue is at the application layer", "warn");
          addLog("→ Try toggling noDelay, skip return2Idle, or post-connect delay", "warn");
        }
      }
    } catch (err) {
      addLog(`Diagnose error: ${err instanceof Error ? err.message : String(err)}`, "error");
    }

    setIsRunning(false);
  }, [isRunning, host, port, addLog]);

  // ── Render ──

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text>Back</Text></Pressable>
        <Text style={styles.title}>CastlesPay terminal diagnostics</Text>
        <Text style={styles.subtitle}>Test connection layer by layer</Text>
      </View>

      {/* Config row */}
      <View style={styles.configRow}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Terminal IP</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.XX"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="decimal-pad"
            editable={!isRunning}
          />
        </View>
        <View style={[styles.inputGroup, { width: 100 }]}>
          <Text style={styles.inputLabel}>Port</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="8080"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            editable={!isRunning}
          />
        </View>
        <View style={[styles.inputGroup, { width: 120 }]}>
          <Text style={styles.inputLabel}>Sale amount</Text>
          <TextInput
            style={styles.input}
            value={saleAmount}
            onChangeText={setSaleAmount}
            placeholder="1.00"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="decimal-pad"
            editable={!isRunning}
          />
        </View>
      </View>

      {/* Test status indicators */}
      <View style={styles.statusRow}>
        {(
          [
            ["probe", "TCP probe"],
            ["tcp", "Connect"],
            ["getData", "getData"],
            ["sale", "Sale"],
          ] as const
        ).map(([key, label]) => (
          <View key={key} style={styles.statusItem}>
            <Text
              style={[styles.statusDot, { color: STATUS_COLORS[tests[key]] }]}
            >
              {STATUS_LABELS[tests[key]]}
            </Text>
            <Text style={styles.statusLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnPrimary,
            isRunning && styles.btnDisabled,
          ]}
          onPress={runAllTests}
          disabled={isRunning}
        >
          <Text style={styles.btnText}>Run all tests</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnSecondary,
            isRunning && styles.btnDisabled,
          ]}
          onPress={() => runSingleTest(runProbe)}
          disabled={isRunning}
        >
          <Text style={styles.btnTextSecondary}>Probe only</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnSecondary,
            isRunning && styles.btnDisabled,
          ]}
          onPress={() => runSingleTest(runConnect)}
          disabled={isRunning}
        >
          <Text style={styles.btnTextSecondary}>Connect only</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnSecondary,
            isRunning && styles.btnDisabled,
          ]}
          onPress={() => runSingleTest(runGetData)}
          disabled={isRunning}
        >
          <Text style={styles.btnTextSecondary}>getData only</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnSecondary,
            { borderColor: COLORS.amber + "80" },
            isRunning && styles.btnDisabled,
          ]}
          onPress={runDiagnose}
          disabled={isRunning}
        >
          <Text style={[styles.btnTextSecondary, { color: COLORS.amber }]}>Diagnose</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnSecondary,
            { borderColor: COLORS.green + "60" },
            isRunning && styles.btnDisabled,
          ]}
          onPress={runRawGetData}
          disabled={isRunning}
        >
          <Text style={[styles.btnTextSecondary, { color: COLORS.green }]}>Raw getData</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline, isRunning && styles.btnDisabled]}
          onPress={handleGracefulDisconnect}
          disabled={isRunning}
        >
          <Text style={styles.btnTextOutline}>Graceful DC</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={handleDisconnect}
        >
          <Text style={styles.btnTextOutline}>Hard DC</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={clearLogs}
        >
          <Text style={styles.btnTextOutline}>Clear logs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={() => setSettingsOpen((p) => !p)}
        >
          <Text style={styles.btnTextOutline}>{settingsOpen ? "Hide settings" : "Settings"}</Text>
        </TouchableOpacity>
      </View>

      {/* Diagnostic settings panel */}
      {settingsOpen && (
        <View style={styles.settingsPanel}>
          {/* Delimiter */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Delimiter</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {([
                { label: "None", value: "" },
                { label: "\\n", value: "\n" },
                { label: "\\r\\n", value: "\r\n" },
                { label: "\\0", value: "\0" },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.pill, delimiter === opt.value && styles.pillActive]}
                  onPress={() => setDelimiterState(opt.value)}
                >
                  <Text style={[styles.pillText, delimiter === opt.value && styles.pillTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* TCP_NODELAY */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>TCP_NODELAY</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {([false, true] as const).map((val) => (
                <TouchableOpacity
                  key={String(val)}
                  style={[styles.pill, noDelay === val && styles.pillActive]}
                  onPress={() => setNoDelay(val)}
                >
                  <Text style={[styles.pillText, noDelay === val && styles.pillTextActive]}>
                    {val ? "On" : "Off"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Skip return2Idle */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Skip return2Idle</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {([false, true] as const).map((val) => (
                <TouchableOpacity
                  key={String(val)}
                  style={[styles.pill, skipR2I === val && styles.pillActive]}
                  onPress={() => setSkipR2I(val)}
                >
                  <Text style={[styles.pillText, skipR2I === val && styles.pillTextActive]}>
                    {val ? "Skip" : "Normal"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Post-connect delay */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Post-connect delay</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {([0, 100, 500, 1000] as const).map((ms) => (
                <TouchableOpacity
                  key={ms}
                  style={[styles.pill, postConnectDelay === ms && styles.pillActive]}
                  onPress={() => setPostConnectDelay(ms)}
                >
                  <Text style={[styles.pillText, postConnectDelay === ms && styles.pillTextActive]}>
                    {ms}ms
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Terminal info card */}
      {terminalInfo && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Terminal identified</Text>
          <Text style={styles.infoText}>
            SN: {String(terminalInfo.infSN ?? "N/A")}
            {"  •  "}
            App: {String(terminalInfo.infAppVersion ?? "N/A")}
            {"  •  "}
            EMV: {String(terminalInfo.infEmvVersion ?? "N/A")}
          </Text>
        </View>
      )}

      {/* Terminal status banner */}
      {terminalStatus !== null && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerDot}>●</Text>
          <Text style={styles.statusBannerText}>{terminalStatus}</Text>
        </View>
      )}

      {/* Log output */}
      <ScrollView
        ref={scrollRef}
        style={styles.logContainer}
        contentContainerStyle={styles.logContent}
      >
        {logs.length === 0 ? (
          <Text style={styles.logPlaceholder}>
            Enter the Saturn1000 IP from the CMD SERVICE screen and tap "Run all
            tests"
          </Text>
        ) : (
          logs.map((entry) => (
            <Text
              key={entry.id}
              style={[
                styles.logLine,
                entry.level === "success" && styles.logSuccess,
                entry.level === "error" && styles.logError,
                entry.level === "warn" && styles.logWarn,
                entry.level === "data" && styles.logData,
              ]}
            >
              <Text style={styles.logTimestamp}>{entry.timestamp} </Text>
              {entry.message}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 20,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "600",
  },
  subtitle: {
    color: COLORS.textDim,
    fontSize: 13,
    marginTop: 2,
  },

  // Config
  configRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },

  // Status
  statusRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: COLORS.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusItem: {
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statusLabel: {
    color: COLORS.textDim,
    fontSize: 11,
  },

  // Buttons
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnPrimary: {
    backgroundColor: COLORS.teal,
  },
  btnSecondary: {
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: COLORS.bg,
    fontSize: 14,
    fontWeight: "600",
  },
  btnTextSecondary: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "500",
  },
  btnTextOutline: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: "500",
  },

  // Info card
  infoCard: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.green + "40",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoTitle: {
    color: COLORS.green,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  infoText: {
    color: COLORS.textDim,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },

  // Status banner
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.amber + "60",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  statusBannerDot: {
    color: COLORS.amber,
    fontSize: 10,
  },
  statusBannerText: {
    color: COLORS.amber,
    fontSize: 13,
    fontWeight: "600",
  },

  // Log output
  logContainer: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  logContent: {
    padding: 12,
  },
  logPlaceholder: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 40,
  },
  logLine: {
    color: COLORS.textDim,
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 20,
  },
  logTimestamp: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  logSuccess: {
    color: COLORS.green,
    fontWeight: "600",
  },
  logError: {
    color: COLORS.red,
    fontWeight: "600",
  },
  logWarn: {
    color: COLORS.amber,
  },
  logData: {
    color: COLORS.teal,
  },

  // Settings panel
  settingsPanel: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsLabel: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: "500",
    minWidth: 120,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: {
    backgroundColor: COLORS.teal + "20",
    borderColor: COLORS.teal,
  },
  pillText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  pillTextActive: {
    color: COLORS.teal,
  },
});
