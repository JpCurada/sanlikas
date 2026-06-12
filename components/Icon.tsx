import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';

export type IconName = keyof typeof Ionicons.glyphMap;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * The single icon wrapper for the app. All UI iconography goes through this
 * component — never emojis (playbook rule, carried over from LIKAS).
 */
export function Icon({ name, size = 20, color = '#1F2933', style }: IconProps) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
