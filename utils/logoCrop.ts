export type LogoCropImageSize = {
  width: number;
  height: number;
};

export type LogoCropOffset = {
  x: number;
  y: number;
};

export type LogoCropDrawRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), max)
);

const normalizeZero = (value: number): number => (
  Object.is(value, -0) ? 0 : value
);

const normalizePositiveNumber = (value: number, fallback: number): number => (
  Number.isFinite(value) && value > 0 ? value : fallback
);

export const getLogoScaledSize = (
  frameSize: number,
  imageSize: LogoCropImageSize,
  zoom = 1
): Pick<LogoCropDrawRect, 'width' | 'height'> => {
  const normalizedFrameSize = normalizePositiveNumber(frameSize, 1);
  const normalizedImageWidth = normalizePositiveNumber(imageSize.width, normalizedFrameSize);
  const normalizedImageHeight = normalizePositiveNumber(imageSize.height, normalizedFrameSize);
  const normalizedZoom = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  const baseScale = Math.min(
    normalizedFrameSize / normalizedImageWidth,
    normalizedFrameSize / normalizedImageHeight
  );

  return {
    width: normalizedImageWidth * baseScale * normalizedZoom,
    height: normalizedImageHeight * baseScale * normalizedZoom
  };
};

export const clampLogoOffset = (
  frameSize: number,
  imageSize: LogoCropImageSize,
  zoom: number,
  offset: LogoCropOffset
): LogoCropOffset => {
  const normalizedFrameSize = normalizePositiveNumber(frameSize, 1);
  const scaledSize = getLogoScaledSize(normalizedFrameSize, imageSize, zoom);
  const maxX = Math.max(0, (scaledSize.width - normalizedFrameSize) / 2);
  const maxY = Math.max(0, (scaledSize.height - normalizedFrameSize) / 2);

  return {
    x: normalizeZero(clamp(Number.isFinite(offset.x) ? offset.x : 0, -maxX, maxX)),
    y: normalizeZero(clamp(Number.isFinite(offset.y) ? offset.y : 0, -maxY, maxY))
  };
};

export const getLogoCropDrawRect = (
  exportSize: number,
  frameSize: number,
  imageSize: LogoCropImageSize,
  zoom: number,
  offset: LogoCropOffset
): LogoCropDrawRect => {
  const normalizedExportSize = normalizePositiveNumber(exportSize, 1);
  const normalizedFrameSize = normalizePositiveNumber(frameSize, 1);
  const scaledSize = getLogoScaledSize(normalizedFrameSize, imageSize, zoom);
  const clampedOffset = clampLogoOffset(normalizedFrameSize, imageSize, zoom, offset);
  const scaleRatio = normalizedExportSize / normalizedFrameSize;
  const scaledWidth = scaledSize.width * scaleRatio;
  const scaledHeight = scaledSize.height * scaleRatio;

  return {
    x: ((normalizedExportSize - scaledWidth) / 2) + (clampedOffset.x * scaleRatio),
    y: ((normalizedExportSize - scaledHeight) / 2) + (clampedOffset.y * scaleRatio),
    width: scaledWidth,
    height: scaledHeight
  };
};
