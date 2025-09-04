import type { LogtoClient, UserInfoResponse } from '@logto/sveltekit';

declare global {
	namespace App {
		interface Locals {
			logtoClient: LogtoClient;
			user?: UserInfoResponse;
		}
		interface Error {
			message: string;
			errorId: string;
		}
	}
}

export {};
