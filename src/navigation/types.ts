import type { NavigatorScreenParams } from '@react-navigation/native';
import type { DashboardTab } from '../components/DashboardTabs';
import type { EventItem } from '../api/events';
import type { MeetingFormValues, Schedule } from '../api/meetings';

export type DashboardTabParamList = { [Tab in DashboardTab]: undefined };

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  Entry: undefined;
  Booking: { slug: string; id: string };
  TeamInvite: { token: string; action?: string };

  ResetPassword: { token?: string; email?: string } | undefined;
  Dashboard: NavigatorScreenParams<DashboardTabParamList>;
  EditEvent: { event: EventItem | null };
  EditMeeting: {
    schedule: Schedule | null;
    draft?: Partial<MeetingFormValues>;
  };
  TeamDetail: { teamId: string };
  ProfileEdit: undefined;
  ChangePassword: undefined;
  ModelTest: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
