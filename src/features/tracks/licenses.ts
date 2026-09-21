import { TrackLicense, TrackOrigin } from "@prisma/client";
import { z } from "zod";

export const trackLicenseSchema = z.nativeEnum(TrackLicense);
export const trackOriginSchema = z.nativeEnum(TrackOrigin);

const LEGACY_LICENSES: Record<string, TrackLicense> = {
  "": TrackLicense.ALL_RIGHTS_RESERVED,
  "ALL RIGHTS RESERVED": TrackLicense.ALL_RIGHTS_RESERVED,
  CC0: TrackLicense.CC0_1_0,
  "CC0 1.0": TrackLicense.CC0_1_0,
  "CC BY": TrackLicense.CC_BY_4_0,
  "CC BY 3.0": TrackLicense.CC_BY_3_0,
  "CC BY 4.0": TrackLicense.CC_BY_4_0,
  "CC BY-SA": TrackLicense.CC_BY_SA_4_0,
  "CC BY-SA 3.0": TrackLicense.CC_BY_SA_3_0,
  "CC BY-SA 4.0": TrackLicense.CC_BY_SA_4_0,
  "CC BY-ND": TrackLicense.CC_BY_ND_4_0,
  "CC BY-ND 3.0": TrackLicense.CC_BY_ND_3_0,
  "CC BY-ND 4.0": TrackLicense.CC_BY_ND_4_0,
  "CC BY-NC": TrackLicense.CC_BY_NC_4_0,
  "CC BY-NC 3.0": TrackLicense.CC_BY_NC_3_0,
  "CC BY-NC 4.0": TrackLicense.CC_BY_NC_4_0,
  "CC BY-NC-SA": TrackLicense.CC_BY_NC_SA_4_0,
  "CC BY-NC-SA 3.0": TrackLicense.CC_BY_NC_SA_3_0,
  "CC BY-NC-SA 4.0": TrackLicense.CC_BY_NC_SA_4_0,
  "CC BY-NC-ND": TrackLicense.CC_BY_NC_ND_4_0,
  "CC BY-NC-ND 3.0": TrackLicense.CC_BY_NC_ND_3_0,
  "CC BY-NC-ND 4.0": TrackLicense.CC_BY_NC_ND_4_0,
};

export function normalizeTrackLicense(value: unknown): TrackLicense {
  if (typeof value !== "string") return TrackLicense.ALL_RIGHTS_RESERVED;
  if (Object.values(TrackLicense).includes(value as TrackLicense)) {
    return value as TrackLicense;
  }

  return (
    LEGACY_LICENSES[value.toUpperCase().replace(/\s+/g, " ").trim()] ??
    TrackLicense.ALL_RIGHTS_RESERVED
  );
}

type LicenseDefinition = {
  label: string;
  url: string;
  allowDownload: boolean;
  allowRegularRadio: boolean;
  allowSafeRadio: boolean;
  mustRemainUnmodified: boolean;
};

const ccUrl = (path: string, version: "3.0" | "4.0") =>
  `https://creativecommons.org/licenses/${path}/${version}/`;

export const TRACK_LICENSES: Record<TrackLicense, LicenseDefinition> = {
  ALL_RIGHTS_RESERVED: {
    label: "All rights reserved",
    url: "https://en.wikipedia.org/wiki/All_rights_reserved",
    allowDownload: false,
    allowRegularRadio: false,
    allowSafeRadio: false,
    mustRemainUnmodified: false,
  },
  CC0_1_0: {
    label: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: true,
    mustRemainUnmodified: false,
  },
  CC_BY_3_0: {
    label: "CC BY 3.0",
    url: ccUrl("by", "3.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: true,
    mustRemainUnmodified: false,
  },
  CC_BY_4_0: {
    label: "CC BY 4.0",
    url: ccUrl("by", "4.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: true,
    mustRemainUnmodified: false,
  },
  CC_BY_SA_3_0: {
    label: "CC BY-SA 3.0",
    url: ccUrl("by-sa", "3.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: false,
  },
  CC_BY_SA_4_0: {
    label: "CC BY-SA 4.0",
    url: ccUrl("by-sa", "4.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: false,
  },
  CC_BY_ND_3_0: {
    label: "CC BY-ND 3.0",
    url: ccUrl("by-nd", "3.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: true,
  },
  CC_BY_ND_4_0: {
    label: "CC BY-ND 4.0",
    url: ccUrl("by-nd", "4.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: true,
  },
  CC_BY_NC_3_0: {
    label: "CC BY-NC 3.0",
    url: ccUrl("by-nc", "3.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: false,
  },
  CC_BY_NC_4_0: {
    label: "CC BY-NC 4.0",
    url: ccUrl("by-nc", "4.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: false,
  },
  CC_BY_NC_SA_3_0: {
    label: "CC BY-NC-SA 3.0",
    url: ccUrl("by-nc-sa", "3.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: false,
  },
  CC_BY_NC_SA_4_0: {
    label: "CC BY-NC-SA 4.0",
    url: ccUrl("by-nc-sa", "4.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: false,
  },
  CC_BY_NC_ND_3_0: {
    label: "CC BY-NC-ND 3.0",
    url: ccUrl("by-nc-nd", "3.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: true,
  },
  CC_BY_NC_ND_4_0: {
    label: "CC BY-NC-ND 4.0",
    url: ccUrl("by-nc-nd", "4.0"),
    allowDownload: true,
    allowRegularRadio: true,
    allowSafeRadio: false,
    mustRemainUnmodified: true,
  },
};

export function getTrackLicenseDefinition(license: TrackLicense) {
  return TRACK_LICENSES[license];
}

export function trackCanUseRadio(
  license: TrackLicense,
  safe: boolean,
) {
  const definition = getTrackLicenseDefinition(license);
  return safe ? definition.allowSafeRadio : definition.allowRegularRadio;
}
