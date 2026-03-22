const ARABIC_DIACRITICS_REGEX = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;

const normalizeArabicLetterVariants = (value: string) =>
  value
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '');

const boundedLevenshteinDistance = (left: string, right: string, limit: number) => {
  if (left === right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  if (Math.abs(left.length - right.length) > limit) return limit + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let minInRow = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const nextValue = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost
      );
      current.push(nextValue);
      if (nextValue < minInRow) minInRow = nextValue;
    }

    if (minInRow > limit) return limit + 1;
    previous = current;
  }

  return previous[right.length];
};

export const normalizeEntityNameKey = (value: unknown) =>
  normalizeArabicLetterVariants(
    String(value ?? '')
      .normalize('NFKC')
      .replace(ARABIC_DIACRITICS_REGEX, '')
  )
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const tokenizeEntityName = (value: unknown) =>
  normalizeEntityNameKey(value)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 2);

const sharedPrefixLength = (left: string, right: string) => {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) index += 1;
  return index;
};

export const areEntityNamesSimilar = (candidate: unknown, existing: unknown) => {
  const left = normalizeEntityNameKey(candidate);
  const right = normalizeEntityNameKey(existing);

  if (!left || !right || left === right) return false;

  const shorterLength = Math.min(left.length, right.length);
  const longerLength = Math.max(left.length, right.length);
  if (shorterLength < 4) return false;

  if (shorterLength >= 6 && (left.includes(right) || right.includes(left))) {
    return true;
  }

  const leftTokens = tokenizeEntityName(left);
  const rightTokens = tokenizeEntityName(right);
  if (leftTokens.length > 1 || rightTokens.length > 1) {
    const rightTokenSet = new Set(rightTokens);
    const overlapCount = leftTokens.filter(token => rightTokenSet.has(token)).length;
    const overlapRatio = overlapCount / Math.max(1, Math.min(leftTokens.length, rightTokens.length));
    if ((overlapCount >= 2 && overlapRatio >= 0.5) || overlapRatio >= 0.8) {
      return true;
    }
  }

  const maxDistance = longerLength <= 12 ? 1 : 2;
  if (sharedPrefixLength(left, right) < Math.max(3, shorterLength - maxDistance - 1)) {
    return false;
  }

  return boundedLevenshteinDistance(left, right, maxDistance) <= maxDistance;
};

export const buildSuggestedUniqueEntityName = (
  baseName: string,
  existingNames: Iterable<string>,
  suffixLabel: string
) => {
  const trimmedBaseName = String(baseName || '').trim();
  const fallbackBaseName = trimmedBaseName || suffixLabel;
  const normalizedExistingNames = new Set(
    Array.from(existingNames, name => normalizeEntityNameKey(name)).filter(Boolean)
  );

  let counter = 1;
  let suggestion = `${fallbackBaseName} (${suffixLabel})`;

  while (normalizedExistingNames.has(normalizeEntityNameKey(suggestion))) {
    counter += 1;
    suggestion = `${fallbackBaseName} (${suffixLabel} ${counter})`;
  }

  return suggestion;
};
