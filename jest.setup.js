/* eslint-env jest */
// AsyncStorage's in-memory stand-in: the real one needs the native module.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
