/** Shared navigation shell strings for Traditional Chinese (Taiwan). */
export const zhTW = {
	page: {
		home: '首頁',
		models: '駕駛模型',
		deviceSettings: '裝置設定',
		toggles: '功能開關',
		steering: '轉向控制',
		cruise: '巡航控制',
		visuals: '行車畫面',
		vehicle: '車輛設定',
		display: '螢幕設定',
		software: '軟體資訊',
		developer: '開發者設定',
		maps: '地圖',
		preferences: '偏好設定',
		whatsNew: '最新消息'
	},
	navigation: {
		myDevices: '我的裝置',
		migrationWizard: '裝置設定移轉精靈',
		pairDevice: '配對新裝置'
	},
	actions: {
		signIn: '登入',
		signOut: '登出',
		save: '儲存',
		cancel: '取消',
		close: '關閉',
		confirm: '確認',
		refresh: '重新整理',
		retry: '重試',
		search: '搜尋',
		loading: '載入中…',
		remove: '移除',
		continue: '繼續',
		back: '返回'
	},
	device: {
		status: '裝置狀態',
		online: '已連線',
		offline: '離線',
		lastSeen: '上次連線時間',
		deviceDetails: '裝置資訊',
		pair: '配對裝置',
		unpair: '取消配對',
		remove: '移除裝置',
		refreshStatus: '重新整理裝置狀態'
	},
	devicesPage: {
		noDevices: '尚未配對任何裝置',
		pairToStart: '配對 sunnypilot 裝置即可開始使用。',
		countSingular: '個裝置',
		countPlural: '個裝置',
		checkFailed: '檢查失敗，點選即可重試',
		selected: '已選取',
		list: '裝置清單',
		pairNew: '配對新裝置'
	},
	account: {
		preferences: '偏好設定',
		helpSupport: '說明與支援',
		notifications: '通知',
		whatsNew: '最新消息'
	},
	sync: {
		syncing: '同步中…',
		pending: '待同步',
		failed: '同步失敗',
		stateChanged: '編輯期間裝置狀態已變更',
		connectionError: '連線錯誤',
		authExpired: '登入狀態已過期，請重新登入'
	},
	shell: {
		changeDevice: '切換裝置',
		signingIn: '登入中…',
		openSidebar: '開啟側邊欄',
		closeSidebar: '關閉側邊欄'
	}
} as const;
