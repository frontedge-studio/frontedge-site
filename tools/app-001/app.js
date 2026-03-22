const STORAGE_KEY = "confirmly-v1";

const defaultItems = [
  {
    id: crypto.randomUUID(),
    name: "Locked front door",
    isImportant: true,
    notesEnabled: true,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  },
  {
    id: crypto.randomUUID(),
    name: "Took evening medication",
    isImportant: false,
    notesEnabled: true,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  },
  {
    id: crypto.randomUUID(),
    name: "Fed the dog",
    isImportant: false,
    notesEnabled: true,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  },
];

const state = {
  items: [],
  events: [],
  pendingNoteEventId: null,
};

const elements = {
  itemsList: document.getElementById("items-list"),
  summaryText: document.getElementById("summary-text"),
  itemTemplate: document.getElementById("item-card-template"),

  itemModal: document.getElementById("item-modal"),
  addItemButton: document.getElementById("add-item-button"),
  closeItemModalButton: document.getElementById("close-item-modal"),
  cancelItemButton: document.getElementById("cancel-item-button"),
  itemForm: document.getElementById("item-form"),
  itemNameInput: document.getElementById("item-name"),
  itemImportantInput: document.getElementById("item-important"),
  itemNotesInput: document.getElementById("item-notes"),

  noteModal: document.getElementById("note-modal"),
  noteForm: document.getElementById("note-form"),
  noteInput: document.getElementById("confirm-note"),
  skipNoteButton: document.getElementById("skip-note-button"),
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    state.items = defaultItems;
    state.events = [];
    saveState();
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    state.items = Array.isArray(parsed.items) ? parsed.items : defaultItems;
    state.events = Array.isArray(parsed.events) ? parsed.events : [];
  } catch (error) {
    console.error("Could not load Confirmly state.", error);
    state.items = defaultItems;
    state.events = [];
    saveState();
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      items: state.items,
      events: state.events,
    })
  );
}

function getActiveItems() {
  return state.items.filter((item) => !item.archivedAt);
}

function getEventsForItem(itemId) {
  return state.events
    .filter((event) => event.itemId === itemId)
    .sort((a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt));
}

function getLastEventForItem(itemId) {
  return getEventsForItem(itemId)[0] || null;
}

function formatRelativeTime(isoString) {
  if (!isoString) return "Never";

  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now - then;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";

  if (diffMs < hour) {
    const mins = Math.floor(diffMs / minute);
    return `${mins} min ago`;
  }

  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `${hours} hr ago`;
  }

  const days = Math.floor(diffMs / day);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatFullDateTime(isoString) {
  return new Date(isoString).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSummary() {
  const activeItems = getActiveItems();
  const confirmedTodayCount = activeItems.filter((item) => {
    const lastEvent = getLastEventForItem(item.id);
    if (!lastEvent) return false;

    const last = new Date(lastEvent.confirmedAt);
    const now = new Date();

    return (
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate()
    );
  }).length;

  elements.summaryText.textContent =
    activeItems.length === 0
      ? "No items yet"
      : `${confirmedTodayCount} of ${activeItems.length} confirmed today`;
}

function renderItems() {
  const activeItems = getActiveItems().sort((a, b) => {
    const aLast = getLastEventForItem(a.id)?.confirmedAt || "";
    const bLast = getLastEventForItem(b.id)?.confirmedAt || "";
    return bLast.localeCompare(aLast);
  });

  elements.itemsList.innerHTML = "";

  if (activeItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item-card";
    empty.innerHTML = `
      <h3>No items yet</h3>
      <p class="hold-help-text">Add your first item to start using Confirmly.</p>
    `;
    elements.itemsList.appendChild(empty);
    renderSummary();
    return;
  }

  activeItems.forEach((item) => {
    const fragment = elements.itemTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".item-card");
    const itemName = fragment.querySelector(".item-name");
    const itemBadge = fragment.querySelector(".item-badge");
    const noteSetting = fragment.querySelector(".item-note-setting");
    const lastConfirmedValue = fragment.querySelector(".item-last-confirmed-value");
    const confirmButton = fragment.querySelector(".confirm-button");
    const historyToggleButton = fragment.querySelector(".history-toggle-button");
    const historyPanel = fragment.querySelector(".history-panel");
    const historyList = fragment.querySelector(".history-list");
    const holdWrap = fragment.querySelector(".hold-wrap");
    const holdProgressBar = fragment.querySelector(".hold-progress-bar");
    const holdHelpText = fragment.querySelector(".hold-help-text");

    const lastEvent = getLastEventForItem(item.id);

    itemName.textContent = item.name;

    if (item.isImportant) {
      itemBadge.classList.remove("hidden");
      holdWrap.classList.remove("hidden");
      confirmButton.textContent = "Important Item";
      holdHelpText.textContent = "Press and hold to confirm";
    }

    noteSetting.textContent = item.notesEnabled ? "Notes on" : "Notes off";

    lastConfirmedValue.textContent = lastEvent
      ? `${formatRelativeTime(lastEvent.confirmedAt)} · ${formatFullDateTime(lastEvent.confirmedAt)}`
      : "Never";

    const itemEvents = getEventsForItem(item.id).slice(0, 5);

    if (itemEvents.length === 0) {
      historyList.innerHTML = "<li>No confirmations yet.</li>";
    } else {
      historyList.innerHTML = itemEvents
        .map((event) => {
          const noteText = event.note
            ? ` — Note: ${escapeHtml(event.note)}`
            : "";
          return `<li>${escapeHtml(formatFullDateTime(event.confirmedAt))}${noteText}</li>`;
        })
        .join("");
    }

    historyToggleButton.addEventListener("click", () => {
      historyPanel.classList.toggle("hidden");
      historyToggleButton.textContent = historyPanel.classList.contains("hidden")
        ? "History"
        : "Hide History";
    });

    if (item.isImportant) {
      wireHoldToConfirm({
        triggerElement: confirmButton,
        progressBarElement: holdProgressBar,
        onComplete: () => confirmItem(item.id),
      });
    } else {
      confirmButton.addEventListener("click", () => {
        confirmItem(item.id);
      });
    }

    elements.itemsList.appendChild(fragment);

    requestAnimationFrame(() => {
      card.style.removeProperty("opacity");
    });
  });

  renderSummary();
}

function wireHoldToConfirm({ triggerElement, progressBarElement, onComplete }) {
  let holdTimer = null;
  let isHolding = false;

  const resetHold = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    isHolding = false;
    progressBarElement.style.transition = "width 0ms linear";
    progressBarElement.style.width = "0%";
  };

  const startHold = () => {
    if (isHolding) return;
    isHolding = true;

    progressBarElement.style.transition = "width 1000ms linear";
    progressBarElement.style.width = "100%";

    holdTimer = window.setTimeout(() => {
      onComplete();
      resetHold();
    }, 1000);
  };

  triggerElement.addEventListener("mousedown", startHold);
  triggerElement.addEventListener("touchstart", startHold, { passive: true });

  ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((eventName) => {
    triggerElement.addEventListener(eventName, resetHold);
  });
}

function confirmItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;

  const newEvent = {
    id: crypto.randomUUID(),
    itemId,
    confirmedAt: new Date().toISOString(),
    note: "",
  };

  state.events.push(newEvent);
  saveState();
  renderItems();
  flashItemCard(itemId);

  if (item.notesEnabled) {
    state.pendingNoteEventId = newEvent.id;
    openNoteModal();
  }
}

function flashItemCard(itemId) {
  const cards = Array.from(document.querySelectorAll(".item-card"));
  const matchingCard = cards.find((card) => {
    const cardTitle = card.querySelector(".item-name");
    const item = state.items.find((entry) => entry.id === itemId);
    return cardTitle && item && cardTitle.textContent === item.name;
  });

  if (!matchingCard) return;

  matchingCard.classList.remove("confirmed-flash");
  void matchingCard.offsetWidth;
  matchingCard.classList.add("confirmed-flash");
}

function addItem({ name, isImportant, notesEnabled }) {
  state.items.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    isImportant,
    notesEnabled,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  });

  saveState();
  renderItems();
}

function openItemModal() {
  elements.itemModal.classList.remove("hidden");
  elements.itemModal.setAttribute("aria-hidden", "false");
  elements.itemNameInput.focus();
}

function closeItemModal() {
  elements.itemModal.classList.add("hidden");
  elements.itemModal.setAttribute("aria-hidden", "true");
  elements.itemForm.reset();
  elements.itemNotesInput.checked = true;
}

function openNoteModal() {
  elements.noteModal.classList.remove("hidden");
  elements.noteModal.setAttribute("aria-hidden", "false");
  elements.noteInput.value = "";
  elements.noteInput.focus();
}

function closeNoteModal() {
  elements.noteModal.classList.add("hidden");
  elements.noteModal.setAttribute("aria-hidden", "true");
  elements.noteInput.value = "";
  state.pendingNoteEventId = null;
}

function savePendingNote(noteValue) {
  const eventId = state.pendingNoteEventId;
  if (!eventId) return;

  const event = state.events.find((entry) => entry.id === eventId);
  if (!event) return;

  event.note = noteValue.trim();
  saveState();
  renderItems();
}

function wireEvents() {
  elements.addItemButton.addEventListener("click", openItemModal);
  elements.closeItemModalButton.addEventListener("click", closeItemModal);
  elements.cancelItemButton.addEventListener("click", closeItemModal);

  elements.itemModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
      closeItemModal();
    }
  });

  elements.itemForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = elements.itemNameInput.value.trim();
    if (!name) return;

    addItem({
      name,
      isImportant: elements.itemImportantInput.checked,
      notesEnabled: elements.itemNotesInput.checked,
    });

    closeItemModal();
  });

  elements.noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    savePendingNote(elements.noteInput.value);
    closeNoteModal();
  });

  elements.skipNoteButton.addEventListener("click", () => {
    closeNoteModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeItemModal();
      closeNoteModal();
    }
  });
}

function init() {
  loadState();
  wireEvents();
  renderItems();
}

init();
