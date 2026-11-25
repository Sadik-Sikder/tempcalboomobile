import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReactNativeBlobUtil, {
  type StatefulPromise,
  type FetchBlobResponse,
} from 'react-native-blob-util';
import { initLlama, type LlamaContext } from 'llama.rn';
import dayjs from 'dayjs';
import { makeStyles, useTheme } from '../theme/ThemeContext';
import type { MeetingFormValues } from '../api/meetings';
import { useUserInfo, type UserInfo } from '../api/profile';
import {
  buildMeetingExtraction,
  toMeetingDraft,
  type ExtractedMeeting,
} from '../utils/meetingFromText';

interface Props {
  onBack: () => void;
  // Opens Create Meeting with these fields filled in.
  onUseDraft: (draft: Partial<MeetingFormValues>) => void;
}

// A developer-only playground for running a small LLM on the phone with
// llama.rn (llama.cpp): download the model once, load it, type a prompt,
// watch the answer stream in and see how fast it was. Nothing here talks
// to the Calbook backend; it's for finding out whether on-device models
// are fast enough on real phones before building a feature on one.
const MODEL = {
  name: 'Qwen2.5 0.5B Instruct (Q4_K_M)',
  url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  fileName: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  bytes: 491_400_032,
  // Hugging Face's X-Linked-Etag for the file, which is its SHA-256.
  sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
};

const { fs } = ReactNativeBlobUtil;
const MODEL_DIR = `${fs.dirs.DocumentDir}/models`;
const MODEL_PATH = `${MODEL_DIR}/${MODEL.fileName}`;
// Downloads land here first, so a half-finished file is never mistaken
// for the model.
const PART_PATH = `${MODEL_PATH}.part`;

// Qwen's end-of-turn markers.
const STOP_WORDS = ['<|im_end|>', '<|endoftext|>'];

type Phase =
  | 'checking'
  | 'missing'
  | 'downloading'
  | 'verifying'
  | 'downloaded'
  | 'loading'
  | 'ready';

// Chat: a conversation that knows who you are. Fill meeting: one message
// turned into Create Meeting fields (utils/meetingFromText).
type Mode = 'chat' | 'meeting';

const SAMPLE_PROMPTS: Record<Mode, string> = {
  chat: "Hi! What's my name, and what day is it today?",
  meeting:
    'Lunch with sam@example.com next Tuesday at 1pm for 45 minutes on Zoom',
};

interface Stats {
  tokens: number;
  tokensPerSecond: number;
  promptMs: number;
  // Prompt tokens read this time, and ones reused from the last run.
  promptTokens: number;
  cachedTokens: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// The model only knows what it's sent, and forgets it after every run, so
// each chat run sends this plus the conversation so far. It must come out
// the same turn after turn: llama.rn skips re-reading whatever start of
// the prompt matches the previous run, which is what keeps later turns
// fast — a clock time in here would defeat that.
function chatSystemPrompt(user: UserInfo | null): string {
  const lines = [
    'You are a helpful assistant inside Calbook, a calendar and scheduling app. Keep answers short.',
    `Today is ${dayjs().locale('en').format('dddd D MMMM YYYY')}.`,
  ];
  if (user) {
    lines.push(
      `The user's name is ${user.name || 'not set'} and their email is ${
        user.email
      }. Their time zone is ${user.time_zone}.`,
    );
  }
  return lines.join('\n');
}

// 2048 tokens of context hold a few turns; past this many messages the
// oldest go. (That changes the start of the prompt, so that run re-reads
// all of it.)
const MAX_HISTORY = 10;

export function ModelTestScreen({ onBack, onUseDraft }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<Mode>('meeting');
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS.meeting);
  const [output, setOutput] = useState('');
  const [extracted, setExtracted] = useState<{
    fields: ExtractedMeeting;
    draft: Partial<MeetingFormValues>;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const userInfo = useUserInfo();
  const contextRef = useRef<LlamaContext | null>(null);
  const downloadRef = useRef<StatefulPromise<FetchBlobResponse> | null>(null);

  useEffect(() => {
    fs.exists(MODEL_PATH).then(found =>
      setPhase(found ? 'downloaded' : 'missing'),
    );
    // Leaving the screen frees the model's memory (several hundred MB)
    // and stops a download in progress.
    return () => {
      downloadRef.current?.cancel();
      contextRef.current?.release();
      contextRef.current = null;
    };
  }, []);

  const handleDownload = async () => {
    const df = await fs.df();
    const free = Number(df.internal_free ?? df.free ?? 0);
    if (free && free < MODEL.bytes * 1.2) {
      Alert.alert(
        'Not enough space',
        `The model needs about ${formatMb(MODEL.bytes)} free.`,
      );
      return;
    }

    setPhase('downloading');
    setProgress(0);
    try {
      if (!(await fs.isDir(MODEL_DIR))) await fs.mkdir(MODEL_DIR);
      if (await fs.exists(PART_PATH)) await fs.unlink(PART_PATH);

      const task = ReactNativeBlobUtil.config({ path: PART_PATH }).fetch(
        'GET',
        MODEL.url,
      );
      downloadRef.current = task;
      task.progress({ interval: 250 }, (received, total) => {
        setProgress(Number(received) / (Number(total) || MODEL.bytes));
      });
      const res = await task;
      downloadRef.current = null;
      if (res.info().status !== 200) {
        throw new Error(`Download failed (HTTP ${res.info().status}).`);
      }

      setPhase('verifying');
      const hash = await fs.hash(PART_PATH, 'sha256');
      if (hash !== MODEL.sha256) {
        throw new Error('The downloaded file is corrupt. Please try again.');
      }
      await fs.mv(PART_PATH, MODEL_PATH);
      setPhase('downloaded');
    } catch (err: any) {
      downloadRef.current = null;
      await fs.unlink(PART_PATH).catch(() => {});
      setPhase('missing');
      // cancel() rejects the task too; that one isn't an error.
      if (!/cancel/i.test(String(err?.message))) {
        Alert.alert('Download failed', err?.message ?? 'Please try again.');
      }
    }
  };

  const handleLoad = async () => {
    setPhase('loading');
    setProgress(0);
    try {
      contextRef.current = await initLlama(
        { model: MODEL_PATH, n_ctx: 2048 },
        percent => setProgress(percent / 100),
      );
      setPhase('ready');
    } catch (err: any) {
      setPhase('downloaded');
      Alert.alert('Could not load the model', err?.message ?? String(err));
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete model?', `Frees ${formatMb(MODEL.bytes)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await contextRef.current?.release();
          contextRef.current = null;
          await fs.unlink(MODEL_PATH);
          setOutput('');
          setStats(null);
          setHistory([]);
          setPhase('missing');
        },
      },
    ]);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setPrompt(SAMPLE_PROMPTS[next]);
    setOutput('');
    setExtracted(null);
    setStats(null);
  };

  const handleRun = async () => {
    const context = contextRef.current;
    const text = prompt.trim();
    if (!context || !text) return;
    setGenerating(true);
    setOutput('');
    setExtracted(null);
    setStats(null);
    // Chat shows the message straight away and empties the box, like any
    // messaging app; on failure both go back.
    const sentHistory = [
      ...history,
      { role: 'user', content: text } as const,
    ].slice(-MAX_HISTORY);
    if (mode === 'chat') {
      setHistory(sentHistory);
      setPrompt('');
    }
    try {
      const request =
        mode === 'meeting'
          ? // Temperature 0: the most likely answer every time, which is
            // what you want for pulling facts out of text.
            { ...buildMeetingExtraction(text), temperature: 0 }
          : {
              messages: [
                { role: 'system', content: chatSystemPrompt(userInfo) },
                ...sentHistory,
              ],
              temperature: 0.7,
            };
      const result = await context.completion(
        { ...request, n_predict: 256, stop: STOP_WORDS },
        data => setOutput(prev => prev + data.token),
      );
      // The final text, without the streamed copy's stray stop markers.
      setOutput(result.text.trim());
      if (mode === 'chat') {
        setHistory([
          ...sentHistory,
          { role: 'assistant', content: result.text.trim() },
        ]);
        setOutput('');
      }
      if (mode === 'meeting') {
        try {
          const { extracted: fields, draft } = toMeetingDraft(
            result.text,
            prompt.trim(),
          );
          setExtracted({ fields, draft });
        } catch {
          Alert.alert(
            'Unreadable reply',
            "The model's reply wasn't valid JSON (it may have been cut off).",
          );
        }
      }
      setStats({
        tokens: result.timings.predicted_n,
        tokensPerSecond: result.timings.predicted_per_second,
        promptMs: result.timings.prompt_ms,
        promptTokens: result.timings.prompt_n,
        cachedTokens: result.timings.cache_n,
      });
    } catch (err: any) {
      if (mode === 'chat') {
        setHistory(history);
        setPrompt(text);
      }
      Alert.alert('Generation failed', err?.message ?? String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={8}>
        <Text style={styles.backText}>{'‹'} Back</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>On-device model test</Text>
        <Text style={styles.subtitle}>
          Developer tool. Runs entirely on this phone, nothing is sent anywhere.
        </Text>

        <View style={styles.card}>
          <Text style={styles.modelName}>{MODEL.name}</Text>
          <Text style={styles.muted}>{formatMb(MODEL.bytes)}</Text>
          <Text style={styles.status}>{statusText(phase, progress)}</Text>

          {(phase === 'downloading' || phase === 'loading') && (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(progress * 100)}%` },
                ]}
              />
            </View>
          )}

          <View style={styles.row}>
            {phase === 'checking' || phase === 'verifying' ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : null}
            {phase === 'missing' && (
              <Button label="Download" onPress={handleDownload} />
            )}
            {phase === 'downloading' && (
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => downloadRef.current?.cancel()}
              />
            )}
            {phase === 'downloaded' && (
              <Button label="Load into memory" onPress={handleLoad} />
            )}
            {(phase === 'downloaded' || phase === 'ready') && (
              <Button
                label="Delete"
                variant="danger"
                onPress={handleDelete}
                disabled={generating}
              />
            )}
          </View>
        </View>

        <View style={styles.modeRow}>
          {(['meeting', 'chat'] as const).map(m => (
            <Pressable
              key={m}
              onPress={() => switchMode(m)}
              disabled={generating}
              style={[styles.modeChip, mode === m && styles.modeChipActive]}
            >
              <Text
                style={[
                  styles.modeChipText,
                  mode === m && styles.modeChipTextActive,
                ]}
              >
                {m === 'meeting' ? 'Fill meeting' : 'Chat'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'chat' && (history.length > 0 || generating) && (
          <View style={styles.thread}>
            {history.map((message, i) => (
              <Bubble key={i} message={message} />
            ))}
            {generating && (
              <Bubble message={{ role: 'assistant', content: output || '…' }} />
            )}
          </View>
        )}

        <Text style={styles.label}>
          {mode === 'meeting' ? 'Describe the meeting' : 'Message'}
        </Text>
        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder={
            mode === 'meeting'
              ? 'Lunch with sam@example.com tomorrow at 1pm…'
              : 'Ask the model something…'
          }
          placeholderTextColor={colors.textMuted}
          editable={phase === 'ready' && !generating}
        />

        <View style={styles.row}>
          <Button
            label={
              generating ? 'Generating…' : mode === 'chat' ? 'Send' : 'Run'
            }
            onPress={handleRun}
            disabled={phase !== 'ready' || generating || !prompt.trim()}
          />
          {generating && (
            <Button
              label="Stop"
              variant="secondary"
              onPress={() => contextRef.current?.stopCompletion()}
            />
          )}
          {mode === 'chat' && history.length > 0 && !generating && (
            <Button
              label="Clear chat"
              variant="secondary"
              onPress={() => {
                setHistory([]);
                setStats(null);
              }}
            />
          )}
        </View>

        {mode === 'meeting' && (!!output || generating) && (
          <View style={styles.outputBox}>
            <Text
              style={[styles.outputText, mode === 'meeting' && styles.mono]}
              selectable
            >
              {output || '…'}
            </Text>
          </View>
        )}

        {extracted && (
          <View style={styles.card}>
            <Field label="Title" value={extracted.draft.title} />
            <Field label="Date" value={extracted.draft.schedule_date} />
            <Field label="Start" value={extracted.draft.start_time} />
            <Field
              label="Duration"
              value={
                extracted.draft.duration_in_minutes
                  ? `${extracted.draft.duration_in_minutes} min`
                  : undefined
              }
            />
            <Field label="Location" value={extracted.draft.meeting_location} />
            <Field
              label="Guests"
              value={extracted.draft.guests?.map(g => g.email).join(', ')}
            />
            <View style={styles.row}>
              <Button
                label="Open in Create Meeting"
                onPress={() => onUseDraft(extracted.draft)}
              />
            </View>
          </View>
        )}

        {stats && (
          <Text style={styles.muted}>
            {stats.tokens} tokens · {stats.tokensPerSecond.toFixed(1)} tokens/s
            · read {stats.promptTokens} prompt tokens in{' '}
            {Math.round(stats.promptMs)} ms
            {stats.cachedTokens > 0
              ? ` (${stats.cachedTokens} reused from the last run)`
              : ''}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const styles = useStyles();
  const mine = message.role === 'user';
  return (
    <View
      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
    >
      <Text
        style={[styles.bubbleText, mine && styles.bubbleTextMine]}
        selectable
      >
        {message.content}
      </Text>
    </View>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, !value && styles.muted]}>
        {value || 'not found'}
      </Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' && styles.buttonTextSecondary,
          variant === 'danger' && styles.buttonTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function statusText(phase: Phase, progress: number): string {
  const percent = `${Math.round(progress * 100)}%`;
  switch (phase) {
    case 'checking':
      return 'Checking…';
    case 'missing':
      return 'Not downloaded';
    case 'downloading':
      return `Downloading… ${percent}`;
    case 'verifying':
      return 'Checking the file…';
    case 'downloaded':
      return 'Downloaded, not loaded';
    case 'loading':
      return `Loading… ${percent}`;
    case 'ready':
      return 'Ready';
  }
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
  },
  subtitle: {
    fontSize: 13,
    color: c.textSecondary,
    marginBottom: 4,
  },
  card: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
    color: c.primaryText,
    marginTop: 6,
  },
  muted: {
    fontSize: 12,
    color: c.textMuted,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: c.purpleTintStrong,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: c.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: c.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.primary,
  },
  buttonSecondary: {
    backgroundColor: c.purpleTint,
  },
  buttonDanger: {
    backgroundColor: c.dangerSoft,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  buttonTextSecondary: {
    color: c.primaryText,
  },
  buttonTextDanger: {
    color: c.dangerStrong,
  },
  outputBox: {
    borderRadius: 10,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.borderSoft,
    padding: 12,
  },
  outputText: {
    fontSize: 14,
    lineHeight: 20,
    color: c.textBody,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12.5,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
  },
  modeChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
  modeChipTextActive: {
    color: c.onPrimary,
  },
  thread: {
    gap: 8,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: c.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.borderSoft,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: c.textBody,
  },
  bubbleTextMine: {
    color: c.onPrimary,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 3,
  },
  fieldLabel: {
    width: 72,
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
  },
  fieldValue: {
    flex: 1,
    fontSize: 13,
    color: c.text,
  },
}));
