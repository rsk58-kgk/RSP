// Firebaseプロジェクト設定（ご自身のコンソールの値に置き換えてください）
const firebaseConfig = {
  apiKey: "AIzaSyAyiM0bkh3D1zTDok7wjYeipFSg7jdGOV4",
  authDomain: "rsk582027.firebaseapp.com",
  projectId: "rsk582027",
  storageBucket: "rsk582027.firebasestorage.app",
  messagingSenderId: "362146687037",
  appId: "1:362146687037:web:70b50de3f9d98d4c6ca254"
};

// Firebase初期化（compat版SDK）
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// 企画共通設定
const APP_CONFIG = {
  className: "2年4組",
  attractionName: "文化祭アトラクション",
  get fullTitle() {
    return `${this.className} ${this.attractionName}`;
  },
  defaultMaxGroupsPerSlot: 3, // 1枠あたりのデフォルト上限グループ数
  timeSlotDurationMinutes: 10, // 10分刻み
  defaultOpenTime: "09:30",
  defaultCloseTime: "15:00",
  // 10分刻みの時間枠生成ヘルパー
  generateTimeSlots(startStr = "09:30", endStr = "15:00") {
    const slots = [];
    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);
    let current = startH * 60 + startM;
    const end = endH * 60 + endM;

    while (current < end) {
      const h = Math.floor(current / 60).toString().padStart(2, "0");
      const m = (current % 60).toString().padStart(2, "0");
      slots.push(`${h}:${m}`);
      current += this.timeSlotDurationMinutes;
    }
    return slots;
  }
};