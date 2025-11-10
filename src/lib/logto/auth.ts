import { browser } from '$app/environment';
import LogtoClient from '@logto/browser';
import { PUBLIC_LOGTO_ENDPOINT, PUBLIC_LOGTO_APP_ID } from '$env/static/public';

const config = {
  endpoint: PUBLIC_LOGTO_ENDPOINT,
  appId: PUBLIC_LOGTO_APP_ID,
  resources: [], // optional APIs
};

export const logtoClient = browser ? new LogtoClient(config) : undefined;