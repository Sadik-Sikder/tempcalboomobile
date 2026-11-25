import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { gradients } from '../constants/colors';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import LinearGradient from 'react-native-linear-gradient';
import {
  deleteTeam,
  getTeamMembers,
  inviteMember,
  leaveTeam,
  transferOwnership,
  updateTeam,
  type TeamDetail,
  type TeamMember,
} from '../api/teams';

interface Props {
  teamId: string;
  onBack: () => void;
}

const ROLE_KEYS: Record<string, string> = {
  owner: 'TEAM.ROLE_OWNER',
  admin: 'TEAM.ROLE_ADMIN',
  member: 'TEAM.ROLE_MEMBER',
};

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function TeamDetailScreen({ teamId, onBack }: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviting, setInviting] = useState(false);
  const [leavingOrDeleting, setLeavingOrDeleting] = useState(false);
  const [transferringId, setTransferringId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getTeamMembers(teamId)
      .then(detail => {
        setTeam(detail);
        setNameInput(detail.name);
      })
      .catch(err =>
        Alert.alert(
          i18n.t('MOBILE.TEAM_DETAIL.LOAD_FAILED'),
          err?.message ?? i18n.t('AUTH.GENERIC_ERROR'),
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, [teamId]);

  const isOwner = team?.my_role === 'owner';

  const handleSaveName = async () => {
    if (!team) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === team.name) return;
    setSaving(true);
    try {
      await updateTeam(team.id, trimmed);
      setTeam(prev => (prev ? { ...prev, name: trimmed } : prev));
    } catch (err: any) {
      Alert.alert(
        t('MOBILE.TEAM_DETAIL.RENAME_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!team) return;
    const email = inviteEmail.trim();
    if (!EMAIL_RE.test(email)) {
      Alert.alert(
        t('MOBILE.COMMON.INVALID_EMAIL_TITLE'),
        t('AUTH.LOGIN.INVALID_EMAIL'),
      );
      return;
    }
    setInviting(true);
    try {
      await inviteMember(team.id, email, inviteRole);
      setInviteEmail('');
      Alert.alert(
        t('TEAM.INVITE_SUCCESS'),
        t('MOBILE.TEAM_DETAIL.INVITE_SENT_TO', { email }),
      );
    } catch (err: any) {
      Alert.alert(
        t('TEAM.INVITE_FAILED'),
        err?.message ?? t('AUTH.GENERIC_ERROR'),
      );
    } finally {
      setInviting(false);
    }
  };

  const handleMakeOwner = (member: TeamMember) => {
    if (!team) return;
    Alert.alert(
      t('TEAM.CONFIRM_TRANSFER_TITLE'),
      t('MOBILE.TEAM_DETAIL.TRANSFER_TEXT', {
        name: member.name,
        team: team.name,
      }),
      [
        { text: t('SHELL.CANCEL'), style: 'cancel' },
        {
          text: t('MOBILE.TEAM_DETAIL.TRANSFER'),
          style: 'destructive',
          onPress: async () => {
            setTransferringId(member.id);
            try {
              await transferOwnership(team.id, member.id);
              load();
            } catch (err: any) {
              Alert.alert(
                t('TEAM.TRANSFER_FAILED'),
                err?.message ?? t('AUTH.GENERIC_ERROR'),
              );
            } finally {
              setTransferringId(null);
            }
          },
        },
      ],
    );
  };

  const handleDeleteOrLeave = () => {
    if (!team) return;
    if (isOwner) {
      Alert.alert(
        t('MOBILE.TEAM_DETAIL.DELETE_TITLE'),
        t('MOBILE.COMMON.CANNOT_UNDO'),
        [
          { text: t('MOBILE.COMMON.KEEP_IT'), style: 'cancel' },
          {
            text: t('TEAM.MENU_DELETE'),
            style: 'destructive',
            onPress: async () => {
              setLeavingOrDeleting(true);
              try {
                await deleteTeam(team.id);
                onBack();
              } catch (err: any) {
                Alert.alert(
                  t('TEAM.DELETE_FAILED'),
                  err?.message ?? t('AUTH.GENERIC_ERROR'),
                );
                setLeavingOrDeleting(false);
              }
            },
          },
        ],
      );
    } else {
      Alert.alert(
        t('MOBILE.TEAM_DETAIL.LEAVE_TITLE'),
        t('MOBILE.TEAM_DETAIL.LEAVE_TEXT', { team: team.name }),
        [
          { text: t('MOBILE.TEAM_DETAIL.STAY'), style: 'cancel' },
          {
            text: t('TEAM.MENU_LEAVE'),
            style: 'destructive',
            onPress: async () => {
              setLeavingOrDeleting(true);
              try {
                await leaveTeam(team.id);
                onBack();
              } catch (err: any) {
                Alert.alert(
                  t('TEAM.LEAVE_FAILED'),
                  err?.message ?? t('AUTH.GENERIC_ERROR'),
                );
                setLeavingOrDeleting(false);
              }
            },
          },
        ],
      );
    }
  };

  if (loading || !team) {
    return (
      <View style={styles.container}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>
            {'‹'} {t('MOBILE.COMMON.BACK')}
          </Text>
        </Pressable>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primaryText} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>
          {'‹'} {t('MOBILE.COMMON.BACK')}
        </Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{team.name}</Text>
        <Text style={styles.subtitle}>
          {team.members_count ?? team.members.length}{' '}
          {(team.members_count ?? team.members.length) === 1
            ? t('TEAM.MEMBER_SINGULAR')
            : t('TEAM.MEMBER_PLURAL')}
        </Text>

        <Section label={t('TEAM.TEAM_NAME_LABEL')}>
          <TextInput
            style={styles.input}
            value={nameInput}
            onChangeText={setNameInput}
            editable={isOwner}
          />
          {isOwner && (
            <Pressable
              onPress={handleSaveName}
              disabled={
                saving || !nameInput.trim() || nameInput.trim() === team.name
              }
              style={{ marginTop: 10 }}
            >
              <View
                style={[
                  styles.secondaryButton,
                  (saving ||
                    !nameInput.trim() ||
                    nameInput.trim() === team.name) && {
                    opacity: 0.5,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    {t('MOBILE.COMMON.SAVE_CHANGES')}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
          {!isOwner && (
            <Text style={styles.helperText}>
              {t('MOBILE.TEAM_DETAIL.OWNER_ONLY_RENAME')}
            </Text>
          )}
        </Section>

        <Section label={t('TEAM.MEMBERS_TITLE')}>
          {team.members.map(member => {
            const memberIsOwner = member.id === team.owner?.id;
            return (
              <View key={member.id} style={styles.memberRow}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  {!!member.email && (
                    <Text style={styles.memberEmail}>{member.email}</Text>
                  )}
                </View>
                <View style={styles.memberRight}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>
                      {t(
                        ROLE_KEYS[
                          memberIsOwner ? 'owner' : member.role ?? 'member'
                        ] ?? ROLE_KEYS.member,
                      )}
                    </Text>
                  </View>
                  {isOwner && !memberIsOwner && (
                    <Pressable
                      onPress={() => handleMakeOwner(member)}
                      disabled={transferringId === member.id}
                      hitSlop={6}
                    >
                      <Text style={styles.makeOwnerLink}>
                        {transferringId === member.id
                          ? t('MOBILE.TEAM_DETAIL.TRANSFERRING')
                          : t('TEAM.MAKE_OWNER')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </Section>

        <Section label={t('MOBILE.TEAM_DETAIL.INVITE_MEMBER')}>
          <TextInput
            style={styles.input}
            placeholder="email@example.com"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <View style={styles.roleRow}>
            {(['member', 'admin'] as const).map(role => {
              if (role === 'admin' && !isOwner) return null;
              const selected = inviteRole === role;
              return (
                <Pressable
                  key={role}
                  onPress={() => setInviteRole(role)}
                  style={[styles.rolePill, selected && styles.rolePillSelected]}
                >
                  <Text
                    style={[
                      styles.rolePillText,
                      selected && styles.rolePillTextSelected,
                    ]}
                  >
                    {t(ROLE_KEYS[role])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={handleInvite}
            disabled={inviting}
            style={{ marginTop: 10 }}
          >
            <LinearGradient
              colors={gradients.primary}
              style={[styles.inviteButton, inviting && { opacity: 0.7 }]}
            >
              {inviting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.inviteButtonText}>{t('TEAM.INVITE')}</Text>
              )}
            </LinearGradient>
          </Pressable>
        </Section>

        <Pressable
          onPress={handleDeleteOrLeave}
          disabled={leavingOrDeleting}
          style={{ marginTop: 8 }}
        >
          <View
            style={[styles.dangerButton, leavingOrDeleting && { opacity: 0.6 }]}
          >
            <Text style={styles.dangerButtonText}>
              {isOwner ? t('TEAM.DELETE_TEAM') : t('TEAM.LEAVE_TEAM')}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  container: {
    flex: 1,
    backgroundColor: c.surface,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  backText: {
    color: c.primaryText,
    fontWeight: '600',
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
  },
  subtitle: {
    fontSize: 12.5,
    color: c.textMuted,
    marginTop: 2,
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    marginBottom: 10,
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
  helperText: {
    fontSize: 11.5,
    color: c.textMuted,
    marginTop: 6,
  },
  secondaryButton: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: c.primaryText,
    fontWeight: '600',
    fontSize: 13.5,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surfaceMuted,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  memberInfo: {
    flex: 1,
    marginRight: 8,
  },
  memberName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: c.text,
  },
  memberEmail: {
    fontSize: 11.5,
    color: c.textMuted,
    marginTop: 1,
  },
  memberRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.borderSoft,
  },
  roleBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: c.text,
  },
  makeOwnerLink: {
    fontSize: 11,
    fontWeight: '600',
    color: c.primaryText,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  rolePill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  rolePillSelected: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  rolePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: c.text,
  },
  rolePillTextSelected: {
    color: c.onPrimary,
  },
  inviteButton: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  dangerButton: {
    height: 46,
    borderRadius: 10,
    backgroundColor: c.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: c.dangerStrong,
    fontWeight: '700',
    fontSize: 14,
  },
}));
