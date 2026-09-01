import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color: string;
}

export function CameraIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={6.5} width={19} height={12} rx={3} stroke={color} strokeWidth={1.4} />
      <Path d="M8.5 6.5l1.4-2.2h4.2l1.4 2.2" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Circle cx={12} cy={12.5} r={3.2} stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

export function HistoryIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.4} />
      <Path d="M12 7.5V12l3.2 2" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

export function SetupIcon({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8h16M4 16h16" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Circle cx={9.5} cy={8} r={2.3} stroke={color} strokeWidth={1.4} />
      <Circle cx={15} cy={16} r={2.3} stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 9, color }: IconProps) {
  const h = size * (6 / 9);
  return (
    <Svg width={size} height={h} viewBox="0 0 10 6" fill="none">
      <Path d="M1 1l4 4 4-4" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 7, color }: IconProps) {
  const h = size * (12 / 7);
  return (
    <Svg width={size} height={h} viewBox="0 0 7 12" fill="none">
      <Path d="M1 1l5 5-5 5" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

export function ShieldCheckIcon({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l7 3v6c0 4.2-2.9 7.5-7 9-4.1-1.5-7-4.8-7-9V6l7-3z" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M9 12.5l2 2 4-4" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PlayIcon({ size = 16, color }: IconProps) {
  const h = size * (18 / 16);
  return (
    <Svg width={size} height={h} viewBox="0 0 16 18" fill="none">
      <Path d="M2 1.5l12 7.5-12 7.5V1.5z" fill={color} />
    </Svg>
  );
}
