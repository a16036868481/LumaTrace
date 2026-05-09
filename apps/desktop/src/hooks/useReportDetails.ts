import { useEffect, useMemo, useState } from "react";
import {
  exportSession,
  getDownsampledMetrics,
  getMarkers,
  getMetrics,
  getReport,
  getSession
} from "../api/endpoints";
import type {
  DownsampledMetricBucket,
  EventMarker,
  MetricEvent,
  Session,
  SessionReportResponse
} from "../api/types";
import { buildReportViewModel } from "../utils/reportViewModel";
import {
  buildDownsampledMetricPreview,
  buildRawMetricPreview,
  chooseReportBucketSizeMs,
  REPORT_MAX_DOWNSAMPLED_BUCKETS,
  REPORT_RAW_METRIC_LIMIT,
  type ReportMetricPreview,
  shouldUseDownsampledPreview
} from "../utils/reportMetricPreview";

interface JsonReportExport {
  markers?: EventMarker[];
  metrics?: MetricEvent[];
}

interface ReportMetricsLoadResult {
  metrics: MetricEvent[];
  metricPreview: ReportMetricPreview;
  downsampledBuckets: DownsampledMetricBucket[];
}

function parseJsonReport(value: string): JsonReportExport {
  try {
    const parsed = JSON.parse(value) as JsonReportExport;
    return parsed;
  } catch {
    return {};
  }
}

function isDownsampledMetricBucket(value: unknown): value is DownsampledMetricBucket {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sessionId?: unknown }).sessionId === "string" &&
    typeof (value as { metricName?: unknown }).metricName === "string" &&
    typeof (value as { bucketStartMs?: unknown }).bucketStartMs === "number" &&
    typeof (value as { bucketEndMs?: unknown }).bucketEndMs === "number" &&
    typeof (value as { count?: unknown }).count === "number"
  );
}

function isMetricEvent(value: unknown): value is MetricEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sessionId?: unknown }).sessionId === "string" &&
    typeof (value as { timestampMs?: unknown }).timestampMs === "number" &&
    typeof (value as { metricName?: unknown }).metricName === "string" &&
    "value" in value
  );
}

async function loadRawMetrics(sessionId: string): Promise<MetricEvent[]> {
  try {
    const items = await getMetrics(sessionId, { limit: REPORT_RAW_METRIC_LIMIT });
    if (!Array.isArray(items) || !items.every(isMetricEvent)) {
      throw new Error("Metrics response was not a MetricEvent array.");
    }
    return items;
  } catch {
    const json = parseJsonReport(await exportSession(sessionId, "json"));
    return Array.isArray(json.metrics)
      ? json.metrics.filter(isMetricEvent).slice(0, REPORT_RAW_METRIC_LIMIT)
      : [];
  }
}

async function loadMetricsWithPreview(
  sessionId: string,
  report: SessionReportResponse
): Promise<ReportMetricsLoadResult> {
  const rawMetrics = await loadRawMetrics(sessionId);
  const rawPreview = buildRawMetricPreview(rawMetrics, report.rawMetricCount);

  if (!shouldUseDownsampledPreview(report)) {
    return {
      metrics: rawMetrics,
      metricPreview: rawPreview,
      downsampledBuckets: []
    };
  }

  const bucketSizeMs = chooseReportBucketSizeMs(report);
  try {
    const buckets = await getDownsampledMetrics(sessionId, {
      bucketSizeMs,
      limit: REPORT_MAX_DOWNSAMPLED_BUCKETS
    });
    if (!Array.isArray(buckets) || !buckets.every(isDownsampledMetricBucket) || buckets.length === 0) {
      return {
        metrics: rawMetrics,
        metricPreview: rawPreview,
        downsampledBuckets: []
      };
    }
    return {
      metrics: rawMetrics,
      metricPreview: buildDownsampledMetricPreview(buckets, report.rawMetricCount, bucketSizeMs),
      downsampledBuckets: buckets
    };
  } catch {
    return {
      metrics: rawMetrics,
      metricPreview: rawPreview,
      downsampledBuckets: []
    };
  }
}

export function useReportDetails(sessionId: string) {
  const [report, setReport] = useState<SessionReportResponse | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [markers, setMarkers] = useState<EventMarker[]>([]);
  const [metrics, setMetrics] = useState<MetricEvent[]>([]);
  const [downsampledBuckets, setDownsampledBuckets] = useState<DownsampledMetricBucket[]>([]);
  const [metricPreview, setMetricPreview] = useState<ReportMetricPreview>(buildRawMetricPreview([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (sessionId.length === 0) {
      setReport(null);
      setSession(null);
      setMarkers([]);
      setMetrics([]);
      setDownsampledBuckets([]);
      setMetricPreview(buildRawMetricPreview([]));
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    getReport(sessionId)
      .then(async (nextReport) => {
        const [nextSession, nextMarkers, metricsResult] = await Promise.all([
          getSession(sessionId).catch(() => null),
          getMarkers(sessionId)
            .then((items) => {
              if (!Array.isArray(items)) {
                throw new Error("Markers response was not an array.");
              }
              return items;
            })
            .catch(async () => {
              const json = parseJsonReport(await exportSession(sessionId, "json"));
              return Array.isArray(json.markers) ? json.markers : [];
            }),
          loadMetricsWithPreview(sessionId, nextReport)
        ]);
        return {
          nextReport,
          nextSession,
          nextMarkers,
          metricsResult
        };
      })
      .then(({ nextReport, nextSession, nextMarkers, metricsResult }) => {
        if (!active) {
          return;
        }
        setReport(nextReport);
        setSession(nextSession);
        setMarkers(nextMarkers);
        setMetrics(metricsResult.metrics);
        setDownsampledBuckets(metricsResult.downsampledBuckets);
        setMetricPreview(metricsResult.metricPreview);
      })
      .catch((caught) => {
        if (active) {
          setError(caught);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  const viewModel = useMemo(() => {
    if (report === null) {
      return null;
    }
    return buildReportViewModel({
      summary: report.summary,
      markers,
      session,
      metrics
    });
  }, [markers, metrics, report, session]);

  return {
    report,
    session,
    markers,
    metrics,
    downsampledBuckets,
    metricPreview,
    viewModel,
    loading,
    error
  };
}
