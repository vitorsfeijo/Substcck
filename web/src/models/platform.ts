export interface PlatformHealth {
  status: 'ok';
  service: 'subtccstack-api';
  database: 'ok';
  environment: 'development' | 'production';
}

export type PlatformState =
  | { state: 'unconfigured' }
  | { state: 'loading' }
  | { state: 'online'; health: PlatformHealth }
  | { state: 'unavailable' };
