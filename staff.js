document.addEventListener("DOMContentLoaded", () => {
  let reservations = [];
  let html5QrCode = null;
  let activeCheckinDocId = null;

  // 運用設定値（Firestore settings/config と同期）
  let configData = {
    maxGroupsPerSlot: APP_CONFIG.defaultMaxGroupsPerSlot,
    openTime: APP_CONFIG.defaultOpenTime,
    closeTime: APP_CONFIG.defaultCloseTime
  };
  let activeTimeSlots = APP_CONFIG.generateTimeSlots();

  // ピッカー用状態
  let selectedHour = 9;
  let selectedMinute = 30;

  // DOM要素
  const tabs = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // 予約フォーム要素
  const reservationForm = document.getElementById("reservation-form");
  const groupNameInput = document.getElementById("group-name");
  const paxDisplay = document.getElementById("pax-display");
  const timeSlotInput = document.getElementById("time-slot-input");
  const isRepeatCheckbox = document.getElementById("is-repeat");

  // ダイヤルモーダル要素
  const dialModal = document.getElementById("dial-modal");
  const dialTimePreview = document.getElementById("dial-time-preview");
  const wheelHour = document.getElementById("wheel-hour");
  const wheelMinute = document.getElementById("wheel-minute");
  const handHour = document.getElementById("hand-hour");
  const handMinute = document.getElementById("hand-minute");
  const btnDialConfirm = document.getElementById("btn-dial-confirm");
  const btnDialCancel = document.getElementById("btn-dial-cancel");

  // フライトボード要素
  const flightTbody = document.getElementById("flight-tbody");
  const boardFilterSlot = document.getElementById("board-filter-slot");

  // 設定フォーム要素
  const settingsForm = document.getElementById("settings-form");
  const settingMaxGroups = document.getElementById("setting-max-groups");
  const settingOpenTime = document.getElementById("setting-open-time");
  const settingCloseTime = document.getElementById("setting-close-time");

  // カメラ・モーダル要素
  const qrModal = document.getElementById("qr-modal");
  const modalQrCode = document.getElementById("modal-qrcode");
  const modalTicketUrl = document.getElementById("modal-ticket-url");
  const btnCloseQrModal = document.getElementById("btn-close-qr-modal");

  const btnStartScan = document.getElementById("btn-start-scan");
  const btnStopScan = document.getElementById("btn-stop-scan");
  const scanMessage = document.getElementById("scan-message");
  const checkinModal = document.getElementById("checkin-modal");
  const checkinDetails = document.getElementById("checkin-details");
  const btnConfirmCheckin = document.getElementById("btn-confirm-checkin");
  const btnCancelCheckin = document.getElementById("btn-cancel-checkin");

  // 1. タブ切り替え
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");

      if (btn.dataset.tab !== "tab-scan") {
        stopScanner();
      }
    });
  });

  // 2. テンキー入力制御（1〜4人のみ入力可能）
  let currentPax = 2;
  paxDisplay.textContent = currentPax;

  document.querySelectorAll(".key-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.id === "btn-clear-keypad") {
        currentPax = 1;
      } else {
        const val = parseInt(btn.dataset.num, 10);
        if (val >= 1 && val <= 4) {
          currentPax = val;
        }
      }
      paxDisplay.textContent = currentPax;
    });
  });

  // 3. 設定のリアルタイム購読 & 保存
  db.collection("settings").doc("config").onSnapshot(doc => {
    if (doc.exists) {
      configData = { ...configData, ...doc.data() };
    }
    settingMaxGroups.value = configData.maxGroupsPerSlot;
    settingOpenTime.value = configData.openTime;
    settingCloseTime.value = configData.closeTime;

    activeTimeSlots = APP_CONFIG.generateTimeSlots(configData.openTime, configData.closeTime);
    updateFilterOptions();
    renderFlightBoard();
  });

  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await db.collection("settings").doc("config").set({
        maxGroupsPerSlot: Number(settingMaxGroups.value),
        openTime: settingOpenTime.value.trim(),
        closeTime: settingCloseTime.value.trim()
      }, { merge: true });
      alert("設定を保存しました。全員の画面に即座に反映されます。");
    } catch (err) {
      alert("設定保存失敗: " + err.message);
    }
  });

  // 4. Dual Dial Time Picker (10分刻み対応)
  timeSlotInput.addEventListener("click", () => {
    openDialModal();
  });

  function openDialModal() {
    dialModal.classList.add("active");
    initDials();
    updateDialPreview();
  }

  // ダイヤルの目盛り配置
  function initDials() {
    wheelHour.querySelectorAll(".dial-num").forEach(e => e.remove());
    wheelMinute.querySelectorAll(".dial-num").forEach(e => e.remove());

    // 時目盛り: 9時〜15時（または開始から終了まで）
    const hours = [9, 10, 11, 12, 13, 14, 15];
    const hourStepAngle = 360 / hours.length;
    hours.forEach((h, i) => {
      const angle = i * hourStepAngle - 90;
      const rad = (angle * Math.PI) / 180;
      const x = 85 + 62 * Math.cos(rad);
      const y = 85 + 62 * Math.sin(rad);

      const span = document.createElement("span");
      span.className = "dial-num";
      span.textContent = h;
      span.style.left = `${x}px`;
      span.style.top = `${y}px`;
      wheelHour.appendChild(span);
    });

    // 分目盛り: 6分割（00, 10, 20, 30, 40, 50）
    const minutes = ["00", "10", "20", "30", "40", "50"];
    minutes.forEach((m, i) => {
      const angle = i * 60 - 90;
      const rad = (angle * Math.PI) / 180;
      const x = 85 + 62 * Math.cos(rad);
      const y = 85 + 62 * Math.sin(rad);

      const span = document.createElement("span");
      span.className = "dial-num";
      span.textContent = m;
      span.style.left = `${x}px`;
      span.style.top = `${y}px`;
      wheelMinute.appendChild(span);
    });

    setDialRotation();
  }

  function setDialRotation() {
    const hours = [9, 10, 11, 12, 13, 14, 15];
    const hourIdx = Math.max(0, hours.indexOf(selectedHour));
    const hourAngle = hourIdx * (360 / hours.length);
    handHour.style.transform = `rotate(${hourAngle}deg)`;

    const minIdx = Math.floor(selectedMinute / 10);
    const minAngle = minIdx * 60;
    handMinute.style.transform = `rotate(${minAngle}deg)`;
  }

  // ダイヤルのタッチ/クリック回転処理
  function setupDialInteraction(wheel, isHour) {
    function handlePointer(e) {
      const rect = wheel.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const x = clientX - (rect.left + rect.width / 2);
      const y = clientY - (rect.top + rect.height / 2);

      let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;

      if (isHour) {
        const hours = [9, 10, 11, 12, 13, 14, 15];
        const step = 360 / hours.length;
        const index = Math.round(deg / step) % hours.length;
        selectedHour = hours[index];
      } else {
        // 10分刻みスナップ（60度ごと）
        const index = Math.round(deg / 60) % 6;
        selectedMinute = index * 10;
      }
      setDialRotation();
      updateDialPreview();
    }

    let isDown = false;
    wheel.addEventListener("mousedown", (e) => { isDown = true; handlePointer(e); });
    window.addEventListener("mousemove", (e) => { if (isDown) handlePointer(e); });
    window.addEventListener("mouseup", () => { isDown = false; });

    wheel.addEventListener("touchstart", (e) => { isDown = true; handlePointer(e); }, { passive: false });
    wheel.addEventListener("touchmove", (e) => { if (isDown) { e.preventDefault(); handlePointer(e); } }, { passive: false });
    wheel.addEventListener("touchend", () => { isDown = false; });
  }

  setupDialInteraction(wheelHour, true);
  setupDialInteraction(wheelMinute, false);

  function updateDialPreview() {
    const h = String(selectedHour).padStart(2, "0");
    const m = String(selectedMinute).padStart(2, "0");
    dialTimePreview.textContent = `${h}:${m}`;
  }

  btnDialConfirm.addEventListener("click", () => {
    timeSlotInput.value = dialTimePreview.textContent;
    dialModal.classList.remove("active");
  });

  btnDialCancel.addEventListener("click", () => {
    dialModal.classList.remove("active");
  });

  // 5. 予約発行（グループ数制限チェック）
  reservationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const groupName = groupNameInput.value.trim();
    const count = currentPax;
    const timeSlot = timeSlotInput.value.trim();
    const isRepeat = isRepeatCheckbox.checked;

    if (!timeSlot) {
      alert("希望時間枠を選択してください。");
      return;
    }

    // 上限グループ数チェック
    const existingActiveGroups = reservations.filter(
      r => r.timeSlot === timeSlot && r.status !== "cancelled"
    ).length;

    if (existingActiveGroups >= configData.maxGroupsPerSlot) {
      alert(`【満員警告】\n${timeSlot} の枠はすでに上限（${configData.maxGroupsPerSlot}組）に達しているため、発券できません。`);
      return;
    }

    try {
      const docRef = await db.collection("reservations").add({
        groupName: groupName,
        count: count,
        timeSlot: timeSlot,
        isRepeat: isRepeat,
        status: "reserved",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        checkedInAt: null
      });

      // フォームリセット
      groupNameInput.value = "";
      timeSlotInput.value = "";
      isRepeatCheckbox.checked = false;
      currentPax = 2;
      paxDisplay.textContent = currentPax;

      // チケット受取用QR生成
      const baseUrl = window.location.href.split("?")[0].replace("index.html", "");
      const separator = baseUrl.endsWith("/") ? "" : "/";
      const ticketUrl = `${baseUrl}${separator}ticket.html?id=${docRef.id}`;

      modalQrCode.innerHTML = "";
      new QRCode(modalQrCode, {
        text: ticketUrl,
        width: 220,
        height: 220,
        correctLevel: QRCode.CorrectLevel.M
      });
      modalTicketUrl.textContent = ticketUrl;
      qrModal.classList.add("active");
    } catch (err) {
      alert("発券失敗: " + err.message);
    }
  });

  btnCloseQrModal.addEventListener("click", () => {
    qrModal.classList.remove("active");
  });

  // 6. フライト案内板一覧（リアルタイム購読）
  db.collection("reservations")
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      reservations = [];
      snapshot.forEach(doc => {
        reservations.push({ id: doc.id, ...doc.data() });
      });
      renderFlightBoard();
    });

  function updateFilterOptions() {
    boardFilterSlot.innerHTML = `<option value="all">ALL SLOTS</option>`;
    activeTimeSlots.forEach(slot => {
      const opt = document.createElement("option");
      opt.value = slot;
      opt.textContent = slot;
      boardFilterSlot.appendChild(opt);
    });
  }

  function renderFlightBoard() {
    flightTbody.innerHTML = "";
    const filter = boardFilterSlot.value;

    const filtered = reservations.filter(r => filter === "all" || r.timeSlot === filter);

    // 時間枠順・作成順でソート
    filtered.sort((a, b) => (a.timeSlot > b.timeSlot ? 1 : -1));

    filtered.forEach(res => {
      const tr = document.createElement("tr");

      let statusHtml = '<span class="status-tag status-waiting">WAITING</span>';
      if (res.status === "checked_in") {
        statusHtml = '<span class="status-tag status-checked">CHECKED IN</span>';
      } else if (res.status === "cancelled") {
        statusHtml = '<span class="status-tag status-cancelled">CANCELLED</span>';
      }

      const typeHtml = res.isRepeat
        ? '<span class="type-repeat">REPEAT</span>'
        : '<span style="color:#94a3b8;">FIRST</span>';

      let actionHtml = `
        <div style="display:flex;gap:6px;">
          ${res.status === "reserved" ? `<button class="btn success small" onclick="window.triggerCheckin('${res.id}')">受付</button>` : ""}
          ${res.status === "reserved" ? `<button class="btn danger small" onclick="window.triggerCancel('${res.id}')">取消</button>` : ""}
          <button class="btn small" style="background:#475569;" onclick="window.triggerDelete('${res.id}')">削除</button>
        </div>
      `;

      tr.innerHTML = `
        <td style="font-weight:bold;color:#38bdf8;">${res.timeSlot}</td>
        <td><strong>${escapeHtml(res.groupName)}</strong></td>
        <td>${res.count}P</td>
        <td>${typeHtml}</td>
        <td>${statusHtml}</td>
        <td>${actionHtml}</td>
      `;
      flightTbody.appendChild(tr);
    });
  }

  boardFilterSlot.addEventListener("change", renderFlightBoard);

  // 7. カメラQRスキャナー受付
  html5QrCode = new Html5Qrcode("qr-reader");

  btnStartScan.addEventListener("click", () => {
    btnStartScan.style.display = "none";
    btnStopScan.style.display = "block";
    scanMessage.textContent = "カメラ読取中...";

    const config = { fps: 10, qrbox: { width: 240, height: 240 } };
    html5QrCode.start(
      { facingMode: "environment" },
      config,
      onQrScanSuccess,
      () => {}
    ).catch(err => {
      alert("カメラ起動失敗: " + err);
      stopScanner();
    });
  });

  btnStopScan.addEventListener("click", stopScanner);

  function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
      html5QrCode.stop().then(() => {
        btnStartScan.style.display = "block";
        btnStopScan.style.display = "none";
        scanMessage.textContent = "カメラは停止しています。";
      }).catch(err => console.error(err));
    }
  }

  async function onQrScanSuccess(decodedText) {
    if (html5QrCode && html5QrCode.isScanning) {
      await html5QrCode.pause();
    }
    openCheckinModal(decodedText.trim());
  }

  // 8. 各種操作のグローバル公開
  window.triggerCheckin = (id) => openCheckinModal(id);

  window.triggerCancel = async (id) => {
    if (confirm("この予約を取り消し（CANCEL）状態にしますか？")) {
      try {
        await db.collection("reservations").doc(id).update({
          status: "cancelled"
        });
      } catch (err) {
        alert("取消エラー: " + err.message);
      }
    }
  };

  // 物理削除（テストデータ清掃）
  window.triggerDelete = async (id) => {
    if (confirm("【完全削除の確認】\nこの予約データをデータベースから完全に消去しますか？\n（元に戻せません）")) {
      try {
        await db.collection("reservations").doc(id).delete();
      } catch (err) {
        alert("削除エラー: " + err.message);
      }
    }
  };

  async function openCheckinModal(docId) {
    activeCheckinDocId = docId;
    try {
      const doc = await db.collection("reservations").doc(docId).get();
      if (!doc.exists) {
        alert("予約データが見つかりません (ID: " + docId + ")");
        resumeScanner();
        return;
      }

      const d = doc.data();
      let statusLabel = "<span style='color:#facc15;font-weight:bold;'>未受付 (WAITING)</span>";
      if (d.status === "checked_in") {
        statusLabel = "<span style='color:#4ade80;font-weight:bold;'>受付済み (CHECKED IN)</span>";
      } else if (d.status === "cancelled") {
        statusLabel = "<span style='color:#ef4444;font-weight:bold;'>キャンセル済み (CANCELLED)</span>";
      }

      checkinDetails.innerHTML = `
        <p><strong>グループ:</strong> ${escapeHtml(d.groupName)}</p>
        <p><strong>人数:</strong> ${d.count} 名</p>
        <p><strong>時間枠:</strong> ${d.timeSlot}</p>
        <p><strong>種別:</strong> ${d.isRepeat ? "リピート参加" : "初回入場"}</p>
        <p><strong>状態:</strong> ${statusLabel}</p>
      `;

      btnConfirmCheckin.style.display = d.status === "reserved" ? "block" : "none";
      checkinModal.classList.add("active");
    } catch (err) {
      alert("照会エラー: " + err.message);
      resumeScanner();
    }
  }

  btnConfirmCheckin.addEventListener("click", async () => {
    if (!activeCheckinDocId) return;
    try {
      await db.collection("reservations").doc(activeCheckinDocId).update({
        status: "checked_in",
        checkedInAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      alert("受付手続きが完了しました！");
      checkinModal.classList.remove("active");
      resumeScanner();
    } catch (err) {
      alert("受付更新エラー: " + err.message);
    }
  });

  btnCancelCheckin.addEventListener("click", () => {
    checkinModal.classList.remove("active");
    resumeScanner();
  });

  function resumeScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
      html5QrCode.resume();
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }
});