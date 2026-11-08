/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'PulseWidget',
  displayName: 'Monitor for Pulse',
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  icon: '../../assets/icon.png',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'keychain-access-groups': ['$(AppIdentifierPrefix)com.hindfelt.pulsemobile.shared'],
  },
};
