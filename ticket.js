document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get("id");
  const loader = document.getElementById("loader");
  const wrapper = document.getElementById("ticket-wrapper");

  if (!ticketId) {
    renderAndDisplayErrorImage("エラー: 整理券IDが指定されていません。");
    return;
  }

  try {
    const doc = await db.collection("reservations").doc(ticketId).get();
    if (!doc.exists) {
      renderAndDisplayErrorImage("エラー: 該当する整理券が存在しません。");
      return;
    }

    const data = doc.data();
    if (data.status === "cancelled") {
      renderAndDisplayErrorImage("この整理券は取り消しされています。");
      return;
    }

    const qrElement = await generateQRCodeAsync(ticketId);
    const ticketDataUrl = createTicketCanvas(data, qrElement, ticketId);
    displayFinalImage(ticketDataUrl, "入場整理券");
  } catch (err) {
    console.error(err);
    renderAndDisplayErrorImage("整理券の生成に失敗しました。");
  }

  function generateQRCodeAsync(text) {
    return new Promise((resolve, reject) => {
      const tempContainer = document.getElementById("temp-qrcode");
      tempContainer.innerHTML = "";

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(new Error("QRコード生成タイムアウト"));
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

  function createTicketCanvas(data, qrElement, id) {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");

    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(1, "#f8fafc");
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 32, true, false);

    // ヘッダー帯
    const headerGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    headerGrad.addColorStop(0, "#1e3a8a");
    headerGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = headerGrad;
    roundRectCustomTop(ctx, 0, 0, canvas.width, 150, 32);

    ctx.fillStyle = "#93c5fd";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(APP_CONFIG.className, canvas.width / 2, 54);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText("入場整理券", canvas.width / 2, 110);

    // 区分バッジ（初回 / 再入場）
    const isRepeat = !!data.isRepeat;
    ctx.fillStyle = isRepeat ? "#fef3c7" : "#dbeafe";
    roundRect(ctx, canvas.width / 2 - 100, 175, 200, 40, 20, true, false);
    ctx.fillStyle = isRepeat ? "#92400e" : "#1e40af";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(isRepeat ? "再入場" : "初回", canvas.width / 2, 203);

    // 時間枠
    ctx.fillStyle = "#eff6ff";
    roundRect(ctx, 50, 240, 650, 130, 16, true, false);
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 2;
    roundRect(ctx, 50, 240, 650, 130, 16, false, true);

    ctx.fillStyle = "#1e40af";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("案内時間", canvas.width / 2, 278);

    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 58px sans-serif";
    ctx.fillText(data.timeSlot, canvas.width / 2, 345);

    // グループ名 & 人数
    ctx.fillStyle = "#475569";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("グループ名 / 人数", canvas.width / 2, 410);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 42px sans-serif";
    const displayName = data.groupName.length > 12 ? data.groupName.substring(0, 11) + "…" : data.groupName;
    ctx.fillText(`${displayName} 様`, canvas.width / 2, 460);

    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(`${data.count} 名`, canvas.width / 2, 508);

    // 破線
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(40, 550);
    ctx.lineTo(710, 550);
    ctx.stroke();
    ctx.setLineDash([]);

    // QR枠
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 235, 580, 280, 280, 16, true, false);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    roundRect(ctx, 235, 580, 280, 280, 16, false, true);

    if (qrElement) {
      ctx.drawImage(qrElement, 255, 600, 240, 240);
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "18px monospace";
    ctx.fillText(`ID: ${id}`, canvas.width / 2, 890);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("受付時にこのQRコードをご提示ください", canvas.width / 2, 935);

    // 簡潔な案内枠
    ctx.fillStyle = "#f1f5f9";
    roundRect(ctx, 50, 970, 650, 180, 16, true, false);

    ctx.fillStyle = "#334155";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ご案内", 75, 1010);
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText("・案内時間の5分前までに2年4組前へお越しください。", 75, 1050);
    ctx.fillText("・画像を長押しして保存してください。", 75, 1088);
    ctx.fillText("・1枚の整理券で全員同時に入場できます。", 75, 1124);

    return canvas.toDataURL("image/png");
  }

  function renderAndDisplayErrorImage(msg) {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 32, true, false);

    ctx.fillStyle = "#dc2626";
    roundRectCustomTop(ctx, 0, 0, canvas.width, 120, 32);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("整理券 エラー", canvas.width / 2, 75);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(msg, canvas.width / 2, 260);

    ctx.fillStyle = "#64748b";
    ctx.font = "22px sans-serif";
    ctx.fillText("スタッフへ直接お問い合わせください。", canvas.width / 2, 380);

    displayFinalImage(canvas.toDataURL("image/png"), "エラー画像");
  }

  function displayFinalImage(dataUrl, alt) {
    wrapper.innerHTML = "";
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = alt;
    wrapper.appendChild(img);

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