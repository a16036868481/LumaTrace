export function finiteNumbers(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

export function sum(values: readonly number[]): number {
  return finiteNumbers(values).reduce((total, value) => total + value, 0);
}

export function average(values: readonly number[]): number | undefined {
  const finite = finiteNumbers(values);
  if (finite.length === 0) {
    return undefined;
  }

  return sum(finite) / finite.length;
}

export function minValue(values: readonly number[]): number | undefined {
  const finite = finiteNumbers(values);
  if (finite.length === 0) {
    return undefined;
  }

  return Math.min(...finite);
}

export function maxValue(values: readonly number[]): number | undefined {
  const finite = finiteNumbers(values);
  if (finite.length === 0) {
    return undefined;
  }

  return Math.max(...finite);
}

export function percentile(values: readonly number[], percentileValue: number): number | undefined {
  const sorted = [...finiteNumbers(values)].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return undefined;
  }

  if (percentileValue <= 0) {
    return sorted[0];
  }

  if (percentileValue >= 100) {
    return sorted[sorted.length - 1];
  }

  const rank = (percentileValue / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lowerValue = sorted[lowerIndex];
  const upperValue = sorted[upperIndex];

  if (lowerValue === undefined || upperValue === undefined) {
    return undefined;
  }

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  return lowerValue + (upperValue - lowerValue) * (rank - lowerIndex);
}

export function percentileMap(
  values: readonly number[],
  percentileValues: readonly number[]
): Record<number, number | undefined> {
  return Object.fromEntries(
    percentileValues.map((value) => [value, percentile(values, value)])
  ) as Record<number, number | undefined>;
}
