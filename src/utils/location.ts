export interface LocationDisplay {
  label: string;
  initial: string;
}

const LOCATIONS: Record<string, LocationDisplay> = {
  'Google Meet': { label: 'Google Meet', initial: 'G' },
  Zoom: { label: 'Zoom', initial: 'Z' },
  'Microsoft Teams': { label: 'Microsoft Teams', initial: 'T' },
  Slack: { label: 'Slack', initial: 'S' },
};

export function getMeetingLocation(
  value: string | undefined | null,
): LocationDisplay {
  if (!value) {
    return LOCATIONS['Google Meet'];
  }
  return (
    LOCATIONS[value] ?? {
      label: value,
      initial: value[0]?.toUpperCase() ?? '?',
    }
  );
}
