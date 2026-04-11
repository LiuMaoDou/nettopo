import { Line, register, ExtensionCategory } from '@antv/g6';
import type { Group } from '@antv/g';
// @ts-expect-error — internal G6 utility, no public type declaration
import { getLabelPositionStyle } from '@antv/g6/lib/utils/edge';
// @ts-expect-error — internal G6 shape, no public type declaration
import { Label } from '@antv/g6/lib/elements/shapes';

/**
 * Extended edge style props: adds startLabelText / endLabelText
 * rendered near each endpoint, independent of the center label.
 */
export interface PortLabelEdgeStyleProps {
  startLabelText?: string;
  endLabelText?: string;
  // inherits all BaseEdgeStyleProps via Line
  [key: string]: unknown;
}

/**
 * Custom G6 edge that draws two extra label shapes — one near the source
 * node (startLabelText) and one near the target node (endLabelText) —
 * in addition to the standard center label.
 */
class PortLabelEdge extends Line {
  /**
   * Override drawLabelShape to also draw source-port and target-port labels.
   */
  override drawLabelShape(
    attributes: Record<string, unknown>,
    container: Group,
  ): void {
    // Draw the standard center label first
    super.drawLabelShape(attributes as Parameters<typeof super.drawLabelShape>[0], container);

    const key = (this as unknown as { shapeMap: Record<string, unknown> }).shapeMap?.key;
    if (!key) return;

    const baseFontSize   = 9;
    const baseFill       = '#94a3b8';
    const bgFill         = '#0f172a';
    const bgOpacity      = 0.78;
    const bgRadius       = 3;
    const bgPadding      = [2, 5, 2, 5];

    // ── Source port label (12 % from source end) ───────────────────────────
    const srcText = attributes.startLabelText as string | undefined;
    if (srcText) {
      const posStyle = getLabelPositionStyle(key, 0.22, false, 0, -10);
      this.upsert('start-label', Label, {
        ...posStyle,
        text:              srcText,
        fontSize:          baseFontSize,
        fill:              baseFill,
        background:        true,
        backgroundFill:    bgFill,
        backgroundOpacity: bgOpacity,
        backgroundRadius:  bgRadius,
        backgroundPadding: bgPadding,
        zIndex:            1,
      }, container);
    } else {
      // Remove shape if no text
      this.upsert('start-label', Label, false, container);
    }

    // ── Target port label (88 % from source end = near target) ─────────────
    const dstText = attributes.endLabelText as string | undefined;
    if (dstText) {
      const posStyle = getLabelPositionStyle(key, 0.78, false, 0, -10);
      this.upsert('end-label', Label, {
        ...posStyle,
        text:              dstText,
        fontSize:          baseFontSize,
        fill:              baseFill,
        background:        true,
        backgroundFill:    bgFill,
        backgroundOpacity: bgOpacity,
        backgroundRadius:  bgRadius,
        backgroundPadding: bgPadding,
        zIndex:            1,
      }, container);
    } else {
      this.upsert('end-label', Label, false, container);
    }
  }
}

/** Register once — safe to call multiple times (G6 deduplicates). */
export function registerPortLabelEdge(): void {
  register(ExtensionCategory.EDGE, 'port-label-edge', PortLabelEdge);
}
