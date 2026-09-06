import { useMemo } from "react";
import { ApiErrorView } from "../../components/ApiErrorView";
import { PlatformGlyph } from "../../components/PlatformGlyph";
import { SessionStatusBadge } from "../../components/SessionStatusBadge";
import { navigateTo } from "../../app/routes";
import { useDevices } from "../../hooks/useDevices";
import { useSessionHistory } from "../../hooks/useSessionHistory";
import { useI18n } from "../../i18n/I18nProvider";
import { saveLastSession } from "../../state/sessionPersistence";
import { visibleUserDevices } from "../../utils/devices";
import { formatDuration } from "../../utils/format";
import brandIcon from "../../assets/lumatrace-mark.png";

const homePlatforms = ["windows", "android"] as const;

function coerceProfileName(
  value: string | undefined
): "stable_60fps" | "janky_game" | "memory_growth" {
  if (value === "stable_60fps" || value === "memory_growth") {
    return value;
  }
  return "janky_game";
}

export function DashboardPage() {
  const { t } = useI18n();
  const devicesState = useDevices();
  const history = useSessionHistory(20);
  const visibleDevices = useMemo(() => visibleUserDevices(devicesState.data), [devicesState.data]);

  function resumeSession(item: (typeof history.items)[number]): void {
    saveLastSession({
      lastSessionId: item.sessionId,
      deviceId: item.deviceId,
      targetId: item.targetId,
      sessionName: item.name,
      profileName: coerceProfileName(item.profileName),
      sampleIntervalMs: 100,
      lastKnownStatus: item.status,
      updatedAt: Date.now()
    });
    navigateTo(`/session?sessionId=${encodeURIComponent(item.sessionId)}`);
  }

  return (
    <div className="page launch-page">
      <header className="launch-hero">
        <div className="launch-hero__copy">
          <span className="launch-hero__badge">
            <i aria-hidden="true" />
            {t("dashboard.simpleEyebrow")}
          </span>
          <h1>{t("dashboard.title")}</h1>
          <p>{t("dashboard.subtitle")}</p>
          <button className="button launch-button" type="button" onClick={() => navigateTo("/session")}>
            {t("guide.primaryAction")}
            <span aria-hidden="true">↗</span>
          </button>
          <div className="launch-hero__meta">
            <span>{t("dashboard.metaLocal")}</span>
            <span>{t("dashboard.metaPrivate")}</span>
            <span>{t("dashboard.metaReport")}</span>
          </div>
        </div>
        <div className="launch-visual" aria-hidden="true">
          <div className="launch-visual__grid" />
          <svg className="launch-visual__wave" viewBox="0 0 420 180">
            <defs>
              <linearGradient id="launchWave" x1="0" x2="1">
                <stop offset="0" stopColor="#39efd7" stopOpacity="0" />
                <stop offset=".18" stopColor="#39efd7" />
                <stop offset=".78" stopColor="#7dd3fc" />
                <stop offset="1" stopColor="#7dd3fc" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 112 C34 112 45 108 66 110 S101 125 122 107 153 57 176 102 207 141 232 94 263 69 286 100 322 124 345 95 378 83 420 91" />
          </svg>
          <div className="launch-visual__core">
            <img alt="" src={brandIcon} />
          </div>
          <span className="launch-orbit launch-orbit--fps">FPS</span>
          <span className="launch-orbit launch-orbit--cpu">CPU</span>
          <span className="launch-orbit launch-orbit--memory">MEM</span>
        </div>
      </header>

      <section className="platform-launcher">
        <div className="platform-launcher__heading">
          <h2>{t("dashboard.choosePlatform")}</h2>
          <span>{t("dashboard.platformCount")}</span>
        </div>
        {devicesState.error !== null ? <ApiErrorView error={devicesState.error} /> : null}
        <div className="platform-launcher__grid">
          {homePlatforms.map((platform) => {
            const available = visibleDevices.some((device) => device.platform === platform);
            const title =
              platform === "windows"
                ? t("session.platformWindowsTitle")
                : t("session.platformAndroidTitle");
            const short =
              platform === "windows"
                ? t("dashboard.platformWindowsShort")
                : t("dashboard.platformAndroidShort");
            return (
              <button
                aria-label={`${title} · ${short}`}
                className={`platform-launch-card platform-launch-card--${platform}`}
                key={platform}
                type="button"
                onClick={() => navigateTo(`/session?platform=${platform}`)}
              >
                <span className="platform-launch-card__icon">
                  <PlatformGlyph platform={platform} />
                </span>
                <span className="platform-launch-card__copy">
                  <strong>{title}</strong>
                  <small>{short}</small>
                </span>
                <span className={`platform-launch-card__status ${available ? "is-ready" : ""}`}>
                  <i aria-hidden="true" />
                  {available ? t("session.platformAvailable") : t("session.platformUnavailable")}
                </span>
                <span className="platform-launch-card__arrow" aria-hidden="true">→</span>
              </button>
            );
          })}
        </div>
      </section>

      {history.items.length > 0 ? (
        <section className="recent-launches">
          <div className="recent-launches__heading">
            <h2>{t("dashboard.recentSessions")}</h2>
            <button className="text-button" type="button" onClick={() => navigateTo("/report")}>
              {t("dashboard.viewAllReports")}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="recent-launches__list">
            {history.items.slice(0, 2).map((item) => (
              <div className="recent-launch" key={item.sessionId}>
                <button type="button" onClick={() => resumeSession(item)}>
                  <span className="recent-launch__mark" aria-hidden="true" />
                  <span>
                    <strong>{item.targetName ?? item.name}</strong>
                    <small>
                      {item.startedAt !== undefined && item.endedAt !== undefined
                        ? formatDuration(item.endedAt - item.startedAt)
                        : t("dashboard.readyToResume")}
                    </small>
                  </span>
                </button>
                <SessionStatusBadge status={item.status} />
                <a href={`/report?sessionId=${encodeURIComponent(item.sessionId)}`} aria-label={t("history.viewReport")}>
                  ↗
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
