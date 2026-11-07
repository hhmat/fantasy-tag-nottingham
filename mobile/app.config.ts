// Dynamic config: lets CI set the GitHub Pages base path via EXPO_BASE_URL
// (e.g. EXPO_BASE_URL=/fantasy-tag-nottingham) without touching app.json.
import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    experiments: {
      ...config.experiments,
      baseUrl: process.env.EXPO_BASE_URL || '/',
    },
  }) as ExpoConfig;
