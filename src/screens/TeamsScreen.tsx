import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import LinearGradient from 'react-native-linear-gradient';
import { DashboardTabs, type DashboardTab } from '../components/DashboardTabs';
import { createTeam, getTeams, type Team } from '../api/teams';
import { avatarColorForLetter } from '../utils/avatarColor';
import { TopBarActions } from '../components/TopBarActions';
import { createModuleCache, useCachedState } from '../utils/cachedState';
import { useRefreshOnFocus } from '../navigation/useRefreshOnFocus';

interface Props {
  onBack: () => void;
  onLoggedOut: () => void;
  onNavigate: (tab: DashboardTab) => void;
  onOpenProfile: () => void;
  onOpenTeam: (team: Team) => void;
}

const ROLE_KEYS: Record<string, string> = {
  owner: 'TEAM.ROLE_OWNER',
  admin: 'TEAM.ROLE_ADMIN',
  member: 'TEAM.ROLE_MEMBER',
};

const teamsCache = createModuleCache<Team[]>([]);
const loadedOnceCache = createModuleCache(false);

export function TeamsScreen({
  onBack,
  onLoggedOut,
  onNavigate,
  onOpenProfile,
  onOpenTeam,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [teams, setTeams] = useCachedState(teamsCache);
  const [loadedOnce, setLoadedOnce] = useCachedState(loadedOnceCache);
  const [loading, setLoading] = useState(!loadedOnce);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // The cached list shows instantly on mount (and after sign-in, the
  // first time), then a quiet refetch self-corrects it.
  const loadTeams = useCallback(() => {
    getTeams()
      .then(result => {
        setTeams(result);
        setLoadedOnce(true);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [setTeams, setLoadedOnce]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // Back from Team Detail (renamed, members changed, left the team).
  useRefreshOnFocus(loadTeams);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const team = await createTeam(name);
      setTeams(prev => [team, ...prev]);
      setShowCreate(false);
      setNewName('');
    } catch (err: any) {
      Alert.alert(
        t('MOBILE.TEAMS.CREATE_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>
            {'‹'} {t('MOBILE.COMMON.BACK')}
          </Text>
        </Pressable>
        <TopBarActions
          onOpenProfile={onOpenProfile}
          onLoggedOut={onLoggedOut}
          onOpenNotifications={() => onNavigate('notifications')}
        />
      </View>

      <View style={styles.tabsRow}>
        <DashboardTabs active="teams" onChange={onNavigate} />
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('NAV.TEAMS')}</Text>
        <Pressable onPress={() => setShowCreate(true)}>
          <Text style={styles.newTeamLink}>{t('MOBILE.TEAMS.NEW_LINK')}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Text style={styles.emptyText}>{t('TEAM.EMPTY_TITLE')}</Text>
              <Pressable
                style={styles.emptyCreateButton}
                onPress={() => setShowCreate(true)}
              >
                <Text style={styles.emptyCreateButtonText}>
                  {t('MOBILE.TEAMS.CREATE_FIRST')}
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={() => onOpenTeam(item)}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: avatarColorForLetter(
                      item.name.charAt(0) || '?',
                    ),
                  },
                ]}
              >
                <Text style={styles.avatarText}>
                  {(item.name.charAt(0) || '?').toUpperCase()}
                </Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {item.members_count ?? 0}{' '}
                  {item.members_count === 1
                    ? t('TEAM.MEMBER_SINGULAR')
                    : t('TEAM.MEMBER_PLURAL')}
                </Text>
              </View>
              {!!item.role && (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {ROLE_KEYS[item.role] ? t(ROLE_KEYS[item.role]) : item.role}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        />
      )}

      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t('SHELL.NEW_TEAM')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('SHELL.TEAM_NAME_PLACEHOLDER')}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <Pressable
              onPress={handleCreate}
              disabled={creating || !newName.trim()}
            >
              <LinearGradient
                colors={gradients.primary}
                style={[
                  styles.createButton,
                  (creating || !newName.trim()) && { opacity: 0.6 },
                ]}
              >
                {creating ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.createButtonText}>
                    {t('SHELL.CREATE_TEAM_BUTTON')}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  container: {
    flex: 1,
    backgroundColor: c.surface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  back: {
    alignSelf: 'center',
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  tabsRow: {
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
  },
  newTeamLink: {
    color: c.primaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: c.textMuted,
  },
  emptyCreateButton: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: c.primary,
  },
  emptyCreateButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 13.5,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderSoft,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  // Immediate feedback on touch, before the sheet / next screen opens.
  cardPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: c.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: c.surfaceMuted,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.text,
  },
  backdrop: {
    flex: 1,
    backgroundColor: c.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: c.text,
  },
  createButton: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14.5,
  },
}));
