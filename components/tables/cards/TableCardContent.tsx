import { TABLE_SHAPES } from "@/lib/table-shapes";
import { colors } from "@/lib/theme";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { BrushCleaning, Lock } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";
import { GestureDetector, GestureType } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { TableCardData } from "./useTableCardData";

/**
 * Static reservation badge — no Reanimated animation.
 * Plain View with conditional styling.
 */
export const ReservationBadge = React.memo(function ReservationBadge({
  label,
  urgent,
}: {
  label: string;
  urgent: boolean;
}) {
  const badgeColor = urgent ? colors.danger : colors.warning;

  return (
    <View
      style={{
        position: "absolute",
        bottom: 4,
        right: 4,
        paddingHorizontal: 5,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: badgeColor + "40",
        borderWidth: 1.5,
        borderColor: badgeColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: badgeColor,
          fontSize: 8,
          fontWeight: "800",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
});

/**
 * Static pulsing border indicator — no Reanimated animation.
 * Just renders a plain colored border when active.
 */
export const PulsingBorder = React.memo(function PulsingBorder({
  active,
  width,
  height,
}: {
  active: boolean;
  width: number;
  height: number;
}) {
  if (!active) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        borderRadius: 16,
        borderWidth: 2.5,
        borderColor: "rgba(248,113,113,0.6)",
      }}
    />
  );
});

/**
 * Yellow border shown while a table is being dragged (long-press held).
 * Uses useAnimatedStyle to toggle opacity on the UI thread without a JS re-render.
 */
const DraggingBorder = React.memo(function DraggingBorder({
  sharedValue,
}: {
  sharedValue: Animated.SharedValue<boolean>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: sharedValue.value ? 1 : 0,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: -3,
          left: -3,
          right: -3,
          bottom: -3,
          borderWidth: 2.5,
          borderColor: colors.warning,
          borderRadius: 18,
        },
        animatedStyle,
      ]}
    />
  );
});

interface TableCardContentProps {
  table: FloorPlanObject;
  data: TableCardData;
  isTableType: boolean;
  isWall: boolean;
  isSelected: boolean;
  isDragging?: Animated.SharedValue<boolean>;
  isEditMode: boolean;
  isLocked: boolean;
  sectionColor?: string;
  // Edit-mode-only wall resize handles. Undefined in view mode (static path),
  // so the static card never even references a gesture object.
  wallResizeLeftGesture?: GestureType;
  wallResizeRightGesture?: GestureType;
}

/**
 * Presentational body shared by the static and editable cards. Contains no
 * Reanimated shared values of its own — the only animated objects it touches
 * are the wall-resize gestures, which are passed in (edit mode only) and only
 * rendered when `isSelected && isEditMode && isWall`.
 */
const TableCardContent: React.FC<TableCardContentProps> = ({
  table,
  data,
  isTableType,
  isWall,
  isSelected,
  isDragging,
  isEditMode,
  isLocked,
  sectionColor,
  wallResizeLeftGesture,
  wallResizeRightGesture,
}) => {
  const {
    isDarkColorScheme,
    liveSession,
    resolvedWallEdgeFlags,
    effectiveWidth,
    effectiveHeight,
    effectiveOrder,
    serverInitials,
    activeTabAmount,
    tableColor,
    tableStatus,
    textFit,
    tableLabel,
    reservationLabel,
    reservationCountdownLabel,
    isReservedSoon,
    isOccupiedWithReservationSoon,
    isReservationUrgent,
    isOccupiedStatus,
    occupiedMetaLabel,
    orderTotal,
  } = data;

  const shapeDef =
    TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES] ||
    TABLE_SHAPES["square-4"];
  const TableComponent = shapeDef?.component;

  return (
    <>
      {TableComponent ? (
        <TableComponent
          darkMode={isDarkColorScheme}
          color={isTableType ? tableColor : colors.label}
          {...(isTableType && { chairColor: tableColor })}
          {...(table.shape_id === "label-text" && { label: table.name })}
          {...(isWall && resolvedWallEdgeFlags)}
          width={effectiveWidth}
          height={effectiveHeight}
        />
      ) : (
        <View
          style={{
            width: effectiveWidth,
            height: effectiveHeight,
            backgroundColor: isTableType ? tableColor : colors.label,
            borderRadius: 16,
          }}
        />
      )}
      {/* Selection border — absolutely positioned so it never affects layout/size */}
      {isSelected && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -3,
            left: -3,
            right: -3,
            bottom: -3,
            borderWidth: 2,
            borderColor: colors.info,
            borderRadius: 18,
          }}
        />
      )}

      {/* Drag-active border — yellow when user holds + starts dragging */}
      {isDragging && <DraggingBorder sharedValue={isDragging} />}

      {isLocked && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -8,
            left: -8,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Lock size={11} color={colors.label} />
        </View>
      )}

      {isSelected && isEditMode && isWall && wallResizeLeftGesture && (
        <GestureDetector gesture={wallResizeLeftGesture}>
          <View
            style={{
              position: "absolute",
              left: -10,
              top: effectiveHeight / 2 - 12,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: isLocked ? colors.muted : colors.info,
              borderWidth: 2,
              borderColor: colors.panel,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.onSolid,
              }}
            />
          </View>
        </GestureDetector>
      )}

      {isSelected && isEditMode && isWall && wallResizeRightGesture && (
        <GestureDetector gesture={wallResizeRightGesture}>
          <View
            style={{
              position: "absolute",
              right: -10,
              top: effectiveHeight / 2 - 12,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: isLocked ? colors.muted : colors.info,
              borderWidth: 2,
              borderColor: colors.panel,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.onSolid,
              }}
            />
          </View>
        </GestureDetector>
      )}

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: (effectiveWidth - textFit.contentWidth) / 2,
          top: (effectiveHeight - textFit.contentHeight) / 2,
          width: textFit.contentWidth,
          height: textFit.contentHeight,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 2,
          overflow: "hidden",
        }}
      >
        {isTableType && (
          <Text
            style={{
              fontSize: textFit.primary,
              fontWeight: "700",
              textAlign: "center",
              color: isDarkColorScheme ? tableColor : "#111827",
            }}
            numberOfLines={
              textFit.isCircleShape || textFit.usableMinDim < 95 ? 1 : 2
            }
            ellipsizeMode="tail"
          >
            {tableLabel}
          </Text>
        )}

        {isTableType &&
          textFit.showSecondaryMeta &&
          !textFit.compactMeta &&
          tableStatus === "available" &&
          !isReservedSoon && (
            <Text
              style={{
                color: isDarkColorScheme ? tableColor + "AA" : "#334155",
                fontSize: textFit.secondary,
                fontWeight: "600",
              }}
            >
              {table.capacity ||
                TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
                  ?.capacity ||
                0}{" "}
              SEATS
            </Text>
          )}

        {isTableType && reservationLabel && !isOccupiedWithReservationSoon && (
          <Text
            style={{
              color: tableColor + "CC",
              fontSize: textFit.secondary,
              fontWeight: "600",
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {reservationLabel}
          </Text>
        )}

        {isTableType && isOccupiedStatus && (
          <>
            {!effectiveOrder && liveSession?.order_id ? (
              !!occupiedMetaLabel &&
              !textFit.ultraCompact && (
                <Text
                  style={{
                    color: isDarkColorScheme ? tableColor + "CC" : "#334155",
                    fontSize: textFit.secondary,
                    fontWeight: "600",
                  }}
                  numberOfLines={1}
                >
                  {occupiedMetaLabel}
                </Text>
              )
            ) : (
              <>
                <Text
                  style={{
                    color: isDarkColorScheme ? "#FFFFFF" : "#111827",
                    fontSize: textFit.amount,
                    fontWeight: "700",
                    marginTop: textFit.compactMeta ? 1 : 2,
                  }}
                  numberOfLines={1}
                >
                  ${orderTotal.toFixed(2)}
                </Text>
                {!!occupiedMetaLabel && !textFit.ultraCompact && (
                  <Text
                    style={{
                      color: isDarkColorScheme ? tableColor + "CC" : "#334155",
                      fontSize: textFit.secondary,
                      fontWeight: "600",
                    }}
                    numberOfLines={1}
                  >
                    {occupiedMetaLabel}
                  </Text>
                )}
              </>
            )}
          </>
        )}

        {isTableType &&
          (tableStatus === "cleaning" || tableStatus === "closing") && (
            <BrushCleaning size={16} color={tableColor + "99"} />
          )}
      </View>

      {/* Server initials badge */}
      {serverInitials && (
        <View
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: isDarkColorScheme
              ? "rgba(0,0,0,0.6)"
              : "rgba(255,255,255,0.9)",
            borderWidth: 1,
            borderColor: (sectionColor ?? tableColor) + "99",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: isDarkColorScheme
                ? (sectionColor ?? tableColor)
                : "#111827",
              fontSize: 8,
              fontWeight: "700",
            }}
          >
            {serverInitials}
          </Text>
        </View>
      )}

      {/* Reservation badge */}
      {(isReservedSoon || isOccupiedWithReservationSoon) && (
        <ReservationBadge
          label={
            reservationCountdownLabel?.match(/(\d+)m/)?.[1]
              ? `R ${reservationCountdownLabel.match(/(\d+)m/)?.[1]}m`
              : "R"
          }
          urgent={isReservationUrgent}
        />
      )}

      {/* Tab (pre-auth) badge */}
      {activeTabAmount != null && (
        <View
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            paddingHorizontal: 4,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: "rgba(0,0,0,0.7)",
            borderWidth: 1,
            borderColor: colors.teal + "99",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: colors.teal,
              fontSize: 7,
              fontWeight: "700",
            }}
          >
            TAB ${activeTabAmount.toFixed(0)}
          </Text>
        </View>
      )}
    </>
  );
};

export default TableCardContent;
