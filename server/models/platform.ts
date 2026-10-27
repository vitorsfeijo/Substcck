export interface PlatformHealth {
  status: 'ok' | 'unavailable';
  service: 'subtccstack-api';
  database: 'ok' | 'unavailable';
  environment: 'development' | 'test' | 'production';
}
