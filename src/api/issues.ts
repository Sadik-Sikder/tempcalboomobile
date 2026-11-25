import { authFetch } from './http';

// Mirrors IssueReportController::store() and calbook's
// report-issue.component — the same option values the web's selects send.
// labelKey: the option's text in src/i18n.
export const ISSUE_TYPES = [
  { value: 'bug', labelKey: 'REPORT_ISSUE.TYPE_BUG' },
  { value: 'ui', labelKey: 'REPORT_ISSUE.TYPE_UI' },
  { value: 'performance', labelKey: 'REPORT_ISSUE.TYPE_PERFORMANCE' },
  { value: 'feature', labelKey: 'REPORT_ISSUE.TYPE_FEATURE' },
  { value: 'other', labelKey: 'REPORT_ISSUE.OTHER' },
] as const;

export const ISSUE_MODULES = [
  { value: 'dashboard', labelKey: 'REPORT_ISSUE.MODULE_DASHBOARD' },
  { value: 'calendar', labelKey: 'REPORT_ISSUE.MODULE_CALENDAR' },
  { value: 'events', labelKey: 'REPORT_ISSUE.MODULE_EVENTS' },
  { value: 'bookings', labelKey: 'REPORT_ISSUE.MODULE_BOOKINGS' },
  { value: 'notifications', labelKey: 'REPORT_ISSUE.MODULE_NOTIFICATIONS' },
  { value: 'profile', labelKey: 'REPORT_ISSUE.MODULE_PROFILE' },
  { value: 'authentication', labelKey: 'REPORT_ISSUE.MODULE_AUTHENTICATION' },
  { value: 'other', labelKey: 'REPORT_ISSUE.OTHER' },
] as const;

export type IssueType = (typeof ISSUE_TYPES)[number]['value'];
export type IssueModule = (typeof ISSUE_MODULES)[number]['value'];

// The web caps title/description in the form (100 / 2000); the backend's
// own limits (150 / 5000) are looser, so the web's are the ones to match.
export const ISSUE_TITLE_MAX = 100;
export const ISSUE_DESCRIPTION_MAX = 2000;
export const ISSUE_STEPS_MAX = 5000;
// Backend: `image|mimes:jpg,jpeg,png,webp|max:3072` (KB).
export const ISSUE_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
export const ISSUE_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export async function reportIssue(params: {
  type: IssueType;
  module: IssueModule;
  title: string;
  description: string;
  stepsToReproduce: string;
  attachment: { uri: string; name: string; type: string } | null;
}): Promise<void> {
  const payload = new FormData();
  payload.append('type', params.type);
  payload.append('module', params.module);
  payload.append('title', params.title);
  payload.append('description', params.description);
  if (params.stepsToReproduce) {
    payload.append('steps_to_reproduce', params.stepsToReproduce);
  }
  if (params.attachment) {
    // RN's FormData takes { uri, name, type } for a file part.
    payload.append('attachment', params.attachment as unknown as Blob);
  }

  const response = await authFetch('/issues', {
    method: 'POST',
    body: payload,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // Laravel validation puts the useful text under errors.<field>.
    const firstError = body?.errors
      ? (Object.values(body.errors)[0] as string[] | undefined)?.[0]
      : undefined;
    throw new Error(
      firstError ??
        body?.message ??
        'Failed to submit your issue report. Please try again.',
    );
  }
}
