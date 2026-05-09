export type Platform = "android" | "ios" | "windows" | "macos" | "linux";

export type ConnectionType = "usb" | "network" | "local";

export type MetricPrecision = "exact" | "estimated" | "device_level" | "unavailable";

export type MetricConfidence = "high" | "medium" | "low";

export type TagValue = string | number | boolean;

export type Tags = Record<string, TagValue>;
