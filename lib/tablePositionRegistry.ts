import type { SharedValue } from "react-native-reanimated";

type PositionSV = { x: SharedValue<number>; y: SharedValue<number> };

const registry = new Map<string, PositionSV>();

export function registerTablePosition(
    tableId: string,
    x: SharedValue<number>,
    y: SharedValue<number>
) {
    registry.set(tableId, { x, y });
}

export function unregisterTablePosition(tableId: string) {
    registry.delete(tableId);
}

export function getTablePositionSV(tableId: string): PositionSV | undefined {
    return registry.get(tableId);
}


