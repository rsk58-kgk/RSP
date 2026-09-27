document.addEventListener("DOMContentLoaded", () => {
  let reservations = [];
  let html5QrCode = null;
  let activeCheckinDocId = null;

  let configData = {
    maxGroupsPerSlot: APP_CONFIG.defaultMaxGroupsPerSlot,
    openTime: APP_CONFIG.defaultOpenTime,
    closeTime: APP_CONFIG.defaultCloseTime
  };
  let activeTimeSlots = APP_CONFIG.generateTimeSlots();

  // DOM要素
  const tabs = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  const reservationForm = document.getElementById("reservation-form");
  const groupNameInput = document.getElementById("group-name");
  const paxDisplay = document.getElementById("pax-display");
  const timeSlotInput = document.getElementById("time-slot-input");
  const isRepeatCheckbox = document.getElementById("is-repeat");

  const flightTbody = document.getElementById("flight-tbody");
  const boardFilterSlot = document.getElementById("board-filter-slot");

  const settingsForm = document.getElementById("settings-form");
  const settingMaxGroups = document.getElementById("setting-max-groups");
  const settingOpenTime = document.getElementById("setting-open-time");
  const settingCloseTime = document.getElementById("setting-close-time");

  const qrModal = document.getElementById("qr-modal");
  const modalQrCode = document.getElementById("modal-qrcode");
  const modalTicketUrl = document.getElementById("modal-ticket-url");
  const btnCloseQrModal = document.getElementById("btn-close-qr-modal");
  const btnQrCloseX = document.getElementById("btn-qr-close-x");

  const btnStartScan = document.getElementById("btn-start-scan");
  const btnStopScan = document.getElementById("btn-stop-scan");
  const scanMessage = document.getElementById("scan-message");
  const checkinModal = document.getElementById("checkin-modal");
  const checkinDetails = document.getElementById("checkin-details");
  const btnConfirmCheckin = document.getElementById("btn-confirm-checkin");
  const btnCancelCheckin = document.getElementById("btn-cancel-checkin");
  const btnCheckinCloseX = document.getElementById("btn-checkin-close-x");

  // ダイヤルモーダル要素
  const dialModal = document.getElementById("dial-modal");
  const btnDialConfirm = document.getElementById("btn-dial-confirm");
  const btnDialCancel = document.getElementById("btn-dial-cancel");
  const btnDialCloseX = document.getElementById("btn-dial-close-x");
  const tpScaleWrapper = document.getElementById("tpScaleWrapper");
  const timePicker = document.getElementById("timePicker");

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

  // 2. テンキー入力制御（1〜4名ワントップ化・アクティブ切り替え）
  let currentPax = 2;
  const keyBtns = document.querySelectorAll(".key-btn");

  keyBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.dataset.num, 10);
      if (val >= 1 && val <= 4) {
        currentPax = val;
        paxDisplay.textContent = currentPax;
        keyBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      }
    });
  });

  function resetPaxToDefault() {
    currentPax = 2;
    paxDisplay.textContent = currentPax;
    keyBtns.forEach(b => {
      if (b.dataset.num === "2") {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });
  }

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
      alert("設定を保存しました。");
    } catch (err) {
      alert("設定保存失敗: " + err.message);
    }
  });

  // 4. Dual Dial Time Picker ロジック
  const pickerState = {
    is24h: true,
    hour: 9,
    minute: 30,
    hourAngle: 0,
    minuteAngle: 0
  };

  let prev12Hour = 9;

  const hourDial = document.getElementById("hourDial");
  const minuteDial = document.getElementById("minuteDial");
  const hourWrap = document.getElementById("hourDialWrap");
  const minuteWrap = document.getElementById("minuteDialWrap");
  const displayTime = document.getElementById("displayTime");
  const displayAmPm = document.getElementById("displayAmPm");
  const btn12h = document.getElementById("btn12h");
  const btn24h = document.getElementById("btn24h");
  const btnAM = document.getElementById("btnAM");
  const btnPM = document.getElementById("btnPM");
  const ampmGroup = document.getElementById("ampmGroup");

  function setupDials() {
    hourDial.innerHTML = "";
    const totalHourTicks = pickerState.is24h ? 24 : 12;
    for (let i = 0; i < totalHourTicks; i++) {
      const angle = (360 / totalHourTicks) * i;
      const tick = document.createElement("div");
      tick.className = "tp-tick";
      tick.style.transform = `rotate(${angle}deg)`;

      const line = document.createElement("div");
      line.className = "tp-tick-line major";

      const num = document.createElement("div");
      num.className = "tp-tick-num";
      num.style.transform = `rotate(-${angle}deg)`;
      num.textContent = pickerState.is24h ? String(i).padStart(2, "0") : (i === 0 ? "12" : String(i));

      tick.appendChild(line);
      tick.appendChild(num);
      hourDial.appendChild(tick);
    }

    minuteDial.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const angle = 60 * i;
      const tick = document.createElement("div");
      tick.className = "tp-tick";
      tick.style.transform = `rotate(${angle}deg)`;

      const line = document.createElement("div");
      line.className = "tp-tick-line major";

      const num = document.createElement("div");
      num.className = "tp-tick-num";
      num.style.transform = `rotate(-${angle}deg)`;
      num.textContent = String(i * 10).padStart(2, "0");

      tick.appendChild(line);
      tick.appendChild(num);
      minuteDial.appendChild(tick);
    }
  }

  function updatePickerUI() {
    const isPM = pickerState.hour >= 12;
    let hDisplay = pickerState.hour;

    if (!pickerState.is24h) {
      hDisplay = pickerState.hour % 12;
      if (hDisplay === 0) hDisplay = 12;
      displayAmPm.textContent = isPM ? "午後" : "午前";
      displayAmPm.style.display = "inline";
      ampmGroup.classList.remove("hidden");

      if (isPM) {
        btnPM.classList.add("active");
        btnAM.classList.remove("active");
      } else {
        btnAM.classList.add("active");
        btnPM.classList.remove("active");
      }
    } else {
      displayAmPm.textContent = "";
      displayAmPm.style.display = "none";
      ampmGroup.classList.add("hidden");
    }

    displayTime.textContent = `${String(hDisplay).padStart(2, "0")}:${String(pickerState.minute).padStart(2, "0")}`;
    hourDial.style.transform = `rotate(${pickerState.hourAngle}deg)`;
    minuteDial.style.transform = `rotate(${pickerState.minuteAngle}deg)`;
  }

  function syncAnglesFromTime() {
    const totalHours = pickerState.is24h ? 24 : 12;
    const h = pickerState.is24h ? pickerState.hour : (pickerState.hour % 12);
    pickerState.hourAngle = 90 - (h * (360 / totalHours));
    pickerState.minuteAngle = 270 - (pickerState.minute * 6);
    prev12Hour = pickerState.hour % 12 || 12;
    updatePickerUI();
  }

  function adjustDialScale() {
    if (!tpScaleWrapper || !timePicker) return;
    const wrapperWidth = tpScaleWrapper.clientWidth;
    const baseWidth = 680;
    const baseHeight = 380;

    let scale = wrapperWidth / baseWidth;
    if (scale > 1) scale = 1;

    timePicker.style.transform = `scale(${scale})`;
    tpScaleWrapper.style.height = `${baseHeight * scale}px`;
  }

  window.addEventListener("resize", () => {
    if (dialModal.classList.contains("active")) {
      adjustDialScale();
    }
  });

  function bindDrag(element, onRotate, onEnd) {
    let isDragging = false;
    let lastAngle = 0;

    function getAngle(e) {
      const rect = element.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
    }

    function onPointerDown(e) {
      isDragging = true;
      lastAngle = getAngle(e);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      const currentAngle = getAngle(e);
      let deltaAngle = currentAngle - lastAngle;

      if (deltaAngle > 180) deltaAngle -= 360;
      if (deltaAngle < -180) deltaAngle += 360;

      onRotate(deltaAngle);
      lastAngle = currentAngle;
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (onEnd) onEnd();
    }

    element.addEventListener("pointerdown", onPointerDown);

    element.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      onRotate(dir * 5);
      if (onEnd) onEnd();
    }, { passive: false });
  }

  // 時間ダイヤル
  bindDrag(hourWrap, (deltaAngle) => {
    pickerState.hourAngle += deltaAngle;
    const totalHours = pickerState.is24h ? 24 : 12;
    const step = 360 / totalHours;

    let norm = (90 - pickerState.hourAngle) % 360;
    if (norm < 0) norm += 360;

    const rawIndex = Math.round(norm / step) % totalHours;

    if (pickerState.is24h) {
      pickerState.hour = rawIndex;
    } else {
      const cur12 = rawIndex === 0 ? 12 : rawIndex;
      let isPM = pickerState.hour >= 12;
      if (prev12Hour === 11 && cur12 === 12) isPM = !isPM;
      else if (prev12Hour === 12 && cur12 === 11) isPM = !isPM;

      prev12Hour = cur12;
      pickerState.hour = cur12 === 12 ? (isPM ? 12 : 0) : (isPM ? cur12 + 12 : cur12);
    }
    updatePickerUI();
  }, () => {
    const totalHours = pickerState.is24h ? 24 : 12;
    const h = pickerState.is24h ? pickerState.hour : (pickerState.hour % 12);
    pickerState.hourAngle = 90 - (h * (360 / totalHours));
    updatePickerUI();
  });

  // 分ダイヤル（10分刻み）
  bindDrag(minuteWrap, (deltaAngle) => {
    pickerState.minuteAngle += deltaAngle;

    let norm = (270 - pickerState.minuteAngle) % 360;
    if (norm < 0) norm += 360;

    const stepIndex = Math.round(norm / 60) % 6;
    pickerState.minute = stepIndex * 10;
    updatePickerUI();
  }, () => {
    pickerState.minuteAngle = 270 - (pickerState.minute * 6);
    updatePickerUI();
  });

  function setPeriod(isPM) {
    if (pickerState.is24h) return;
    const currentIsPM = pickerState.hour >= 12;
    if (currentIsPM === isPM) return;
    pickerState.hour += isPM ? 12 : -12;
    updatePickerUI();
  }

  btnAM.addEventListener("click", () => setPeriod(false));
  btnPM.addEventListener("click", () => setPeriod(true));
  displayAmPm.addEventListener("click", () => setPeriod(!(pickerState.hour >= 12)));

  btn12h.addEventListener("click", () => {
    if (!pickerState.is24h) return;
    pickerState.is24h = false;
    btn12h.classList.add("active");
    btn24h.classList.remove("active");
    setupDials();
    syncAnglesFromTime();
  });

  btn24h.addEventListener("click", () => {
    if (pickerState.is24h) return;
    pickerState.is24h = true;
    btn24h.classList.add("active");
    btn12h.classList.remove("active");
    setupDials();
    syncAnglesFromTime();
  });

  function openDialModal() {
    const currentVal = timeSlotInput.value.trim();
    if (currentVal && currentVal.includes(":")) {
      const [h, m] = currentVal.split(":").map(Number);
      if (!isNaN(h)) pickerState.hour = h;
      if (!isNaN(m)) pickerState.minute = Math.round(m / 10) * 10 % 60;
    }
    setupDials();
    syncAnglesFromTime();
    dialModal.classList.add("active");

    requestAnimationFrame(() => {
      adjustDialScale();
    });
  }

  function closeDialModal() {
    dialModal.classList.remove("active");
  }

  timeSlotInput.addEventListener("click", openDialModal);

  btnDialConfirm.addEventListener("click", () => {
    const formatted = `${String(pickerState.hour).padStart(2, "0")}:${String(pickerState.minute).padStart(2, "0")}`;
    timeSlotInput.value = formatted;
    closeDialModal();
  });

  btnDialCancel.addEventListener("click", closeDialModal);
  btnDialCloseX.addEventListener("click", closeDialModal);

  dialModal.addEventListener("click", (e) => {
    if (e.target === dialModal) {
      closeDialModal();
    }
  });

  qrModal.addEventListener("click", (e) => {
    if (e.target === qrModal) {
      qrModal.classList.remove("active");
    }
  });
  btnCloseQrModal.addEventListener("click", () => qrModal.classList.remove("active"));
  btnQrCloseX.addEventListener("click", () => qrModal.classList.remove("active"));

  checkinModal.addEventListener("click", (e) => {
    if (e.target === checkinModal) {
      checkinModal.classList.remove("active");
      resumeScanner();
    }
  });
  btnCancelCheckin.addEventListener("click", () => {
    checkinModal.classList.remove("active");
    resumeScanner();
  });
  btnCheckinCloseX.addEventListener("click", () => {
    checkinModal.classList.remove("active");
    resumeScanner();
  });

  // 5. 予約発行（全条件バリデーション & 発券ブロック）
  reservationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const groupName = groupNameInput.value.trim();
    const count = currentPax;
    const timeSlot = timeSlotInput.value.trim();
    const isRepeat = isRepeatCheckbox.checked;

    if (!timeSlot) {
      alert("案内時間を選択してください。");
      return;
    }

    // --- 時刻バリデーション ---
    const [slotH, slotM] = timeSlot.split(":").map(Number);
    const slotMinutes = slotH * 60 + slotM;

    const [openH, openM] = configData.openTime.split(":").map(Number);
    const openMinutes = openH * 60 + openM;

    const [closeH, closeM] = configData.closeTime.split(":").map(Number);
    const closeMinutes = closeH * 60 + closeM;

    // ① 営業時間外チェック
    if (slotMinutes < openMinutes) {
      alert(`開始時刻（${configData.openTime}）より前の時間は予約できません。`);
      return;
    }
    if (slotMinutes >= closeMinutes) {
      alert(`終了時刻（${configData.closeTime}）以降の時間は予約できません。`);
      return;
    }

    // ② 枠の不一致チェック（10分刻みの運用スロット外）
    if (!activeTimeSlots.includes(timeSlot)) {
      alert("指定された時間は有効な10分枠に存在しません。正しい枠を選択してください。");
      return;
    }

    // ③ 過去時刻チェック（現在時刻を過ぎている枠の発券をブロック）
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (slotMinutes <= currentMinutes) {
      alert("すでに過ぎた時間の予約は発行できません。");
      return;
    }

    // ④ 上限超過チェック（対象枠の有効グループ数）
    const existingActiveGroups = reservations.filter(
      r => r.timeSlot === timeSlot && r.status !== "cancelled"
    ).length;

    if (existingActiveGroups >= configData.maxGroupsPerSlot) {
      alert(`${timeSlot} の枠は上限（${configData.maxGroupsPerSlot}組）に達しているため予約できません。`);
      return;
    }

    // --- Firestore保存 & 発券処理 ---
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

      // フォーム初期化
      groupNameInput.value = "";
      timeSlotInput.value = "";
      isRepeatCheckbox.checked = false;
      resetPaxToDefault();

      // 客用チケットURL
      const baseUrl = window.location.href.split("?")[0].replace("index.html", "");
      const separator = baseUrl.endsWith("/") ? "" : "/";
      const ticketUrl = `${baseUrl}${separator}ticket.html?id=${docRef.id}`;

      modalTicketUrl.textContent = ticketUrl;
      modalQrCode.innerHTML = "";

      // 【重要】サイズ計算崩れを防ぐため、先にモーダルを表示状態にしてからQRを生成
      qrModal.classList.add("active");

      new QRCode(modalQrCode, {
        text: ticketUrl,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (err) {
      alert("発券失敗: " + err.message);
    }
  });

  // 6. 予約一覧（リアルタイム購読）
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
    boardFilterSlot.innerHTML = `<option value="all">すべての時間枠</option>`;
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
    filtered.sort((a, b) => (a.timeSlot > b.timeSlot ? 1 : -1));

    filtered.forEach(res => {
      const tr = document.createElement("tr");

      let statusHtml = '<span class="status-badge status-waiting">待機中</span>';
      if (res.status === "checked_in") {
        statusHtml = '<span class="status-badge status-checked">受付済</span>';
      } else if (res.status === "cancelled") {
        statusHtml = '<span class="status-badge status-cancelled">取消</span>';
      }

      const typeHtml = res.isRepeat
        ? '<span class="type-repeat-badge">再入場</span>'
        : '<span style="color:#94a3b8;">初回</span>';

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
        <td>${res.count}名</td>
        <td>${typeHtml}</td>
        <td>${statusHtml}</td>
        <td>${actionHtml}</td>
      `;
      flightTbody.appendChild(tr);
    });
  }

  boardFilterSlot.addEventListener("change", renderFlightBoard);

  // 7. カメラQRスキャン
  html5QrCode = new Html5Qrcode("qr-reader");

  btnStartScan.addEventListener("click", () => {
    btnStartScan.style.display = "none";
    btnStopScan.style.display = "block";
    scanMessage.textContent = "スキャン中...";

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
        scanMessage.textContent = "カメラは停止しています";
      }).catch(err => console.error(err));
    }
  }

  async function onQrScanSuccess(decodedText) {
    if (html5QrCode && html5QrCode.isScanning) {
      await html5QrCode.pause();
    }
    openCheckinModal(decodedText.trim());
  }

  window.triggerCheckin = (id) => openCheckinModal(id);

  window.triggerCancel = async (id) => {
    if (confirm("この予約を取り消しますか？")) {
      try {
        await db.collection("reservations").doc(id).update({ status: "cancelled" });
      } catch (err) {
        alert("取消エラー: " + err.message);
      }
    }
  };

  window.triggerDelete = async (id) => {
    if (confirm("この予約データを完全に削除しますか？")) {
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
        alert("予約データが見つかりません: " + docId);
        resumeScanner();
        return;
      }

      const d = doc.data();
      let statusLabel = "<span style='color:#facc15;font-weight:bold;'>待機中</span>";
      if (d.status === "checked_in") {
        statusLabel = "<span style='color:#4ade80;font-weight:bold;'>受付済</span>";
      } else if (d.status === "cancelled") {
        statusLabel = "<span style='color:#ef4444;font-weight:bold;'>取消済</span>";
      }

      checkinDetails.innerHTML = `
        <p><strong>グループ:</strong> ${escapeHtml(d.groupName)}</p>
        <p><strong>人数:</strong> ${d.count}名</p>
        <p><strong>時間:</strong> ${d.timeSlot}</p>
        <p><strong>区分:</strong> ${d.isRepeat ? "再入場" : "初回"}</p>
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
      alert("受付が完了しました");
      checkinModal.classList.remove("active");
      resumeScanner();
    } catch (err) {
      alert("受付更新エラー: " + err.message);
    }
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