document.addEventListener("DOMContentLoaded", () => {
  let reservations = [];
  let html5QrCode = null;
  let activeCheckinDocId = null;

  // DOM要素
  const tabs = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  const timeSlotSelect = document.getElementById("time-slot");
  const filterSlotSelect = document.getElementById("filter-slot");
  const reservationForm = document.getElementById("reservation-form");

  const qrModal = document.getElementById("qr-modal");
  const modalQrCodeContainer = document.getElementById("modal-qrcode");
  const modalTicketUrl = document.getElementById("modal-ticket-url");
  const btnCloseQrModal = document.getElementById("btn-close-qr-modal");

  const btnStartScan = document.getElementById("btn-start-scan");
  const btnStopScan = document.getElementById("btn-stop-scan");
  const scanMessage = document.getElementById("scan-message");
  const checkinModal = document.getElementById("checkin-modal");
  const checkinDetails = document.getElementById("checkin-details");
  const btnConfirmCheckin = document.getElementById("btn-confirm-checkin");
  const btnCancelCheckin = document.getElementById("btn-cancel-checkin");

  // 1. 時間枠の選択肢初期化
  APP_CONFIG.timeSlots.forEach(slot => {
    const optForm = document.createElement("option");
    optForm.value = slot;
    optForm.textContent = slot;
    timeSlotSelect.appendChild(optForm);

    const optFilter = document.createElement("option");
    optFilter.value = slot;
    optFilter.textContent = slot;
    filterSlotSelect.appendChild(optFilter);
  });

  // 2. タブ切り替え
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");

      // スキャンタブ以外に切り替わったらカメラを停止
      if (btn.dataset.tab !== "tab-scan") {
        stopScanner();
      }
    });
  });

  // 3. 予約登録
  reservationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const groupName = document.getElementById("group-name").value.trim();
    const count = parseInt(document.getElementById("group-count").value, 10);
    const timeSlot = timeSlotSelect.value;

    if (!groupName || isNaN(count) || count < 1) {
      alert("正しいグループ名と人数を入力してください。");
      return;
    }

    try {
      const docRef = await db.collection("reservations").add({
        groupName: groupName,
        count: count,
        timeSlot: timeSlot,
        status: "reserved",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        checkedInAt: null
      });

      // フォームリセット
      reservationForm.reset();
      document.getElementById("group-count").value = "2";

      // 客用整理券URL（環境非依存）
      const baseUrl = window.location.href.split("?")[0].replace("index.html", "");
      const separator = baseUrl.endsWith("/") ? "" : "/";
      const ticketUrl = `${baseUrl}${separator}ticket.html?id=${docRef.id}`;

      // モーダルでQRを表示
      modalQrCodeContainer.innerHTML = "";
      new QRCode(modalQrCodeContainer, {
        text: ticketUrl,
        width: 220,
        height: 220,
        correctLevel: QRCode.CorrectLevel.M
      });
      modalTicketUrl.textContent = ticketUrl;
      qrModal.classList.add("active");
    } catch (err) {
      console.error(err);
      alert("予約の登録に失敗しました: " + err.message);
    }
  });

  btnCloseQrModal.addEventListener("click", () => {
    qrModal.classList.remove("active");
  });

  // 4. リアルタイム同期 (Firestore onSnapshot)
  db.collection("reservations")
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      reservations = [];
      snapshot.forEach(doc => {
        reservations.push({ id: doc.id, ...doc.data() });
      });
      updateSlotStatusCards();
      renderReservationTable();
    }, error => {
      console.error("Firestore onSnapshot error:", error);
    });

  // 空き状況の描画
  function updateSlotStatusCards() {
    const container = document.getElementById("slots-status");
    container.innerHTML = "";

    APP_CONFIG.timeSlots.forEach(slot => {
      const totalCount = reservations
        .filter(r => r.timeSlot === slot && r.status !== "cancelled")
        .reduce((sum, r) => sum + (Number(r.count) || 0), 0);

      const remain = Math.max(0, APP_CONFIG.capacityPerSlot - totalCount);
      const isFull = remain === 0;

      const card = document.createElement("div");
      card.className = `slot-card ${isFull ? "full" : ""}`;
      card.innerHTML = `
        <div class="slot-name">${slot}</div>
        <div class="slot-remain">${remain}人 / 空き</div>
        <div style="font-size:0.75rem; color:#64748b;">(${totalCount}/${APP_CONFIG.capacityPerSlot}人)</div>
      `;
      container.appendChild(card);
    });
  }

  // 予約一覧テーブルの描画
  function renderReservationTable() {
    const tbody = document.getElementById("reservation-tbody");
    tbody.innerHTML = "";
    const filter = filterSlotSelect.value;

    const targetList = reservations.filter(r => filter === "all" || r.timeSlot === filter);

    targetList.forEach(res => {
      const tr = document.createElement("tr");

      let badgeHtml = '<span class="status-badge status-reserved">予約中</span>';
      if (res.status === "checked_in") {
        badgeHtml = '<span class="status-badge status-checked_in">受付済</span>';
      } else if (res.status === "cancelled") {
        badgeHtml = '<span class="status-badge status-cancelled">キャンセル</span>';
      }

      let actionsHtml = "-";
      if (res.status === "reserved") {
        actionsHtml = `
          <div class="table-actions">
            <button class="btn primary small" onclick="window.triggerCheckin('${res.id}')">受付</button>
            <button class="btn danger small" onclick="window.triggerCancel('${res.id}')">取消</button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td>${res.timeSlot}</td>
        <td><strong>${escapeHtml(res.groupName)}</strong></td>
        <td>${res.count} 名</td>
        <td>${badgeHtml}</td>
        <td>${actionsHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  filterSlotSelect.addEventListener("change", renderReservationTable);

  // 5. カメラ受付（html5-qrcode）
  html5QrCode = new Html5Qrcode("qr-reader");

  btnStartScan.addEventListener("click", () => {
    btnStartScan.style.display = "none";
    btnStopScan.style.display = "block";
    scanMessage.textContent = "カメラ読み取り中...";

    const config = { fps: 10, qrbox: { width: 240, height: 240 } };
    html5QrCode.start(
      { facingMode: "environment" },
      config,
      onQrScanSuccess,
      () => {}
    ).catch(err => {
      console.error(err);
      alert("カメラの起動に失敗しました。アクセス権限を確認してください。");
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

  // 手動受付・キャンセル用に関数をグローバル登録
  window.triggerCheckin = (id) => openCheckinModal(id);
  window.triggerCancel = async (id) => {
    if (confirm("この予約をキャンセル（無効化）しますか？")) {
      try {
        await db.collection("reservations").doc(id).update({
          status: "cancelled"
        });
      } catch (err) {
        alert("キャンセル処理に失敗しました: " + err.message);
      }
    }
  };

  async function openCheckinModal(docId) {
    activeCheckinDocId = docId;
    try {
      const doc = await db.collection("reservations").doc(docId).get();
      if (!doc.exists) {
        alert("該当する予約が見つかりません (ID: " + docId + ")");
        resumeScanner();
        return;
      }

      const data = doc.data();
      let statusString = "<span style='color:#eab308; font-weight:bold;'>未受付</span>";
      if (data.status === "checked_in") {
        statusString = "<span style='color:#16a34a; font-weight:bold;'>【受付完了済み】</span>";
      } else if (data.status === "cancelled") {
        statusString = "<span style='color:#dc2626; font-weight:bold;'>【キャンセル済み】</span>";
      }

      checkinDetails.innerHTML = `
        <p><strong>グループ名:</strong> ${escapeHtml(data.groupName)}</p>
        <p><strong>参加人数:</strong> ${data.count} 名</p>
        <p><strong>予約時間枠:</strong> ${data.timeSlot}</p>
        <p><strong>現在の状態:</strong> ${statusString}</p>
      `;

      if (data.status === "reserved") {
        btnConfirmCheckin.disabled = false;
        btnConfirmCheckin.style.display = "block";
      } else {
        btnConfirmCheckin.disabled = true;
        btnConfirmCheckin.style.display = "none";
      }

      checkinModal.classList.add("active");
    } catch (err) {
      console.error(err);
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
      alert("受付処理が完了しました！");
      checkinModal.classList.remove("active");
      resumeScanner();
    } catch (err) {
      alert("更新エラー: " + err.message);
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