import { Path, Skia } from "@shopify/react-native-skia";
import {
    SharedValue,
    useDerivedValue,
    withSpring,
} from "react-native-reanimated";
import { SpringConfig } from "react-native-reanimated/lib/typescript/animation/springUtils";

import { runOnJS } from "react-native-reanimated";

import { usePieSliceContext } from "./pie-slice-context";

export interface PieSliceData {
    item: PieChartDataEntry;
    startAngle: number;
    index: number;
    radius: number;
    center: number;
    fullSweepAngle: number;
    gap: number;
    animatedValue: SharedValue<number>;
    strokeWidth: number;
    selectedSlice: SharedValue<number | null>;
}

export function handlePieTouch<T extends { value: number }>(args: {
    centerX: number;
    centerY: number;
    data: T[];
    totalValue: number;
    radius: number;
    gap: number;
    x: number;
    y: number;

    onSlicePress: (index: number) => void;
    selectedSlice: SharedValue<number | null>;
}) {
    "worklet";

    const {
        centerX,
        centerY,
        data,
        totalValue,
        gap,
        radius,
        x,
        y,
        onSlicePress,
        selectedSlice,
    } = args;
    let currentAngle = -90;

    for (let i = 0; i < data.length; i++) {
        const {
            startAngle,
            endAngle,
            currentAngle: newCurrentAngle,
        } = calculateAngle({
            proportion: data[i].value / totalValue,
            currentAngle,
            gap,
        });

        currentAngle = newCurrentAngle;

        if (
            isPointInArc({
                x,
                y,
                centerX,
                centerY,
                radius,
                startAngle,
                endAngle,
            })
        ) {
            if (selectedSlice.value === i) {
                selectedSlice.value = null;
            } else {
                selectedSlice.value = i;
            }

            runOnJS(onSlicePress)(i);
            break;
        }
    }
}

export const checkIfDistanceIsInsideArc = (args: {
    centerX: number;
    centerY: number;
    radius: number;
    strokeWidth: number;
    x: number;
    y: number;
}) => {
    "worklet";
    const { centerX, centerY, radius, strokeWidth, x, y } = args;

    const dx = x - centerX;
    const dy = y - centerY;

    // Calculate distance from center
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Add padding to the hit area
    const touchPadding = 15;
    const innerRadius = radius - strokeWidth / 2 - touchPadding;
    const outerRadius = radius + strokeWidth / 2 + touchPadding;

    return distance >= innerRadius && distance <= outerRadius;
};

export const calculateTouchAngle = (args: {
    x: number;
    y: number;
    centerX: number;
    centerY: number;
}) => {
    "worklet";
    const { x, y, centerX, centerY } = args;
    const dx = x - centerX;
    const dy = y - centerY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    return angle;
};

// Helper function to check if a point is within an arc's bounds
export const isPointInArc = (args: {
    x: number;
    y: number;
    centerX: number;
    centerY: number;
    radius: number;
    startAngle: number;
    endAngle: number;
}) => {
    "worklet";

    const {
        x,
        y,
        centerX,
        centerY,
        radius,
        startAngle,
        endAngle,
    } = args;

    const angle = calculateTouchAngle({ x, y, centerX, centerY });
    // Check if angle is within arc bounds
    if (startAngle <= endAngle) {
        return angle >= startAngle && angle <= endAngle;
    } else {
        // If angle is less than endAngle, add 360 to it for proper comparison
        const normalizedAngle = angle <= endAngle ? angle + 360 : angle;
        return normalizedAngle >= startAngle && normalizedAngle <= endAngle + 360;
    }
};

export const createArcPath = (args: {
    startAngle: number;
    endAngle: number;
    radius: number;
    center: number;
    strokeWidth: number;
}) => {
    'worklet';
    const { startAngle, endAngle, radius, center, strokeWidth } = args;
    const path = Skia.Path.Make();

    path.addArc(
        {
            x: center - radius + strokeWidth / 2,
            y: center - radius + strokeWidth / 2,
            width: radius * 2 - strokeWidth,
            height: radius * 2 - strokeWidth,
        },
        startAngle,
        endAngle - startAngle,
    );
    return path;
};

export const calculateAngle = (args: {
    proportion: number;
    currentAngle: number;
    gap: number;
}) => {
    'worklet';
    const { proportion, currentAngle: _currentAngle, gap } = args;

    const sweepAngle = proportion * 360;

    const startAngle = (_currentAngle + 360) % 360; // Normalize to 0-360
    const endAngle = (startAngle + sweepAngle - gap + 360) % 360; // Normalize to 0-360
    const currentAngle = _currentAngle + sweepAngle;

    return {
        startAngle,
        endAngle,
        currentAngle,
    };
};
// Animation configuration

export const SPRING_CONFIG: SpringConfig = {
    mass: 1,
    damping: 15,
    stiffness: 130,
};
export interface PieChartDataEntry {
    value: number;
    color: string;
    label: string;
}

export interface PieSliceData {
    item: PieChartDataEntry;
    startAngle: number;
    index: number;
    radius: number;
    center: number;
    fullSweepAngle: number;
    gap: number;
    animatedValue: SharedValue<number>;
    strokeWidth: number;
    selectedSlice: SharedValue<number | null>;
}

export function PieSlice() {
    const { slice } = usePieSliceContext();

    const {
        index,
        item,
        startAngle,
        fullSweepAngle,
        gap,
        animatedValue,
        radius,
        center,
        strokeWidth,
        selectedSlice,
    } = slice;
    const animatedStrokeWidth = useDerivedValue(() => {
        if (selectedSlice.value === null) {
            return withSpring(strokeWidth, SPRING_CONFIG);
        }
        return withSpring(
            selectedSlice.value === index ? strokeWidth * 1.5 : strokeWidth * 0.8,
            SPRING_CONFIG
        );
    });

    const path = useDerivedValue(() => {
        const animatedSweep = Math.max(
            0,
            (fullSweepAngle - gap) * animatedValue.value
        );

        return createArcPath({
            startAngle: startAngle,
            endAngle: startAngle + animatedSweep,
            radius,
            center: center,
            strokeWidth: strokeWidth,
        });
    });

    return (
        <Path
            path={path}
            color={item.color}
            style="stroke"
            strokeWidth={animatedStrokeWidth}
            strokeCap="round"
        />
    );
}