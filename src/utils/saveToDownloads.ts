import { PermissionsAndroid, Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

export async function saveTextToDownloads(
  fileName: string,
  text: string,
  mimeType: string,
): Promise<void> {
  const { fs } = ReactNativeBlobUtil;

  // There's no shared Downloads folder to save into outside Android.
  if (Platform.OS !== 'android') {
    throw new Error('Saving to Downloads is only supported on Android.');
  }

  if (Platform.Version >= 29) {
    const staged = `${fs.dirs.CacheDir}/${fileName}`;
    await fs.writeFile(staged, text, 'utf8');
    try {
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        { name: fileName, parentFolder: '', mimeType },
        'Download',
        staged,
      );
    } finally {
      await fs.unlink(staged).catch(() => {});
    }
    return;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  );
  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Storage permission is needed to save the file.');
  }
  const path = `${fs.dirs.LegacyDownloadDir}/${fileName}`;
  try {
    await fs.writeFile(path, text, 'utf8');
  } catch (err) {
    // Don't leave a half-written file behind in the user's Downloads.
    await fs.unlink(path).catch(() => {});
    throw err;
  }

  await fs.scanFile([{ path, mime: mimeType }]).catch(() => {});
}
