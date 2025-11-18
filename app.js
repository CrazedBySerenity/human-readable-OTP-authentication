const db = (() => {
  const DB_NAME = "hrfv-db";
  const STORE = "friends";
  let connection;

  function openDB() {
    if (connection) return Promise.resolve(connection);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        connection = request.result;
        resolve(connection);
      };
      request.onupgradeneeded = (event) => {
        const dbRef = event.target.result;
        if (!dbRef.objectStoreNames.contains(STORE)) {
          dbRef.createObjectStore(STORE, { keyPath: "id" });
        }
      };
    });
  }

  async function withStore(mode, handler) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = handler(store);
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || request?.error);
    });
  }

  return {
    async getFriends() {
      return withStore("readonly", (store) => store.getAll()).then(
        (result) => result || []
      );
    },
    async saveFriend(friend) {
      return withStore("readwrite", (store) => store.put(friend));
    },
    async deleteFriend(id) {
      return withStore("readwrite", (store) => store.delete(id));
    }
  };
})();

const state = {
  friends: [],
  generatedPhrase: "",
  currentFriendId: null,
  addMode: "generate",
  countdownInterval: null,
  deferredInstallPrompt: null
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  hydrateFriends();
  registerServiceWorker();
});

function cacheElements() {
  elements.friendsList = document.getElementById("friendsList");
  elements.noFriendsNote = document.getElementById("noFriendsNote");
  elements.refreshFriends = document.getElementById("refreshFriends");
  elements.modeRadios = document.querySelectorAll('input[name="addMode"]');
  elements.generatePanel = document.getElementById("generatePanel");
  elements.enterPanel = document.getElementById("enterPanel");
  elements.generateButton = document.getElementById("generatePhrase");
  elements.generatedPhrase = document.getElementById("generatedPhrase");
  elements.generatedLabel = document.getElementById("generatedLabel");
  elements.saveGenerated = document.getElementById("saveGenerated");
  elements.enteredPhrase = document.getElementById("enteredPhrase");
  elements.enteredLabel = document.getElementById("enteredLabel");
  elements.saveEntered = document.getElementById("saveEntered");
  elements.generateHelper = document.getElementById("generateHelper");
  elements.generateLabelHint = document.getElementById("generateLabelHint");
  elements.enterPhraseHint = document.getElementById("enterPhraseHint");
  elements.enterLabelHint = document.getElementById("enterLabelHint");
  elements.statusChip = document.getElementById("statusChip");
  elements.toastHost = document.getElementById("toastHost");
  elements.installButton = document.getElementById("installButton");
  [elements.generateHelper, elements.enterPhraseHint].forEach((el) => {
    if (el && !el.dataset.defaultMessage) {
      el.dataset.defaultMessage = el.textContent.trim();
    }
  });
}

function bindEvents() {
  elements.refreshFriends.addEventListener("click", hydrateFriends);
  elements.modeRadios.forEach((input) =>
    input.addEventListener("change", () => switchPanel(input.value))
  );
  elements.generateButton.addEventListener("click", handleGeneratePhrase);
  elements.generatedLabel.addEventListener("input", () => {
    clearFieldState(elements.generatedLabel, elements.generateLabelHint);
    updateGeneratedSaveState();
  });
  elements.saveGenerated.addEventListener("click", handleSaveGenerated);
  elements.enteredPhrase.addEventListener("input", () => {
    clearFieldState(elements.enteredPhrase, elements.enterPhraseHint);
    updateEnteredSaveState();
  });
  elements.enteredLabel.addEventListener("input", () => {
    clearFieldState(elements.enteredLabel, elements.enterLabelHint);
    updateEnteredSaveState();
  });
  elements.saveEntered.addEventListener("click", handleSaveEntered);

  window.addEventListener("online", updateStatusChip);
  window.addEventListener("offline", updateStatusChip);
  updateStatusChip();
  attachCopyHandler(
    elements.generatedPhrase,
    () => elements.generatedPhrase.textContent.trim(),
    "Phrase copied"
  );
  if (elements.installButton) {
    elements.installButton.addEventListener("click", handleInstallClick);
  }
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);

  switchPanel(state.addMode);
  updateGeneratedSaveState();
  updateEnteredSaveState();
  updateInstallButtonVisibility();
}

function switchPanel(mode) {
  state.addMode = mode;
  elements.modeRadios.forEach((input) => {
    input.checked = input.value === mode;
  });
  elements.generatePanel.classList.toggle("hidden", mode !== "generate");
  elements.enterPanel.classList.toggle("hidden", mode !== "enter");
}

async function hydrateFriends() {
  try {
    state.friends = await db.getFriends();
    renderFriends();
  } catch (error) {
    console.error(error);
    alert("Unable to load friends. Please refresh.");
  }
}

function renderFriends() {
  const list = state.friends.slice().sort((a, b) => b.createdAt - a.createdAt);
  elements.friendsList.innerHTML = "";
  elements.noFriendsNote.classList.toggle("hidden", list.length > 0);
  closeActiveVerification();

  list.forEach((friend) => {
    const card = buildFriendCard(friend);
    elements.friendsList.appendChild(card);
  });
}

function maskPhrase(phrase) {
  if (!phrase) return "No phrase stored";
  const words = phrase.split(" ");
  const snippet = words.slice(0, 3).join(" ");
  return `${snippet}${words.length > 3 ? " ..." : ""}`;
}

function buildFriendCard(friend) {
  const card = document.createElement("article");
  card.className = "friend-card";
  card.dataset.friendId = friend.id;

  const header = document.createElement("div");
  header.className = "card-header";

  const info = document.createElement("div");
  info.className = "friend-info";

  const title = document.createElement("h3");
  title.textContent = friend.label || "Unnamed friend";

  const meta = document.createElement("p");
  meta.className = "meta-line";
  meta.textContent = `Added ${formatRelativeTime(friend.createdAt)}`;

  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const verifyBtn = document.createElement("button");
  verifyBtn.className = "pill-button";
  verifyBtn.type = "button";
  verifyBtn.textContent = "Verify";
  verifyBtn.addEventListener("click", () => startVerification(friend.id));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "ghost-button icon delete-button";
  deleteBtn.type = "button";
  deleteBtn.textContent = "✕";
  deleteBtn.setAttribute("aria-label", `Delete ${friend.label || "friend"}`);
  deleteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    handleDeleteFriend(friend.id);
  });

  actions.append(verifyBtn, deleteBtn);
  header.append(info, actions);

  const preview = document.createElement("p");
  preview.className = "phrase-preview copyable";
  preview.textContent = maskPhrase(friend.phrase);
  preview.tabIndex = 0;
  preview.setAttribute("role", "button");
  preview.setAttribute("aria-label", "Copy pairing phrase");
  attachCopyHandler(preview, friend.phrase, "Pairing phrase copied");

  const verificationPanel = document.createElement("div");
  verificationPanel.className = "verification-panel hidden";
  verificationPanel.innerHTML = `
    <div class="verification-meta">
      <span class="badge countdown" data-role="countdown">30s</span>
      <button type="button" class="ghost-button tiny" data-role="toggle-full">Show friend words</button>
    </div>
    <div class="word-groups">
      <div class="word-group">
        <p class="group-title">You read</p>
        <div class="badge-row" data-role="your-words"></div>
      </div>
      <div class="word-group hidden" data-role="friend-group">
        <p class="group-title">Friend reads</p>
        <div class="badge-row" data-role="friend-words"></div>
      </div>
    </div>
    <p class="helper-copy small">
      Read your four words aloud. Ask your friend to read theirs. Together they confirm the call.
    </p>
  `;

  const toggleBtn = verificationPanel.querySelector('[data-role="toggle-full"]');
  const friendGroup = verificationPanel.querySelector('[data-role="friend-group"]');
  toggleBtn.addEventListener("click", () => toggleFriendWords(friendGroup, toggleBtn));

  card.append(header, preview, verificationPanel);
  registerSwipeToDelete(card, friend.id);

  return card;
}

function handleGeneratePhrase() {
  state.generatedPhrase = generatePhrase();
  elements.generatedPhrase.textContent = state.generatedPhrase;
  elements.generatedPhrase.classList.remove("hidden");
  setHelperText(
    elements.generateHelper,
    "Share these six words with your friend. Save them once labeled."
  );
  updateGeneratedSaveState();
}

function updateGeneratedSaveState() {
  const hasPhrase = Boolean(state.generatedPhrase);
  const hasLabel = Boolean(elements.generatedLabel.value.trim());
  elements.saveGenerated.disabled = !(hasPhrase && hasLabel);
}

function updateEnteredSaveState() {
  const hasPhrase = Boolean(elements.enteredPhrase.value.trim());
  const hasLabel = Boolean(elements.enteredLabel.value.trim());
  elements.saveEntered.disabled = !(hasPhrase && hasLabel);
}

async function handleSaveGenerated() {
  const label = elements.generatedLabel.value.trim();
  clearFieldState(elements.generatedLabel, elements.generateLabelHint);

  let hasError = false;

  if (!state.generatedPhrase) {
    setHelperText(elements.generateHelper, "Generate a pairing phrase first.", true);
    hasError = true;
  } else {
    setHelperText(elements.generateHelper, "");
  }

  if (!label) {
    flagField(elements.generatedLabel, elements.generateLabelHint, "Label is required.");
    hasError = true;
  }

  if (hasError) return;

  await persistFriend(label, state.generatedPhrase);
  state.generatedPhrase = "";
  elements.generatedPhrase.textContent = "";
  elements.generatedPhrase.classList.add("hidden");
  elements.generatedLabel.value = "";
  updateGeneratedSaveState();
  setHelperText(
    elements.generateHelper,
    "Friend saved. Generate a new phrase when you're ready."
  );
  setHelperText(elements.generateLabelHint, "");
}

async function handleSaveEntered() {
  const phrase = normalizePhrase(elements.enteredPhrase.value);
  const label = elements.enteredLabel.value.trim();
  clearFieldState(elements.enteredPhrase, elements.enterPhraseHint);
  clearFieldState(elements.enteredLabel, elements.enterLabelHint);

  let hasError = false;

  if (!phrase) {
    flagField(elements.enteredPhrase, elements.enterPhraseHint, "Phrase is required.");
    hasError = true;
  }

  if (!label) {
    flagField(elements.enteredLabel, elements.enterLabelHint, "Label is required.");
    hasError = true;
  }

  if (hasError) return;

  await persistFriend(label, phrase);
  elements.enteredPhrase.value = "";
  elements.enteredLabel.value = "";
  setHelperText(
    elements.enterPhraseHint,
    "Saved. Start verification from the friends list."
  );
  setHelperText(elements.enterLabelHint, "");
  updateEnteredSaveState();
}

async function persistFriend(label, phrase) {
  try {
    const secretKeyBase64 = await deriveSecret(phrase);
    const friend = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `friend-${Date.now()}-${Math.random()}`,
      label,
      phrase,
      secretKeyBase64,
      createdAt: Date.now()
    };
    await db.saveFriend(friend);
    await hydrateFriends();
    showToast(`${friend.label || "Friend"} saved`);
  } catch (error) {
    console.error(error);
    alert("Unable to save friend.");
  }
}

async function handleDeleteFriend(friendId) {
  if (!confirm("Delete this friend? This cannot be undone.")) return;
  try {
    await db.deleteFriend(friendId);
    await hydrateFriends();
    if (state.currentFriendId === friendId) {
      closeActiveVerification();
    }
    showToast("Friend removed");
  } catch (error) {
    console.error(error);
    alert("Failed to delete friend.");
  }
}

async function startVerification(friendId, options = {}) {
  const refresh = Boolean(options.refresh);
  const friend = state.friends.find((f) => f.id === friendId);
  const card = document.querySelector(`[data-friend-id="${friendId}"]`);
  if (!friend || !card) return;

  const panel = card.querySelector(".verification-panel");

  const panelIsOpen = !panel.classList.contains("hidden");

  if (!refresh) {
    if (state.currentFriendId === friendId && panelIsOpen) {
      closeActiveVerification();
      return;
    }
    closeActiveVerification();
  } else {
    clearCountdown();
  }

  try {
    const { yourWords, friendWords, expiresAt } = await generateVerification(
      friend.secretKeyBase64
    );
    state.currentFriendId = friendId;

    const yourWordsContainer = panel.querySelector('[data-role="your-words"]');
    const friendWordsContainer = panel.querySelector('[data-role="friend-words"]');
    renderWordBadges(yourWordsContainer, yourWords);
    renderWordBadges(friendWordsContainer, friendWords);

    const friendGroup = panel.querySelector('[data-role="friend-group"]');
    const toggleBtn = panel.querySelector('[data-role="toggle-full"]');
    friendGroup.classList.add("hidden");
    toggleBtn.textContent = "Show friend words";

    panel.classList.remove("hidden");
    card.classList.add("open");

    const countdownEl = panel.querySelector('[data-role="countdown"]');
    startCountdown(countdownEl, friendId, expiresAt);
  } catch (error) {
    console.error(error);
    alert("Unable to generate verification phrase.");
  }
}

function toggleFriendWords(group, button) {
  if (!group || !button) return;
  const isHidden = group.classList.toggle("hidden");
  button.textContent = isHidden ? "Show friend words" : "Hide friend words";
}

function renderWordBadges(container, words) {
  if (!container) return;
  container.innerHTML = "";
  words.forEach((word) => {
    const badge = document.createElement("span");
    badge.className = "word-badge";
    badge.textContent = word;
    container.appendChild(badge);
  });
}

function startCountdown(targetEl, friendId, expiresAt) {
  if (!targetEl) return;
  clearCountdown();

  const update = () => {
    const remaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    targetEl.textContent = remaining > 0 ? `${remaining}s left` : "Refreshing…";
    if (remaining <= 0) {
      clearCountdown();
      startVerification(friendId, { refresh: true });
    }
  };

  update();
  state.countdownInterval = setInterval(update, 1000);
}

function clearCountdown() {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}

function closeActiveVerification() {
  const activeId = state.currentFriendId;
  clearCountdown();
  if (!activeId) return;
  const card = document.querySelector(`[data-friend-id="${activeId}"]`);
  card?.classList.remove("open");
  card?.querySelector(".verification-panel")?.classList.add("hidden");
  state.currentFriendId = null;
}

function registerSwipeToDelete(card, friendId) {
  let startX = null;
  card.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    startX = event.touches[0].clientX;
  });
  card.addEventListener("touchend", (event) => {
    if (startX === null) return;
    const endX = event.changedTouches[0].clientX;
    const delta = startX - endX;
    startX = null;
    if (delta > 80 && !event.target.closest("button")) {
      handleDeleteFriend(friendId);
    }
  });
}

function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function showToast(message) {
  if (!elements.toastHost || !message) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  elements.toastHost.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener(
      "transitionend",
      () => toast.remove(),
      { once: true }
    );
  }, 2600);
}

function attachCopyHandler(element, textSource, successMessage = "Copied") {
  if (!element) return;
  const getText = typeof textSource === "function" ? textSource : () => textSource;
  const triggerCopy = async () => {
    const value = getText();
    if (!value) return;
    await copyText(value, successMessage);
  };
  element.addEventListener("click", triggerCopy);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      triggerCopy();
    }
  });
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.setAttribute("readonly", "");
      temp.style.position = "absolute";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    showToast(successMessage);
  } catch (error) {
    console.warn("Copy failed", error);
    showToast("Unable to copy");
  }
}

function updateStatusChip() {
  if (!elements.statusChip) return;
  const online = navigator.onLine;
  const offlineLabel = navigator.serviceWorker?.controller
    ? "Offline (cached)"
    : "Offline";
  elements.statusChip.textContent = online ? "Online" : offlineLabel;
  elements.statusChip.classList.toggle("online", online);
  elements.statusChip.classList.toggle("offline", !online);
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  updateInstallButtonVisibility();
}

async function handleInstallClick() {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  try {
    await state.deferredInstallPrompt.userChoice;
  } finally {
    state.deferredInstallPrompt = null;
    updateInstallButtonVisibility();
  }
}

function handleAppInstalled() {
  state.deferredInstallPrompt = null;
  showToast("App installed");
  updateInstallButtonVisibility();
}

function updateInstallButtonVisibility() {
  if (!elements.installButton) return;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone;
  const shouldShow = !standalone && Boolean(state.deferredInstallPrompt);
  elements.installButton.classList.toggle("hidden", !shouldShow);
}

function setHelperText(target, message, isError = false) {
  if (!target) return;
  const nextMessage = message || target.dataset?.defaultMessage || "";
  target.textContent = nextMessage;
  target.classList.toggle("error", Boolean(isError && message));
}

function flagField(field, hint, message) {
  if (field) {
    field.classList.add("field-error");
  }
  setHelperText(hint, message, true);
}

function clearFieldState(field, hint) {
  field?.classList.remove("field-error");
  setHelperText(hint, "");
}

function normalizePhrase(raw) {
  return raw.trim().toLowerCase().split(/\s+/).join(" ");
}

function generatePhrase() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const words = [];
  for (let i = 0; i < 6; i += 1) {
    const idx = bytes[i] % WORD_LIST.length;
    words.push(WORD_LIST[idx]);
  }
  return words.join(" ");
}

async function deriveSecret(phrase) {
  const encoder = new TextEncoder();
  const salt = encoder.encode("hrfv-pairing-v1");
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(phrase),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function generateVerification(secretKeyBase64) {
  const keyBytes = base64ToBytes(secretKeyBase64);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const timeStep = Math.floor(Date.now() / 1000 / 30);
  const message = new TextEncoder().encode(`verify:${timeStep}`);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, message));
  const seed = hmac.slice(0, 16);
  const allWords = [];
  const yourWords = [];
  const friendWords = [];
  for (let i = 0; i < 8; i += 1) {
    const idx = seed[i] % WORD_LIST.length;
    const word = WORD_LIST[idx];
    allWords.push(word);
    if (i % 2 === 0) {
      yourWords.push(word);
    } else {
      friendWords.push(word);
    }
  }
  const windowEnd = new Date((timeStep + 1) * 30 * 1000);
  return { yourWords, friendWords, allWords, expiresAt: windowEnd };
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("service-worker.js")
    .then(() => updateStatusChip())
    .catch((err) => console.warn("SW registration failed", err));
}

