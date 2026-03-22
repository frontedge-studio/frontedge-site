const STORAGE_KEY = "confirmly-v6";

const NOTE_MAX_LENGTH = 300;

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
    sortOrder: 0,
  },
  {
    id: crypto.randomUUID(),
    name: "Took evening medication",
    isImportant: false,
    notesEnabled: true,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    sortOrder: 1,
  },
  {
    id: crypto.randomUUID(),
    name: "Fed the dog",
    isImportant: false,
    notesEnabled: true,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    sortOrder: 2,
  },
];

const state = {
  items: [],
  events: [],
  pendingNoteEventId: null,
  pendingGlowItemId: null,
  currentItemMode: "create",
  currentEditingItemId: null,
  currentView: "active",
  openHistoryItemIds: new Set(),
};

const elements = {
  itemsList: document.getElementById("items-list"),
  summaryText: document.getElementById("summary-text"),
  listTitle: document.getElementById("list-title"),
  itemTemplate: document.getElementById("item-card-template"),

  itemModal: document.getElementById("item-modal"),
  floatingAddButton: document.getElementById("floating-add-button"),
  viewActiveButton: document.getElementById("view-active-button"),
  viewArchivedButton: document.getElementById("view-archived-button"),
  viewAllButton: document.getElementById("view-all-button"),
  helpButton: document.getElementById("help-button"),
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
  noteCharCount: document.getElementById("note-char-count"),

  helpModal: document.getElementById("help-modal"),
  closeHelpModalButton: document.getElementById("close-help-modal"),
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
  return state.items
    .filter((item) => {
      if (state.currentView === "active") return !item.archivedAt;
      if (state.currentView === "archived") return Boolean(item.archivedAt);
      return true;
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
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

function createEvent({ itemId, type, detail, note = "", wasImportant = false }) {
  state.events.push({
    id: crypto.randomUUID(),
    itemId,
    type,
    detail,
    note,
    wasImportant,
    createdAt: new Date().toISOString(),
  });
}

function renderViewToggle() {
  const map = {
    active: elements.viewActiveButton,
    archived: elements.viewArchivedButton,
    all: elements.viewAllButton,
  };

  Object.values(map).forEach((button) => {
    button.classList.remove("is-active");
  });

  map[state.currentView].classList.add("is-active");
}

function renderSummary() {
  if (state.currentView === "archived") {
    const archivedCount = state.items.filter((item) => item.archivedAt).length;
    elements.summaryText.textContent =
      archivedCount === 0 ? "No archived items" : `${archivedCount} archived item${archivedCount === 1 ? "" : "s"}`;
    return;
  }

  if (state.currentView === "all") {
    elements.summaryText.textContent = `${state.items.length} total item${state.items.length === 1 ? "" : "s"}`;
    return;
  }

  const todayCount = state.events.filter((event) => {
    if (event.type !== "confirm") return false;

    const when = new Date(event.createdAt);
    const now = new Date();

    return (
      when.getFullYear() === now.getFullYear() &&
      when.getMonth() === now.getMonth() &&
      when.getDate() === now.getDate()
    );
  }).length;

  elements.summaryText.textContent =
    todayCount === 0 ? "No confirmations today" : `${todayCount} confirmation${todayCount === 1 ? "" : "s"} today`;
}

function renderItems() {
  const visibleItems = getVisibleItems();

  elements.listTitle.textContent =
    state.currentView === "active"
      ? "Your Items"
      : state.currentView === "archived"
      ? "Archived Items"
      : "All Items";

  renderViewToggle();
  elements.itemsList.innerHTML = "";

  if (visibleItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item-card";
    empty.innerHTML =
      state.currentView === "archived"
        ? `<h3>No archived items</h3><p class="hold-help-text">Archived items will appear here.</p>`
        : state.currentView === "all"
        ? `<h3>No items yet</h3><p class="hold-help-text">Items will appear here once created.</p>`
        : `<h3>No items yet</h3><p class="hold-help-text">Use the + button to add your first item.</p>`;
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
    const archivedSetting = fragment.querySelector(".item-archived-setting");
    const lastConfirmedValue = fragment.querySelector(".item-last-confirmed-value");
    const itemActions = fragment.querySelector(".item-actions");
    const historyPanel = fragment.querySelector(".history-panel");
    const historyList = fragment.querySelector(".history-list");
    const holdWrap = fragment.querySelector(".hold-wrap");
    const holdProgressBar = fragment.querySelector(".hold-ring-fill");

    card.dataset.itemId = item.id;

    const lastConfirmEvent = getLastConfirmEventForItem(item.id);
    const isArchived = Boolean(item.archivedAt);

    itemName.textContent = item.name;

    if (isArchived) {
      archivedSetting.classList.remove("hidden");
      itemBadge.classList.add("hidden");
      noteSetting.classList.add("hidden");
      holdWrap.classList.add("hidden");
    } else {
      noteSetting.textContent = item.notesEnabled ? "Notes on" : "Notes off";
      noteSetting.classList.remove("hidden");

      if (item.isImportant) {
        itemBadge.classList.remove("hidden");
        holdWrap.classList.remove("hidden");
      }
    }

    lastConfirmedValue.textContent = lastConfirmEvent
      ? `${formatRelativeTime(lastConfirmEvent.createdAt)} · ${formatFullDateTime(lastConfirmEvent.createdAt)}`
      : "Never";

    const confirmButton = createButton(
      item.isImportant ? "Hold to Confirm" : "Confirm",
      "button-primary"
    );
    const historyButton = createButton("History", "button-secondary");
    const editButton = createButton("Edit", "button-secondary");
    const archiveButton = createButton("Archive", "button-secondary");
    const restoreButton = createButton("Restore", "button-primary");

    const historyWasOpen = state.openHistoryItemIds.has(item.id);
    if (historyWasOpen) {
      historyPanel.classList.remove("hidden");
      historyButton.textContent = "Hide History";
    }

    historyButton.addEventListener("click", () => {
      const willOpen = historyPanel.classList.contains("hidden");
      historyPanel.classList.toggle("hidden");
      historyButton.textContent = historyPanel.classList.contains("hidden")
        ? "History"
        : "Hide History";

      if (willOpen) {
        state.openHistoryItemIds.add(item.id);
      } else {
        state.openHistoryItemIds.delete(item.id);
      }
    });

    if (isArchived) {
      restoreButton.addEventListener("click", () => {
        restoreItem(item.id);
      });

      itemActions.append(restoreButton, historyButton);
    } else {
      editButton.addEventListener("click", () => {
        openEditItemModal(item.id);
      });

      archiveButton.addEventListener("click", () => {
        archiveItem(item.id);
      });

      if (item.isImportant) {
        wireHoldToConfirm({
          triggerElement: confirmButton,
          progressBarElement: holdProgressRing,
          onComplete: () => confirmItem(item.id),
        });
      } else {
        confirmButton.addEventListener("click", () => {
          confirmItem(item.id);
        });
      }

      itemActions.append(confirmButton, historyButton, editButton, archiveButton);
    }

    const itemEvents = getEventsForItem(item.id).slice(0, 8);

    if (itemEvents.length === 0) {
      historyList.innerHTML = "<li>No history yet.</li>";
    } else {
      historyList.innerHTML = itemEvents
        .map((event) => {
          if (event.type === "confirm") {
            const icon = event.wasImportant
              ? ` <span class="history-important-dot" aria-label="Important confirmation">!</span>`
              : "";
            const noteText = event.note ? ` — Note: ${escapeHtml(event.note)}` : "";
            return `<li>${escapeHtml(formatFullDateTime(event.createdAt))}${icon}${noteText}</li>`;
          }

          if (event.type === "archive" || event.type === "restore") {
            return `<li>${escapeHtml(formatFullDateTime(event.createdAt))} — ${escapeHtml(event.detail)}</li>`;
          }

          return "";
        })
        .filter(Boolean)
        .join("");
    }

    elements.itemsList.appendChild(fragment);
  });

  renderSummary();

  if (state.pendingGlowItemId) {
    flashItemCard(state.pendingGlowItemId);
    state.pendingGlowItemId = null;
  }
}

function createButton(label, className) {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = `button ${className}`;
  button.type = "button";
  return button;
}

function wireHoldToConfirm({ triggerElement, progressRingElement, onComplete }) {
  let holdTimer = null;
  let isHolding = false;

  const CIRCUMFERENCE = 113.1;

  const resetHold = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    isHolding = false;
    progressRingElement.style.transition = "stroke-dashoffset 0ms linear";
    progressRingElement.style.strokeDashoffset = String(CIRCUMFERENCE);
  };

  const startHold = () => {
    if (isHolding) return;
    isHolding = true;

    progressRingElement.style.transition = "stroke-dashoffset 1000ms linear";
    progressRingElement.style.strokeDashoffset = "0";

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

  resetHold();
}

function confirmItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || item.archivedAt) return;

  createEvent({
    itemId,
    type: "confirm",
    detail: "Item confirmed",
    wasImportant: item.isImportant,
  });

  const latestEvent = state.events[state.events.length - 1];
  saveState();
  state.pendingGlowItemId = itemId;
  renderItems();

  if (item.notesEnabled && latestEvent) {
    state.pendingNoteEventId = latestEvent.id;
    openNoteModal();
  }
}

function flashItemCard(itemId) {
  const matchingCard = document.querySelector(`.item-card[data-item-id="${itemId}"]`);
  if (!matchingCard) return;

  matchingCard.classList.remove("confirmed-flash");
  void matchingCard.offsetWidth;
  matchingCard.classList.add("confirmed-flash");
}

function addItem({ name, isImportant, notesEnabled }) {
  const nextSortOrder =
    state.items.length === 0
      ? 0
      : Math.max(...state.items.map((item) => item.sortOrder ?? 0)) + 1;

  state.items.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    isImportant,
    notesEnabled,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    sortOrder: nextSortOrder,
  });

  saveState();
  renderItems();
}

function updateItem({ id, name, isImportant, notesEnabled }) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  item.name = name.trim();
  item.isImportant = isImportant;
  item.notesEnabled = notesEnabled;

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

function restoreItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || !item.archivedAt) return;

  item.archivedAt = null;

  const activeItems = state.items.filter((entry) => !entry.archivedAt && entry.id !== itemId);
  activeItems.forEach((entry) => {
    entry.sortOrder = (entry.sortOrder ?? 0) + 1;
  });
  item.sortOrder = 0;

  createEvent({
    itemId,
    type: "restore",
    detail: "Item restored",
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

function updateNoteCharCount() {
  const currentLength = elements.noteInput.value.length;
  const remaining = NOTE_MAX_LENGTH - currentLength;
  elements.noteCharCount.textContent = `${remaining} character${remaining === 1 ? "" : "s"} remaining`;
}

function openNoteModal() {
  elements.noteModal.classList.remove("hidden");
  elements.noteModal.setAttribute("aria-hidden", "false");
  elements.noteInput.value = "";
  elements.noteInput.placeholder = getRandomNotePlaceholder();
  updateNoteCharCount();
  elements.noteInput.focus();
}

function closeNoteModal() {
  elements.noteModal.classList.add("hidden");
  elements.noteModal.setAttribute("aria-hidden", "true");
  elements.noteInput.value = "";
  elements.noteInput.placeholder = "";
  state.pendingNoteEventId = null;
  updateNoteCharCount();
}

function savePendingNote(noteValue) {
  const eventId = state.pendingNoteEventId;
  if (!eventId) return;

  const event = state.events.find((entry) => entry.id === eventId);
  if (!event) return;

  event.note = noteValue.trim();
  saveState();

  const itemId = event.itemId;
  closeNoteModal();
  state.pendingGlowItemId = itemId;
  renderItems();
}

function openHelpModal() {
  elements.helpModal.classList.remove("hidden");
  elements.helpModal.setAttribute("aria-hidden", "false");
}

function closeHelpModal() {
  elements.helpModal.classList.add("hidden");
  elements.helpModal.setAttribute("aria-hidden", "true");
}

function setView(view) {
  state.currentView = view;
  renderItems();
}

function wireEvents() {
  elements.floatingAddButton.addEventListener("click", openCreateItemModal);

  elements.viewActiveButton.addEventListener("click", () => setView("active"));
  elements.viewArchivedButton.addEventListener("click", () => setView("archived"));
  elements.viewAllButton.addEventListener("click", () => setView("all"));

  elements.helpButton.addEventListener("click", openHelpModal);
  elements.closeHelpModalButton.addEventListener("click", closeHelpModal);

  elements.closeItemModalButton.addEventListener("click", closeItemModal);
  elements.cancelItemButton.addEventListener("click", closeItemModal);

  elements.itemModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
      closeItemModal();
    }
  });

  elements.helpModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeHelp === "true") {
      closeHelpModal();
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
  });

  elements.skipNoteButton.addEventListener("click", () => {
    closeNoteModal();
  });

  elements.noteInput.addEventListener("input", updateNoteCharCount);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeItemModal();
      closeNoteModal();
      closeHelpModal();
    }
  });
}

function init() {
  loadState();
  wireEvents();
  updateNoteCharCount();
  renderItems();
}

init();
