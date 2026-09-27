document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get("id");
  const loader = document.getElementById("loader");
  const wrapper = document.getElementById("ticket-wrapper");

  if (!ticketId) {
    renderAndDisplayErrorImage("エラー: 予約IDが指定されていません。");
    return;
  }

  try {
    // 1. Firestoreから予約データを取得
    const doc = await db.collection("reservations").doc(ticketId).get();
    if (!doc.exists) {
      renderAndDisplayErrorImage("エラー: 該当する予約情報が存在しません。");
      return;
    }

    const data = doc.data();
    if (data.status === "cancelled") {
      renderAndDisplayErrorImage("この整理券はキャンセルされています。");
      return;
    }

    // 2. 受付用QRコードの非同期生成待機
    const qrSourceElement = await generateQRCodeAsync(ticketId);

    // 3. Canvasによるチケット画像の合成
    const ticketDataUrl = createTicketCanvas(data, qrSourceElement, ticketId);

    // 4. 画像DOMの配置とローダー完全消去
    displayFinalImage(ticketDataUrl, "入場整理券");
  } catch (err) {
    console.error(err);
    renderAndDisplayErrorImage("システムエラーが発生しました。\nスタッフにお声がけください。");
  }

  /**
   * QRCode.jsの完了を確実に待機する堅牢なPromise
   */
  function generateQRCodeAsync(text) {
    return new Promise((resolve, reject) => {
      const tempContainer = document.getElementById("temp-qrcode");
      tempContainer.innerHTML = "";

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error("QRコードの生成がタイムアウトしました。"));
      }, 5000);

      const observer = new MutationObserver(() => {
        const canvas = tempContainer.querySelector("canvas");
        const img = tempContainer.querySelector("img");

        if (canvas) {
          clearTimeout(timeoutId);
          observer.disconnect();
          resolve(canvas);
        } else if (img) {
          if (img.complete && img.naturalWidth > 0) {
            clearTimeout(timeoutId);
            observer.disconnect();
            resolve(img);
          } else {
            img.onload = () => {
              clearTimeout(timeoutId);
              observer.disconnect();
              resolve(img);
            };
            img.onerror = () => {
              clearTimeout(timeoutId);
              observer.disconnect();
              reject(new Error("QR画像の読み込みに失敗しました。"));
            };
          }
        }
      });

      observer.observe(tempContainer, { childList: true, subtree: true });

      new QRCode(tempContainer, {
        text: text,
        width: 256,
        height: 256,
        correctLevel: QRCode.CorrectLevel.H
      });
    });
  }

  /**
   * チケット画像（Canvas合成）の生成
   */
  function createTicketCanvas(data, qrElement, id) {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 1250;
    const ctx = canvas.getContext("2d");

    // 全体背景
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, "#ffffff");
    bgGradient.addColorStop(1, "#f8fafc");
    ctx.fillStyle = bgGradient;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 36, true, false);

    // ヘッダーバナー
    const headerGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    headerGradient.addColorStop(0, "#1e3a8a");
    headerGradient.addColorStop(1, "#2563eb");
    ctx.fillStyle = headerGradient;
    roundRectCustomTop(ctx, 0, 0, canvas.width, 160, 36);

    // クラス名・タイトル描画
    ctx.fillStyle = "#93c5fd";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(APP_CONFIG.className || "2年4組", canvas.width / 2, 58);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(APP_CONFIG.attractionName || "文化祭アトラクション", canvas.width / 2, 118);

    // バッジ
    ctx.fillStyle = "#dbeafe";
    roundRect(ctx, canvas.width / 2 - 110, 190, 220, 44, 22, true, false);
    ctx.fillStyle = "#1e40af";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("入場整理券", canvas.width / 2, 220);

    // 時間枠ブロック
    ctx.fillStyle = "#eff6ff";
    roundRect(ctx, 50, 260, 650, 136, 18, true, false);
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 2;
    roundRect(ctx, 50, 260, 650, 136, 18, false, true);

    ctx.fillStyle = "#1e40af";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("ご案内時間", canvas.width / 2, 298);

    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 52px sans-serif";
    ctx.fillText(data.timeSlot, canvas.width / 2, 364);

    // 代表者名 & 人数
    ctx.fillStyle = "#475569";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("グループ名 / 人数", canvas.width / 2, 440);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 44px sans-serif";
    const displayName = data.groupName.length > 12 ? data.groupName.substring(0, 11) + "…" : data.groupName;
    ctx.fillText(`${displayName} 様`, canvas.width / 2, 495);

    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(`ご参加人数：${data.count} 名`, canvas.width / 2, 545);

    // チケット切り取り破線
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(40, 595);
    ctx.lineTo(710, 595);
    ctx.stroke();
    ctx.setLineDash([]);

    // QR枠
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 235, 630, 280, 280, 18, true, false);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    roundRect(ctx, 235, 630, 280, 280, 18, false, true);

    // QRコード転写
    if (qrElement) {
      ctx.drawImage(qrElement, 255, 650, 240, 240);
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "18px monospace";
    ctx.fillText(`ID: ${id}`, canvas.width / 2, 940);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("【受付時にこのQRをご提示ください】", canvas.width / 2, 985);

    // 注意事項
    ctx.fillStyle = "#f1f5f9";
    roundRect(ctx, 50, 1025, 650, 180, 16, true, false);

    ctx.fillStyle = "#334155";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("■ ご来場時の注意点", 75, 1065);
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText("・時間の5分前までに2年4組前へお越しください。", 75, 1105);
    ctx.fillText("・通信不良に備え、画像を長押しして保存してください。", 75, 1140);
    ctx.fillText("・時間を大幅に過ぎた場合は無効となる場合があります。", 75, 1175);

    return canvas.toDataURL("image/png");
  }

  /**
   * エラー時もテキストDOMを残さずCanvas画像で表示する関数
   */
  function renderAndDisplayErrorImage(errorMessage) {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 36, true, false);

    ctx.fillStyle = "#dc2626";
    roundRectCustomTop(ctx, 0, 0, canvas.width, 130, 36);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("整理券 読み込みエラー", canvas.width / 2, 82);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 30px sans-serif";
    const lines = errorMessage.split("\n");
    let startY = 250;
    lines.forEach(line => {
      ctx.fillText(line, canvas.width / 2, startY);
      startY += 50;
    });

    ctx.fillStyle = "#64748b";
    ctx.font = "22px sans-serif";
    ctx.fillText("スタッフへ直接お問い合わせください。", canvas.width / 2, 480);

    displayFinalImage(canvas.toDataURL("image/png"), "エラー通知");
  }

  /**
   * 最終的な<img>のみを配置してローダーを排除する処理
   */
  function displayFinalImage(dataUrl, altText) {
    wrapper.innerHTML = "";
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = altText;
    wrapper.appendChild(img);

    // ローダーDOMを完全削除
    if (loader && loader.parentNode) {
      loader.parentNode.removeChild(loader);
    }
  }

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
});