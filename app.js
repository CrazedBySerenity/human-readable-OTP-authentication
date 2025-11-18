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
  if (state.addMode === "generate") {
    handleGeneratePhrase();
  }
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
  if (mode === "generate" && !state.generatedPhrase) {
    handleGeneratePhrase();
  }
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
  const words = phrase.split(/\s+/);
  return words.slice(0, 3).join(" ");
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

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "ghost-button icon delete-button";
  deleteBtn.type = "button";
  deleteBtn.textContent = "✕";
  deleteBtn.setAttribute("aria-label", `Delete ${friend.label || "friend"}`);
  deleteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    handleDeleteFriend(friend.id);
  });

  actions.append(deleteBtn);
  header.append(info, actions);

  const helperLine = document.createElement("p");
  helperLine.className = "card-helper";
  helperLine.textContent = "Tap to verify";

  const preview = document.createElement("p");
  preview.className = "phrase-preview";
  const previewSource = friend.phrase ? `${maskPhrase(friend.phrase)} ...` : "No phrase stored";
  preview.textContent = previewSource;
  preview.tabIndex = -1;
  preview.setAttribute("aria-hidden", "false");
  preview.style.userSelect = "none";
  preview.addEventListener("copy", (e) => e.preventDefault());
  preview.addEventListener("contextmenu", (e) => e.preventDefault());
  preview.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) e.preventDefault();
  });

  const verificationPanel = document.createElement("div");
  verificationPanel.className = "verification-panel hidden";
  verificationPanel.innerHTML = `
    <div class="verification-top">
      <div>
        <p class="verification-label">Verify with</p>
        <p class="verification-name">${friend.label || "Friend"}</p>
      </div>
      <span class="badge countdown" data-role="countdown">30s</span>
    </div>
    <p class="helper-copy small">
      Read your chosen color aloud. Listen for your friend to say the other color.
    </p>
    <div class="role-segmented-control">
      <span class="role-label">I am</span>
      <div class="segmented-control" role="radiogroup" aria-label="Age role">
        <label class="segment">
          <input type="radio" name="ageRole" value="older" checked />
          <span>Older</span>
        </label>
        <label class="segment">
          <input type="radio" name="ageRole" value="younger" />
          <span>Younger</span>
        </label>
      </div>
    </div>
    <div class="word-column combined">
      <div class="word-stack" data-role="all-words"></div>
    </div>
    <div class="listening-panel">
      <p class="helper-eyebrow" data-role="listening-helper">
        Choose your age to know what you should hear.
      </p>
      <div class="word-stack compact" data-role="listen-words"></div>
    </div>
    <div class="verification-actions">
      <button type="button" class="primary" data-role="confirm-match">Everything matched</button>
      <button type="button" class="ghost-button" data-role="no-match">Didn't match</button>
    </div>
  `;

  attachVerificationPanelInteractions(verificationPanel, friend.id);

  card.append(header, helperLine, preview, verificationPanel);
  card.classList.add("clickable-card");
  card.addEventListener("click", (event) => {
    if (!event.target.closest("button") && !event.target.closest(".verification-panel")) {
      startVerification(friend.id);
    }
  });
  registerSwipeToDelete(card, friend.id);

  return card;
}

function attachVerificationPanelInteractions(panel, friendId) {
  if (!panel) return;
  const roleRadios = panel.querySelectorAll('input[name="ageRole"]');
  roleRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        handleRoleSelection(panel, radio.value);
      }
    });
  });
  const confirmBtn = panel.querySelector('[data-role="confirm-match"]');
  confirmBtn?.addEventListener("click", () => handleVerificationResult(friendId, true));
  const noMatchBtn = panel.querySelector('[data-role="no-match"]');
  noMatchBtn?.addEventListener("click", () => handleVerificationResult(friendId, false));
}

function handleGeneratePhrase() {
  state.generatedPhrase = generatePhrase();
  elements.generatedPhrase.textContent = state.generatedPhrase;
  setHelperText(
    elements.generateHelper,
    "Read this phrase aloud to your friend."
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
  elements.generatedLabel.value = "";
  handleGeneratePhrase();
  updateGeneratedSaveState();
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
    const { redWords, blueWords, allWords, expiresAt } = await generateVerification(
      friend.secretKeyBase64
    );
    state.currentFriendId = friendId;

    panel.__wordSets = { red: redWords, blue: blueWords, all: allWords };
    resetRoleSelection(panel);

    panel.classList.remove("hidden");
    card.classList.add("open");

    const countdownEl = panel.querySelector('[data-role="countdown"]');
    startCountdown(countdownEl, friendId, expiresAt);
  } catch (error) {
    console.error(error);
    alert("Unable to generate verification phrase.");
  }
}

function renderCombinedWords(container, wordsToShow, variant) {
  if (!container) return;
  container.innerHTML = "";
  wordsToShow.forEach((word) => {
    const badge = document.createElement("span");
    badge.className = `word-badge variant-${variant}`;
    badge.textContent = word;
    container.appendChild(badge);
  });
}

function renderWordBadges(container, words, options = {}) {
  if (!container) return;
  const { variant = "neutral", size = "default" } = options;
  container.innerHTML = "";
  words.forEach((word) => {
    const badge = document.createElement("span");
    const classes = ["word-badge"];
    if (variant) {
      classes.push(`variant-${variant}`);
    }
    if (size === "compact") {
      classes.push("compact");
    }
    badge.className = classes.join(" ");
    badge.textContent = word;
    container.appendChild(badge);
  });
}

function resetRoleSelection(panel) {
  if (!panel || !panel.__wordSets) return;
  panel.dataset.selectedRole = "";
  const olderRadio = panel.querySelector('input[name="ageRole"][value="older"]');
  if (olderRadio) {
    olderRadio.checked = true;
  }
  handleRoleSelection(panel, "older");
}

function handleRoleSelection(panel, ageRole) {
  if (!panel || !panel.__wordSets || !ageRole) return;
  panel.dataset.selectedRole = ageRole;
  const colorRole = ageRole === "older" ? "red" : "blue";
  const wordsToShow = colorRole === "red" ? panel.__wordSets.red : panel.__wordSets.blue;
  const allWordsContainer = panel.querySelector('[data-role="all-words"]');
  renderCombinedWords(allWordsContainer, wordsToShow, colorRole);
  updateListeningSection(panel, colorRole, ageRole);
}

function updateListeningSection(panel, colorRole, ageRole) {
  if (!panel || !panel.__wordSets) return;
  const listenWords = panel.querySelector('[data-role="listen-words"]');
  const helper = panel.querySelector('[data-role="listening-helper"]');
  if (!listenWords || !helper) return;
  if (!colorRole) {
    helper.textContent = "Choose your age to know what you should hear.";
    listenWords.innerHTML = "";
    return;
  }
  const isRed = colorRole === "red";
  const expected = isRed ? panel.__wordSets.blue : panel.__wordSets.red;
  const expectedColor = isRed ? "BLUE" : "RED";
  helper.textContent = `You should hear these ${expectedColor} words:`;
  renderWordBadges(listenWords, expected, {
    variant: isRed ? "blue" : "red",
    size: "compact"
  });
}

function handleVerificationResult(friendId, matched) {
  showToast(matched ? "Everything matched" : "Didn't match. Try again.");
  if (state.currentFriendId === friendId) {
    closeActiveVerification();
  }
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
  const redWords = [];
  const blueWords = [];
  for (let i = 0; i < 8; i += 1) {
    const idx = seed[i] % WORD_LIST.length;
    const word = WORD_LIST[idx];
    allWords.push(word);
    if (i % 2 === 0) {
      redWords.push(word);
    } else {
      blueWords.push(word);
    }
  }
  const windowEnd = new Date((timeStep + 1) * 30 * 1000);
  return { redWords, blueWords, allWords, expiresAt: windowEnd };
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

