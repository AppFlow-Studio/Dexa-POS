import { colors } from '@/lib/theme';
import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Check, ChevronUp, ChevronDown } from 'lucide-react-native';
import { cn } from '@/lib/utils';

export type SortOption = 'time' | 'name' | 'guests' | 'total';
export type SortDirection = 'asc' | 'desc';

interface SortDropdownProps {
  sortOption: SortOption;
  sortDirection: SortDirection;
  onSortChange: (option: SortOption, direction: SortDirection) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  triggerPosition: { x: number; y: number; width: number; height: number };
}

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'time', label: 'Time Seated' },
  { key: 'name', label: 'Table Name' },
  { key: 'guests', label: 'Guest Count' },
  { key: 'total', label: 'Order Total' },
];

const SortDropdown: React.FC<SortDropdownProps> = ({
  sortOption,
  sortDirection,
  onSortChange,
  isOpen,
  setIsOpen,
  triggerPosition,
}) => {
  const currentSortLabel = SORT_OPTIONS.find(o => o.key === sortOption)?.label || 'Time Seated';

  return (
    <>
      <Text className="font-medium text-blue-400">{currentSortLabel}</Text>
      {sortDirection === 'asc' ? <ChevronUp size={14} color={colors.info} /> : <ChevronDown size={14} color={colors.info} />}

      <Modal
        transparent={true}
        visible={isOpen}
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setIsOpen(false)}>
          <View 
            style={{ 
              position: 'absolute', 
              top: triggerPosition.y + triggerPosition.height, 
              left: triggerPosition.x,
              width: triggerPosition.width,
            }} 
            className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl"
          >
            {SORT_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  const newDirection = sortOption === key ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'desc';
                  onSortChange(key, newDirection);
                  setIsOpen(false);
                }}
                className="p-2 flex-row items-center justify-between"
              >
                <Text className={cn("text-white", { 'font-bold': sortOption === key })}>{label}</Text>
                {sortOption === key && (
                  sortDirection === 'asc' ? <ChevronUp size={16} color="white" /> : <ChevronDown size={16} color="white" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export default SortDropdown;
