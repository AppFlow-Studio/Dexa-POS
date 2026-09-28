import type { LucideIcon } from '@/lib/icons';
import { cssInterop } from 'nativewind';

export function iconWithClassName(icon: LucideIcon) {
cssInterop(icon, {
    className: {
    target: 'style',
    nativeStyleToProp: {
        color: true,
        opacity: true,
    },
    },
});
}