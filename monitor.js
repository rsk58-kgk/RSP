document.addEventListener("DOMContentLoaded", () => {
  const slotsContainer = document.getElementById("slots-container");
  const liveClock = document.getElementById("live-clock");

  let maxGroupsPerSlot = APP_CONFIG.defaultMaxGroupsPerSlot;
  let activeTimeSlots = APP_CONFIG.generateTimeSlots();
  let reservations = [];

  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    liveClock.textContent = `${h}:${m}:${s}`;
  }
  setInterval(updateClock, 1000);
  updateClock();

  db.collection("settings").doc("config").onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (data.maxGroupsPerSlot) maxGroupsPerSlot = Number(data.maxGroupsPerSlot);
      if (data.openTime && data.closeTime) {
        activeTimeSlots = APP_CONFIG.generateTimeSlots(data.openTime, data.closeTime);
      }
    }
    renderBoard();
  });

  db.collection("reservations").onSnapshot(snapshot => {
    reservations = [];
    snapshot.forEach(d => {
      reservations.push({ id: d.id, ...d.data() });
    });
    renderBoard();
  });

  function renderBoard() {
    slotsContainer.innerHTML = "";
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    activeTimeSlots.forEach(slot => {
      const [slotH, slotM] = slot.split(":").map(Number);
      const slotMinutes = slotH * 60 + slotM;

      const groupCount = reservations.filter(
        r => r.timeSlot === slot && r.status !== "cancelled"
      ).length;

      const remain = Math.max(0, maxGroupsPerSlot - groupCount);
      const isFull = remain === 0;
      const isPast = slotMinutes + APP_CONFIG.timeSlotDurationMinutes <= currentMinutes;
      const isCurrent = slotMinutes <= currentMinutes && currentMinutes < slotMinutes + APP_CONFIG.timeSlotDurationMinutes;

      const card = document.createElement("div");
      let stateClass = "available";
      if (isFull) stateClass = "full";
      else if (remain === 1) stateClass = "few";

      card.className = `slot-item ${stateClass} ${isPast ? "past" : ""} ${isCurrent ? "is-current" : ""}`;

      let remainText = isFull ? "満員" : `${remain}<span class="slot-unit">組</span>`;
      if (isPast && !isCurrent) {
        remainText = `<span style="font-size:1.4rem;color:#64748b;">終了</span>`;
      }

      card.innerHTML = `
        <div class="slot-time">${slot}</div>
        <div class="slot-remain-num">${remainText}</div>
      `;
      slotsContainer.appendChild(card);
    });
  }
});