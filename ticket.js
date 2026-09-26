document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get("id");
  const loader = document.getElementById("loader");
  const wrapper = document.getElementById("ticket-wrapper");

  if (!ticketId) {
    showError("予約IDが指定されていません。");
    return;
  }

  try {
    // 1. Firestoreからチケット情報を取得
    const doc = await db.collection("reservations").doc(ticketId).get();
    if (!doc.exists) {
      showError("予約情報が見つかりませんでした。");
      return;
    }
    const data = doc.data();

    // 2. 受付用QRコード（ドキュメントIDそのもの）を一時生成
    const qrCanvas = await generateTempQRCode(ticketId);

    // 3. チケット画像をCanvasで動的描画
    const ticketImageBase64 = createTicketCanvas(data, qrCanvas, ticketId);

    // 4. 生成したPNGを唯一の <img> タグとしてDOMに注入
    const img = document.createElement("img");
    img.src = ticketImageBase64;
    img.alt = "入場整理券";
    wrapper.appendChild(img);

    // 5. ローダーを削除（テキストDOM要素を完全排除）
    if (loader && loader.parentNode) {
      loader.parentNode.removeChild(loader);
    }
  } catch (err) {
    showError("整理券の生成に失敗しました: " + err.message);
  }

  // オフスクリーンQRコード生成
  function generateTempQRCode(text) {
    return new Promise((resolve) => {
      const tempDiv = document.getElementById("temp-qrcode");
      tempDiv.innerHTML = "";
      new QRCode(tempDiv, {
        text: text,
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.H
      });
      // QRCode.jsがcanvasまたはimgを出力するのを待つ
      setTimeout(() => {
        const qrEl = tempDiv.querySelector("canvas") || tempDiv.querySelector("img");
        resolve(qrEl);
      }, 100);
    });
  }

  // Canvasによるチケット画像描画処理（縦長・高解像度 750x1200）
  function createTicketCanvas(data, qrElement, id) {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");

    // 背景（グラデーション）
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, "#ffffff");
    bgGradient.addColorStop(1, "#f1f5f9");
    ctx.fillStyle = bgGradient;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 30, true);

    // ヘッダー装飾帯
    ctx.fillStyle = "#1e3a8a";
    roundRectCustomTop(ctx, 0, 0, canvas.width, 160, 30);

    // クラス名・企画ロゴテキスト
    ctx.fillStyle = "#93c5fd";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("2年4組 文化祭企画", canvas.width / 2, 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText(APP_CONFIG.title.replace("2年4組 ", ""), canvas.width / 2, 120);

    // チケット種別バッジ
    ctx.fillStyle = "#e0e7ff";
    roundRect(ctx, canvas.width / 2 - 120, 190, 240, 46, 23, true);
    ctx.fillStyle = "#3730a3";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("入場整理券", canvas.width / 2, 222);

    // 予約枠（時間帯）ブロック
    ctx.fillStyle = "#eff6ff";
    roundRect(ctx, 50, 260, 650, 130, 16, true);
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 2;
    roundRect(ctx, 50, 260, 650, 130, 16, false, true);

    ctx.fillStyle = "#1e40af";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("ご案内時間", canvas.width / 2, 298);

    ctx.fillStyle = "#dc2626"; // 時間枠は大きく赤系で視認性を高く
    ctx.font = "bold 52px sans-serif";
    ctx.fillText(data.timeSlot, canvas.width / 2, 360);

    // グループ名 & 人数
    ctx.fillStyle = "#334155";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("代表者 / 人数", canvas.width / 2, 435);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(`${data.groupName} 様`, canvas.width / 2, 485);

    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText(`参加人数：${data.count} 名`, canvas.width / 2, 535);

    // 切り取り線風の破線
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(40, 580);
    ctx.lineTo(710, 580);
    ctx.stroke();
    ctx.setLineDash([]); // 破線解除

    // 受付用QRコードの描画枠
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 235, 620, 280, 280, 16, true);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    roundRect(ctx, 235, 620, 280, 280, 16, false, true);

    // QR本体を描画
    if (qrElement) {
      ctx.drawImage(qrElement, 255, 640, 240, 240);
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "20px monospace";
    ctx.fillText(`ID: ${id}`, canvas.width / 2, 930);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("【受付時にこのQRコードをご提示ください】", canvas.width / 2, 975);

    // 注意事項エリア
    ctx.fillStyle = "#f8fafc";
    roundRect(ctx, 50, 1010, 650, 150, 12, true);

    ctx.fillStyle = "#475569";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("※ 注意事項", 75, 1045);
    ctx.font = "20px sans-serif";
    ctx.fillText("・指定時間の5分前までに2年4組教室前にお越しください。", 75, 1080);
    ctx.fillText("・画面を長押しして画像をスマホに保存しておくと安心です。", 75, 1112);
    ctx.fillText("・時間を過ぎた場合はキャンセル扱いとなる場合があります。", 75, 1144);

    return canvas.toDataURL("image/png");
  }

  // 角丸矩形描画ヘルパー
  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // 上部のみ角丸
  function roundRectCustomTop(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  function showError(msg) {
    if (loader) {
      loader.innerHTML = `<p style="color:#ef4444; font-weight:bold; padding:20px; text-align:center;">${msg}</p>`;
    }
  }
});