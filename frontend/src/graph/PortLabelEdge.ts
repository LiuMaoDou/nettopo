import { Line, register, ExtensionCategory } from '@antv/g6';
import type { Group } from '@antv/g';
// @ts-expect-error — internal G6 utility, no public type declaration
import { getLabelPositionStyle } from '@antv/g6/lib/utils/edge';
// @ts-expect-error — internal G6 shape, no public type declaration
import { Label } from '@antv/g6/lib/elements/shapes';

/**
 * Extended edge style props: adds startLabelText / endLabelText (port+util, above edge)
 * and costStartLabelText / costEndLabelText (cost badge, below edge, amber colour).
 */
export interface PortLabelEdgeStyleProps {
  startLabelText?: string;
  endLabelText?: string;
  costStartLabelText?: string;
  costEndLabelText?: string;
  // inherits all BaseEdgeStyleProps via Line
  [key: string]: unknown;
}

/**
 * Custom G6 edge that draws two extra label shapes — one near the source
 * node (startLabelText) and one near the target node (endLabelText) —
 * in addition to the standard center label.
 */
/** Amber colour for cost badges — distinct from the gray port labels */
const COST_FILL = '#fbbf24';

class PortLabelEdge extends Line {
  /**
   * Override drawLabelShape to also draw:
   *  - source/target port labels (interface + util) ABOVE the edge in gray
   *  - source/target cost badges (c10) BELOW the edge in amber
   */
  override drawLabelShape(
    attributes: Record<string, unknown>,
    container: Group,
  ): void {
    // Draw the standard center label first
    super.drawLabelShape(attributes as Parameters<typeof super.drawLabelShape>[0], container);

    const key = (this as unknown as { shapeMap: Record<string, unknown> }).shapeMap?.key;
    if (!key) return;

    const baseFontSize   = 11;
    const baseFill       = '#94a3b8';
    const bgFill         = '#0f172a';
    const bgOpacity      = 0.78;
    const bgRadius       = 3;
    const bgPadding      = [2, 5, 2, 5];

    // ── Source port label — above edge (y = -10) ──────────────────────────
    const srcText = attributes.startLabelText as string | undefined;
    if (srcText) {
      const posStyle = getLabelPositionStyle(key, 0.22, false, 0, -10);
      this.upsert('start-label', Label, {
        ...posStyle, text: srcText, fontSize: baseFontSize,
        fill: baseFill, background: true,
        backgroundFill: bgFill, backgroundOpacity: bgOpacity,
        backgroundRadius: bgRadius, backgroundPadding: bgPadding, zIndex: 1,
      }, container);
    } else {
      this.upsert('start-label', Label, false, container);
    }

    // ── Target port label — above edge (y = -10) ──────────────────────────
    const dstText = attributes.endLabelText as string | undefined;
    if (dstText) {
      const posStyle = getLabelPositionStyle(key, 0.78, false, 0, -10);
      this.upsert('end-label', Label, {
        ...posStyle, text: dstText, fontSize: baseFontSize,
        fill: baseFill, background: true,
        backgroundFill: bgFill, backgroundOpacity: bgOpacity,
        backgroundRadius: bgRadius, backgroundPadding: bgPadding, zIndex: 1,
      }, container);
    } else {
      this.upsert('end-label', Label, false, container);
    }

    // ── Source cost badge — below edge (y = +10), amber ───────────────────
    const costSrcText = attributes.costStartLabelText as string | undefined;
    if (costSrcText) {
      const posStyle = getLabelPositionStyle(key, 0.22, false, 0, 10);
      this.upsert('cost-start-label', Label, {
        ...posStyle, text: costSrcText, fontSize: baseFontSize,
        fill: COST_FILL, background: true,
        backgroundFill: bgFill, backgroundOpacity: bgOpacity,
        backgroundRadius: bgRadius, backgroundPadding: bgPadding, zIndex: 1,
      }, container);
    } else {
      this.upsert('cost-start-label', Label, false, container);
    }

    // ── Target cost badge — below edge (y = +10), amber ───────────────────
    const costDstText = attributes.costEndLabelText as string | undefined;
    if (costDstText) {
      const posStyle = getLabelPositionStyle(key, 0.78, false, 0, 10);
      this.upsert('cost-end-label', Label, {
        ...posStyle, text: costDstText, fontSize: baseFontSize,
        fill: COST_FILL, background: true,
        backgroundFill: bgFill, backgroundOpacity: bgOpacity,
        backgroundRadius: bgRadius, backgroundPadding: bgPadding, zIndex: 1,
      }, container);
    } else {
      this.upsert('cost-end-label', Label, false, container);
    }
  }
}

/** Register once — safe to call multiple times (G6 deduplicates). */
export function registerPortLabelEdge(): void {
  register(ExtensionCategory.EDGE, 'port-label-edge', PortLabelEdge);
}
