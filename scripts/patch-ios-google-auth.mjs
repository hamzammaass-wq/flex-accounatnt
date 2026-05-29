import fs from 'fs';
import path from 'path';

const targetPath = path.join(
  process.cwd(),
  'node_modules',
  '@capacitor-firebase',
  'authentication',
  'ios',
  'Plugin',
  'Handlers',
  'GoogleAuthProviderHandler.swift'
);

if (fs.existsSync(targetPath)) {
  let content = fs.readFileSync(targetPath, 'utf8');
  const targetLine = 'let config = GIDConfiguration(clientID: clientId, serverClientID: clientId)';
  const replacement = 'let serverClientId = self.pluginImplementation.getConfig().getString("clientId") ?? clientId\n        let config = GIDConfiguration(clientID: clientId, serverClientID: serverClientId)';
  
  if (content.includes(targetLine)) {
    content = content.replace(targetLine, replacement);
    fs.writeFileSync(targetPath, content);
    console.log('[patch] GoogleAuthProviderHandler.swift patched successfully for iOS Google Sign In.');
  } else if (content.includes('serverClientId = self.pluginImplementation')) {
    console.log('[patch] GoogleAuthProviderHandler.swift is already patched.');
  } else {
    console.warn('[patch] Warning: target line not found in GoogleAuthProviderHandler.swift.');
  }
} else {
  console.warn('[patch] Warning: GoogleAuthProviderHandler.swift not found.');
}
