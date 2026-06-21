import type { ChangeRegion, DiffMetadata } from "@cappa/core";

const region = (
  changeType: string,
  position: string,
  bbox: ChangeRegion["bbox"],
  percentage: number,
): ChangeRegion => ({
  bbox,
  pixelCount: Math.round((percentage / 100) * 1200 * 800),
  percentage,
  position,
  shape: "rectangle",
  shapeStats: {
    fillRatio: 0.8,
    borderRatio: 0.2,
    innerFillRatio: 0.7,
    centerDensity: 0.6,
    rowOccupancy: 0.9,
    colOccupancy: 0.9,
  },
  changeType,
  signals: {
    blendsWithBgInImg1: false,
    blendsWithBgInImg2: false,
    lowColorDelta: false,
    lowEdgeChange: false,
    denseFill: true,
    sparseFill: false,
    tinyRegion: false,
    edgesCorrelated: false,
    confidence: 0.9,
  },
  confidence: 0.9,
  colorDelta: { meanDelta: 40, maxDelta: 120, deltaStddev: 12 },
  gradient: { edgeScore: 0.5, edgeScoreImg2: 0.6, edgeCorrelation: 0.4 },
});

/** Sample interpretation used by the review UI mocks and Storybook stories. */
export const mockDiffMeta: DiffMetadata = {
  numDiffPixels: 17904,
  percentDifference: 1.87,
  interpretation: {
    summary:
      "Moderate visual change detected (1.87% of image, 3 regions). Content changed: 1 region (center). Content added: 1 region (right). Color change: 1 region (bottom-left).",
    diffCount: 17904,
    totalRegions: 3,
    severity: "Medium",
    diffPercentage: 1.87,
    width: 1200,
    height: 800,
    regions: [
      region(
        "ContentChange",
        "center",
        { x: 420, y: 300, width: 360, height: 200 },
        0.9,
      ),
      region(
        "Addition",
        "right",
        { x: 960, y: 120, width: 180, height: 140 },
        0.5,
      ),
      region(
        "ColorChange",
        "bottom-left",
        { x: 80, y: 600, width: 240, height: 140 },
        0.47,
      ),
    ],
  },
};
