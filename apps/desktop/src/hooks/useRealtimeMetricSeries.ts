import { useCallback, useState } from "react";
import type { MetricEvent } from "../api/types";
import { appendMetricEventToSeries, type MetricSeriesState } from "../utils/metricSeries";

export function useRealtimeMetricSeries(maxPoints = 300) {
  const [seriesState, setSeriesState] = useState<MetricSeriesState>({});

  const append = useCallback(
    (event: MetricEvent) => {
      setSeriesState((current) => appendMetricEventToSeries(current, event, { maxPoints }));
    },
    [maxPoints]
  );

  const clear = useCallback(() => {
    setSeriesState({});
  }, []);

  return {
    seriesState,
    append,
    clear
  };
}
