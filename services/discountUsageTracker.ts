import { storage } from "@/lib/storage";

const STORAGE_KEY = "pos_daily_discount_usage";

interface DailyUsage {
    date: string;
    counts: Record<string, number>;
}

const todayKey = () => new Date().toISOString().split("T")[0];

function readUsage(): DailyUsage | null {
    const raw = storage.getString(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DailyUsage) : null;
}

function writeUsage(usage: DailyUsage) {
    storage.set(STORAGE_KEY, JSON.stringify(usage));
}

export function getDailyUsageCounts(): Record<string, number> {
    const usage = readUsage();
    if (!usage || usage.date !== todayKey()) {
        return {};
    }
    return usage.counts;
}

export function incrementDiscountUsage(discountId: string): void {
    const today = todayKey();
    let usage = readUsage();
    if (!usage || usage.date !== today) {
        usage = { date: today, counts: {} };
    }
    usage.counts[discountId] = (usage.counts[discountId] || 0) + 1;
    writeUsage(usage);
}

export function decrementDiscountUsage(discountId: string): void {
    const today = todayKey();
    const usage = readUsage();
    if (!usage || usage.date !== today) return;
    if (usage.counts[discountId]) {
        usage.counts[discountId] = Math.max(usage.counts[discountId] - 1, 0);
        writeUsage(usage);
    }
}

