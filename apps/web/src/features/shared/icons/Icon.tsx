import type { CSSProperties, ReactNode, SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };
export interface IconDetail { detail: boolean; sparks: boolean }

// Two-tone palette sampled from the reference icon sheet. Ink follows currentColor;
// accent, soft, and paper are CSS variables so a context (e.g. a filled button)
// can collapse the icon to one colour.
export const accent: CSSProperties = { stroke: 'var(--icon-accent, #0e94f7)' };
export const accentFill: CSSProperties = { fill: 'var(--icon-accent, #0e94f7)' };
export const accentSolid: CSSProperties = { fill: 'var(--icon-accent, #0e94f7)', stroke: 'none' };
export const soft: CSSProperties = { fill: 'var(--icon-soft, #e2f3ff)' };
export const paper: CSSProperties = { fill: 'var(--icon-paper, #fff)' };
export const warm: CSSProperties = { stroke: 'var(--icon-warm, #fdc95a)' };
export const skin: CSSProperties = { fill: 'var(--icon-skin, #fde3c3)' };

/** Stroke weight in viewBox units, so rendered lines stay close to the reference at every size. */
export function strokeFor(size: number) { return size >= 56 ? 1.25 : size > 28 ? 1.5 : size > 16 ? 1.8 : 2; }

/** Three short dashes radiating from the top-right corner, drawn outside the 24px grid. */
export function Sparks({ tone = 'accent' }: { tone?: 'accent' | 'warm' }) {
  return <path style={tone === 'warm' ? warm : accent} d="M20.3 3.2l1.3-2.2M22 5.6l2.3-1M22.2 8.3l2.2.3"/>;
}

export function createIcon(name: string, draw: (detail: IconDetail) => ReactNode) {
  function Icon({ size = 24, className, ...props }: IconProps) {
    // Offset accent strokes read as noise below 18px; sparks only at illustration sizes.
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeFor(size)} strokeLinecap="round" strokeLinejoin="round" overflow="visible" aria-hidden="true" focusable="false" className={className ? `icon ${className}` : 'icon'} {...props}>{draw({ detail: size >= 18, sparks: size >= 30 })}</svg>;
  }
  Icon.displayName = name;
  return Icon;
}
