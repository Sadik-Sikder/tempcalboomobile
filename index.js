/**
 * @format
 */

import { AppRegistry } from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { runBackgroundSync } from './src/background/notificationSync';

AppRegistry.registerComponent(appName, () => App);

// Runs the notification check when Android fires the job after the app has
// been closed (no React tree, so this can't live in App). A timed-out event
// just has to be acknowledged.
BackgroundFetch.registerHeadlessTask(async ({ taskId, timeout }) => {
  if (timeout) {
    BackgroundFetch.finish(taskId);
    return;
  }
  await runBackgroundSync(taskId);
});

// notifee requires a background handler. Nothing to do here: a press
// launches the app, and App picks it up via getInitialNotification.
notifee.onBackgroundEvent(async () => {});
