import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import { Avatar } from './Avatar';
import { useUserInfo } from '../api/profile';
import { logout } from '../api/auth';
import { ReportIssueModal } from './ReportIssueModal';
import { DeleteAccountModal } from './DeleteAccountModal';
import { exportAccountData } from '../api/account';
import { saveTextToDownloads } from '../utils/saveToDownloads';

interface Props {
  onOpenProfile: () => void;
  onLoggedOut: () => void;
}

// Stand-in for calbook's dashboard shell header avatar + app-profile
// dropdown (dashboard.component.html / profile.component.html) — trimmed
// to what's actually wired up here: Profile, Report an issue, Export my
// data, Logout and Delete account. Privacy Policy/Terms of Service are
// left out
// too since there's no confirmed production web URL in this codebase to
// link to (config/app.php's frontend_url defaults to localhost:4200).
export function ProfileMenu({ onOpenProfile, onLoggedOut }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const userInfo = useUserInfo();
  // Only for the dev-only model test below, which isn't worth threading
  // another callback through every dashboard screen for.
  const navigation = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  // Like the web, which downloads calbook-my-data-<date>.json: the same
  // file, saved to the phone's Downloads folder. The menu stays open
  // showing progress, since the export can take a moment.
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportAccountData();
      // The web's name plus the local time: Android renames a second
      // export on the same day to "… (1).json", which wouldn't match the
      // name in the confirmation.
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fileName = `calbook-my-data-${now.getFullYear()}-${pad(
        now.getMonth() + 1,
      )}-${pad(now.getDate())}-${pad(now.getHours())}${pad(
        now.getMinutes(),
      )}.json`;
      await saveTextToDownloads(
        fileName,
        JSON.stringify(data, null, 2),
        'application/json',
      );
      // Shown over the still-open menu, which closes with it: an alert
      // raised while the menu's Modal is closing goes away with the Modal
      // on Android, before it's ever seen.
      Alert.alert(
        t('MOBILE.PROFILE_MENU.EXPORTED_TITLE'),
        t('MOBILE.PROFILE_MENU.EXPORTED_MESSAGE', { fileName }),
        [{ text: t('MOBILE.COMMON.OK'), onPress: closeMenu }],
        { cancelable: true, onDismiss: closeMenu },
      );
    } catch (err: any) {
      Alert.alert(
        t('MOBILE.PROFILE_MENU.EXPORT_FAILED_TITLE'),
        err?.message ?? t('PROFILE.EDIT.EXPORT_FAILED'),
      );
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = async () => {
    closeMenu();
    await logout();
    onLoggedOut();
  };

  return (
    <>
      <Pressable onPress={() => setMenuOpen(true)} hitSlop={6}>
        <Avatar
          email={userInfo?.email ?? ''}
          imageUrl={userInfo?.profile_picture}
          size={34}
        />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <Pressable style={styles.menu} onPress={() => {}}>
            <Text style={styles.name} numberOfLines={1}>
              {userInfo?.name || t('PROFILE.MENU.NO_NAME')}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {userInfo?.email ?? ''}
            </Text>
            <View style={styles.divider} />

            <Pressable
              style={styles.item}
              onPress={() => {
                closeMenu();
                onOpenProfile();
              }}
            >
              <Text style={styles.itemText}>{t('PROFILE.MENU.PROFILE')}</Text>
            </Pressable>

            <Pressable
              style={styles.item}
              onPress={() => {
                closeMenu();
                setReportOpen(true);
              }}
            >
              <Text style={styles.itemText}>
                {t('PROFILE.MENU.REPORT_ISSUE')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.item, styles.itemRow]}
              onPress={handleExport}
              disabled={exporting}
            >
              <Text style={[styles.itemText, exporting && styles.mutedText]}>
                {exporting
                  ? t('PROFILE.MENU.EXPORTING')
                  : t('PROFILE.MENU.EXPORT_MY_DATA')}
              </Text>
              {exporting && (
                <ActivityIndicator size="small" color={colors.primaryText} />
              )}
            </Pressable>

            {__DEV__ && (
              <Pressable
                style={styles.item}
                onPress={() => {
                  closeMenu();
                  navigation.navigate('ModelTest');
                }}
              >
                <Text style={styles.itemText}>Model test (dev)</Text>
              </Pressable>
            )}

            <View style={styles.divider} />

            <Pressable style={styles.item} onPress={handleLogout}>
              <Text style={styles.itemText}>{t('PROFILE.MENU.LOGOUT')}</Text>
            </Pressable>

            <Pressable
              style={styles.item}
              onPress={() => {
                closeMenu();
                setDeleteOpen(true);
              }}
            >
              <Text style={[styles.itemText, styles.dangerText]}>
                {t('MOBILE.DELETE_ACCOUNT.DELETE_BUTTON')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ReportIssueModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      <DeleteAccountModal
        visible={deleteOpen}
        email={userInfo?.email ?? ''}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          onLoggedOut();
        }}
      />
    </>
  );
}

const useStyles = makeStyles(c => ({
  backdrop: {
    flex: 1,
    backgroundColor: c.backdropLight,
    alignItems: 'flex-end',
  },
  menu: {
    marginTop: 56,
    marginRight: 20,
    width: 220,
    backgroundColor: c.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
  },
  email: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: c.borderSoft,
    marginVertical: 10,
  },
  item: {
    paddingVertical: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mutedText: {
    color: c.textMuted,
  },
  dangerText: {
    color: c.danger,
  },
  itemText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: c.text,
  },
}));
