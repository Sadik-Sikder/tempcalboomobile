module.exports = {
  preset: '@react-native/jest-preset',
  // These packages ship untranspiled ES modules, so Jest has to run them
  // through Babel like the app's own code.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|react-native-[^/]+|@react-navigation|@notifee|@react-native-google-signin|@react-native-clipboard)/)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
