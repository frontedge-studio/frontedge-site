const STORAGE_KEY = "confirmly-v2";

const notePlaceholders = [
  "Triple checked. Brain can relax now.",
  "Door locked. Future me, you’re welcome.",
  "Yes, this really happened.",
  "Confirmed and moving on.",
  "Handled like a legend.",
  "All set. No second guessing.",
  "Did the thing. Logging the glory.",
  "Locked in. Literally.",
  "Consider this officially done.",
  "I checked. The universe may proceed.",
];

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
  currentItemMode: "create",
  currentEditingItemId: null,
  showingArchived: false,
};

const elements = {
  itemsList: document.getElementById("items-list"),
  summaryText: document.getElementById("summary-text"),
  listTitle: document.getElementById("list-title"),
  itemTemplate: document.getElementById("item-card-template"),

  itemModal: document.getElementById("item-modal"),
  addItemButton: document.getElementById("add-item-button"),
  floatingAddButton: document.getElementById("floating-add-button"),
  viewArchivedButton: document.getElementById("view-archived-button"),
  closeItemModalButton: document.getElementById("close-item-modal"),
  cancelItemButton: document.getElementById("cancel-item-button"),
  itemForm: document.getElementById("item-form"),
  itemIdInput: document.getElementById("item-id"),
  itemNameInput: document.getElementById("item-name"),
  itemImportantInput: document.getElementById("item-important"),
  itemNotesInput: document.getElementById("item-notes"),
  saveItemButton: document.getElementById("save-item-button"),
  itemModalTitle: document.getElementById("item-modal-title"),

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

function getVisibleItems() {
  return state.items.filter((item) => {
    if (state.showingArchived) {
      return Boolean(item.archivedAt);
    }
    return !item.archivedAt;
  });
}

function getActiveItems() {
  return state.items.filter((item) => !item.archivedAt);
}

function getEventsForItem(itemId) {
  return state.events
    .filter((event) => event.itemId === itemId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getLastConfirmEventForItem(itemId) {
  return getEventsForItem(itemId).find((event) => event.type === "confirm") || null;
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

function createEvent({ itemId, type, detail, note = "" }) {
  state.events.push({
    id: crypto.randomUUID(),
    itemId,
    type,
    detail,
    note,
    createdAt: new Date().toISOString(),
  });
}

function renderSummary() {
  const activeItems = getActiveItems();
  const confirmedTodayCount = activeItems.filter((item) => {
    const lastEvent = getLastConfirmEventForItem(item.id);
    if (!lastEvent) return false;

    const last = new Date(lastEvent.createdAt);
    const now = new Date();

    return (
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate()
    );
  }).length;

  if (state.showingArchived) {
    const archivedCount = state.items.filter((item) => item.archivedAt).length;
    elements.summaryText.textContent =
      archivedCount === 0 ? "No archived items" : `${archivedCount} archived item${archivedCount === 1 ? "" : "s"}`;
    return;
  }

  elements.summaryText.textContent =
    activeItems.length === 0
      ? "No items yet"
      : `${confirmedTodayCount} of ${activeItems.length} confirmed today`;
}

function renderItems() {
  const visibleItems = getVisibleItems().sort((a, b) => {
    const aLast = getLastConfirmEventForItem(a.id)?.createdAt || a.createdAt || "";
    const bLast = getLastConfirmEventForItem(b.id)?.createdAt || b.createdAt || "";
    return bLast.localeCompare(aLast);
  });

  elements.listTitle.textContent = state.showingArchived ? "Archived Items" : "Your Items";
  elements.viewArchivedButton.textContent = state.showingArchived ? "Active Items" : "Archived";
  elements.itemsList.innerHTML = "";

  if (visibleItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item-card";
    empty.innerHTML = state.showingArchived
      ? `
        <h3>No archived items</h3>
        <p class="hold-help-text">Archived items will appear here.</p>
      `
      : `
        <h3>No items yet</h3>
        <p class="hold-help-text">Add your first item to start using Confirmly.</p>
      `;
    elements.itemsList.appendChild(empty);
    renderSummary();
    return;
  }

  visibleItems.forEach((item) => {
    const fragment = elements.itemTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".item-card");
    const itemName = fragment.querySelector(".item-name");
    const itemBadge = fragment.querySelector(".item-badge");
    const noteSetting = fragment.querySelector(".item-note-setting");
    const lastConfirmedValue = fragment.querySelector(".item-last-confirmed-value");
    const confirmButton = fragment.querySelector(".confirm-button");
    const historyToggleButton = fragment.querySelector(".history-toggle-button");
    const editButton = fragment.querySelector(".edit-button");
    const archiveButton = fragment.querySelector(".archive-button");
    const historyPanel = fragment.querySelector(".history-panel");
    const historyList = fragment.querySelector(".history-list");
    const holdWrap = fragment.querySelector(".hold-wrap");
    const holdProgressBar = fragment.querySelector(".hold-progress-bar");
    const holdHelpText = fragment.querySelector(".hold-help-text");

    const lastConfirmEvent = getLastConfirmEventForItem(item.id);

    itemName.textContent = item.name;

    if (item.isImportant) {
      itemBadge.classList.remove("hidden");
      holdWrap.classList.remove("hidden");
      confirmButton.textContent = "Important Item";
      holdHelpText.textContent = "Press and hold to confirm";
    }

    noteSetting.textContent = item.notesEnabled ? "Notes on" : "Notes off";

    lastConfirmedValue.textContent = lastConfirmEvent
      ? `${formatRelativeTime(lastConfirmEvent.createdAt)} · ${formatFullDateTime(lastConfirmEvent.createdAt)}`
      : "Never";

    const itemEvents = getEventsForItem(item.id).slice(0, 8);

    if (itemEvents.length === 0) {
      historyList.innerHTML = "<li>No history yet.</li>";
    } else {
      historyList.innerHTML = itemEvents
        .map((event) => {
          const noteText = event.note ? ` — Note: ${escapeHtml(event.note)}` : "";
          return `<li>${escapeHtml(formatFullDateTime(event.createdAt))} — ${escapeHtml(event.detail)}${noteText}</li>`;
        })
        .join("");
    }

    historyToggleButton.addEventListener("click", () => {
      historyPanel.classList.toggle("hidden");
      historyToggleButton.textContent = historyPanel.classList.contains("hidden")
        ? "History"
        : "Hide History";
    });

    if (item.archivedAt) {
      confirmButton.disabled = true;
      confirmButton.textContent = "Archived";
      editButton.disabled = true;
      archiveButton.textContent = "Archived";
      archiveButton.disabled = true;
      holdWrap.classList.add("hidden");
    } else {
      archiveButton.addEventListener("click", () => {
        archiveItem(item.id);
      });

      editButton.addEventListener("click", () => {
        openEditItemModal(item.id);
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
  if (!item || item.archivedAt) return;

  createEvent({
    itemId,
    type: "confirm",
    detail: "Item confirmed",
  });

  const latestEvent = state.events[state.events.length - 1];
  saveState();
  renderItems();
  flashItemCard(itemId);

  if (item.notesEnabled && latestEvent) {
    state.pendingNoteEventId = latestEvent.id;
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
  const itemId = crypto.randomUUID();

  state.items.push({
    id: itemId,
    name: name.trim(),
    isImportant,
    notesEnabled,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  });

  createEvent({
    itemId,
    type: "edit",
    detail: "Item created",
  });

  saveState();
  renderItems();
}

function updateItem({ id, name, isImportant, notesEnabled }) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  const previousName = item.name;
  const previousImportant = item.isImportant;
  const previousNotesEnabled = item.notesEnabled;

  item.name = name.trim();
  item.isImportant = isImportant;
  item.notesEnabled = notesEnabled;

  if (previousName !== item.name) {
    createEvent({
      itemId: item.id,
      type: "edit",
      detail: `Item renamed from "${previousName}" to "${item.name}"`,
    });
  }

  if (previousImportant !== item.isImportant) {
    createEvent({
      itemId: item.id,
      type: "edit",
      detail: item.isImportant
        ? "Important setting turned on"
        : "Important setting turned off",
    });
  }

  if (previousNotesEnabled !== item.notesEnabled) {
    createEvent({
      itemId: item.id,
      type: "edit",
      detail: item.notesEnabled
        ? "Notes prompt turned on"
        : "Notes prompt turned off",
    });
  }

  saveState();
  renderItems();
}

function archiveItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || item.archivedAt) return;

  item.archivedAt = new Date().toISOString();

  createEvent({
    itemId,
    type: "archive",
    detail: "Item archived",
  });

  saveState();
  renderItems();
}

function openCreateItemModal() {
  state.currentItemMode = "create";
  state.currentEditingItemId = null;
  elements.itemModalTitle.textContent = "Add Item";
  elements.saveItemButton.textContent = "Save Item";
  elements.itemIdInput.value = "";
  elements.itemForm.reset();
  elements.itemNotesInput.checked = true;
  elements.itemModal.classList.remove("hidden");
  elements.itemModal.setAttribute("aria-hidden", "false");
  elements.itemNameInput.focus();
}

function openEditItemModal(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;

  state.currentItemMode = "edit";
  state.currentEditingItemId = itemId;
  elements.itemModalTitle.textContent = "Edit Item";
  elements.saveItemButton.textContent = "Save Changes";
  elements.itemIdInput.value = item.id;
  elements.itemNameInput.value = item.name;
  elements.itemImportantInput.checked = item.isImportant;
  elements.itemNotesInput.checked = item.notesEnabled;
  elements.itemModal.classList.remove("hidden");
  elements.itemModal.setAttribute("aria-hidden", "false");
  elements.itemNameInput.focus();
}

function closeItemModal() {
  elements.itemModal.classList.add("hidden");
  elements.itemModal.setAttribute("aria-hidden", "true");
  elements.itemForm.reset();
  elements.itemNotesInput.checked = true;
  elements.itemIdInput.value = "";
  state.currentItemMode = "create";
  state.currentEditingItemId = null;
}

function getRandomNotePlaceholder() {
  return notePlaceholders[Math.floor(Math.random() * notePlaceholders.length)];
}

function openNoteModal() {
  elements.noteModal.classList.remove("hidden");
  elements.noteModal.setAttribute("aria-hidden", "false");
  elements.noteInput.value = "";
  elements.noteInput.placeholder = getRandomNotePlaceholder();
  elements.noteInput.focus();
}

function closeNoteModal() {
  elements.noteModal.classList.add("hidden");
  elements.noteModal.setAttribute("aria-hidden", "true");
  elements.noteInput.value = "";
  elements.noteInput.placeholder = "";
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
  elements.addItemButton.addEventListener("click", openCreateItemModal);
  elements.floatingAddButton.addEventListener("click", openCreateItemModal);

  elements.viewArchivedButton.addEventListener("click", () => {
    state.showingArchived = !state.showingArchived;
    renderItems();
  });

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

    const id = elements.itemIdInput.value.trim();
    const name = elements.itemNameInput.value.trim();
    const isImportant = elements.itemImportantInput.checked;
    const notesEnabled = elements.itemNotesInput.checked;

    if (!name) return;

    if (state.currentItemMode === "edit" && id) {
      updateItem({
        id,
        name,
        isImportant,
        notesEnabled,
      });
    } else {
      addItem({
        name,
        isImportant,
        notesEnabled,
      });
    }

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
