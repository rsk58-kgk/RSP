// Firebaseの設定情報（ご自身のFirebaseプロジェクトの値に置き換えてください）
const firebaseConfig = {
  apiKey: "AIzaSyAyiM0bkh3D1zTDok7wjYeipFSg7jdGOV4",
  authDomain: "rsk582027.firebaseapp.com",
  projectId: "rsk582027",
  storageBucket: "rsk582027.firebasestorage.app",
  messagingSenderId: "362146687037",
  appId: "1:362146687037:web:70b50de3f9d98d4c6ca254"
};

// Firebaseの初期化（compat版SDK）
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// 企画設定・時間枠ごとの定員枠（クラスの運用に合わせて調整可能）
const APP_CONFIG = {
  title: "2年4組 文化祭アトラクション",
  capacityPerSlot: 15, // 各時間枠の定員人数
  timeSlots: [
    "09:30 - 10:00",
    "10:00 - 10:30",
    "10:30 - 11:00",
    "11:00 - 11:30",
    "11:30 - 12:00",
    "13:00 - 13:30",
    "13:30 - 14:00",
    "14:00 - 14:30",
    "14:30 - 15:00"
  ]
};