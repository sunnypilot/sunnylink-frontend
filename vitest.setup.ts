import { vi } from 'vitest';

vi.mock('$env/static/public', () => ({
  PUBLIC_LOGTO_ENDPOINT: 'https://logto.sunnypilot.ai/',
  PUBLIC_LOGTO_APP_ID: '6mjzxmevkp3ly5c6asvu8',
}));
