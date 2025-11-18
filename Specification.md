Here is a spec you can paste directly to an LLM to get a minimal working MVP.

---

**Title:**
Human Readable Friend Pairing and Verification PWA (Offline, No Backend)

**Role and goal for you (the coding assistant):**
You are an expert front end web developer. Build a minimal, single page PWA that lets two users on separate phones:

1. Pair as friends using a human readable secret phrase that one generates and the other types in.
2. Later generate time based human readable verification phrases from that shared secret.
3. Run entirely in the browser with no backend after the initial file download.

Please keep the code as short and simple as possible while staying correct and secure.

---

### 1. Tech and constraints

Use these constraints:

1. Stack

   * Plain HTML, CSS, and JavaScript.
   * No frameworks, no build step.
   * No external dependencies except standard browser APIs.

2. PWA requirements

   * Provide a simple `manifest.json` that makes the site installable as a PWA.
   * Add a basic `service-worker.js` that:

     * Caches the app shell files (HTML, JS, CSS, manifest, icons).
     * Serves cached files when offline.
   * Keep the service worker minimal. No push, no background sync.

3. Storage

   * Use IndexedDB to store friends and their derived secrets.
   * Wrap IndexedDB in a very small helper so usage looks like `db.saveFriend(friendObj)` and `db.getFriends()`.

4. Crypto

   * Use Web Crypto API (`window.crypto.subtle`) only.
   * No custom crypto, no external libraries.

---

### 2. Data model

Store friends locally with this minimal shape:

```ts
type Friend = {
  id: string;                // random UUID string
  label: string;             // user chosen name like "Alice"
  phrase: string;            // original human readable pairing phrase
  secretKeyBase64: string;   // derived symmetric key encoded as base64
  createdAt: number;         // Date.now()
};
```

The secret key is derived from the phrase, not randomly stored on its own.

---

### 3. Pairing phrase and key derivation

1. Phrase generation on device A

   * Generate 128 bits of random data using `crypto.getRandomValues`.
   * Use a small fixed word list in JS. For example an array of about 256 short words.
   * Map the random bytes to 6 words:

     * Convert random bytes to a large integer or iterate bytes.
     * For each word, take the next byte modulo `wordList.length` as an index.
   * Join words with spaces to get a phrase like `silver robot midnight canyon velvet comet`.

2. Key derivation from phrase (on both devices)

   * Use PBKDF2 with SHA-256 and a fixed salt string like `"hrfv-pairing-v1"` and 100k iterations.
   * Derive a 256 bit symmetric key. Use `crypto.subtle.importKey` and `deriveBits`.
   * The exported key bytes are base64 encoded and stored as `secretKeyBase64` for that friend.
   * The phrase string itself is stored as `phrase` so the user can see it again if needed.

3. Determinism requirement

   * Given the same phrase, both devices must derive the same `secretKeyBase64`.
   * All cryptographic functions must be implemented so they run entirely client side.

---

### 4. Time based verification phrases

Once a friend has a stored `secretKeyBase64`, both devices can generate the same verification phrase without talking to each other.

1. Time window

   * Use 30 second time windows.
   * Compute `timeStep = Math.floor(Date.now() / 1000 / 30)`.

2. Derive verification bytes

   * Convert `secretKeyBase64` back to a CryptoKey for HMAC with SHA-256.
   * Compute `HMAC(secretKey, "verify:" + timeStep)` using Web Crypto.
   * Take the first 16 bytes from this HMAC as a seed for word selection.

3. Words and splitting between two people

   * Use the same word list as in pairing.
   * From the 16 seed bytes, map to exactly 8 words in order.
   * The 8 words represent one session phrase.
   * Person A is shown words with even indices: 0, 2, 4, 6.
   * Person B is shown words with odd indices: 1, 3, 5, 7.
   * Also show the full 8 word phrase in small text for debugging or testing, behind a simple “show full phrase” toggle.

4. Verification UX

   * Screen has a button “Start verification” next to each friend.
   * When tapped, show:

     * The 4 words intended for “this device”.
     * A small caption that explains:

       * “You will read your 4 words”
       * “Your friend will read their 4 words”
       * “Together they should form one 8 word phrase”.

---

### 5. UI and flow

Keep UI extremely minimal, single page, with very simple layout.

1. Sections

   * A header with app title.
   * A “Friends” list section.
   * A “Add friend” section.

2. Add friend flow

   * Two modes selectable by tabs or radio buttons.

   **Mode A: Generate phrase (Device A)**

   * Button “Generate pairing phrase”.
   * When pressed:

     * Generate random phrase.
     * Show phrase in a large font and instruct the user to read or send it to their friend.
     * Ask for a label like “Friend name” and a “Save friend” button.
     * When saving, derive and store `secretKeyBase64` from the phrase.

   **Mode B: Enter phrase (Device B)**

   * A text input where the user types the phrase they received.
   * A label field for friend name.
   * On “Save friend”:

     * Normalize the phrase (trim, lowercase, single space between words).
     * Derive and store `secretKeyBase64` from this phrase.

3. Friends list

   * Show a simple list of saved friends with:

     * `label`
     * Short preview of the phrase or a masked version.
     * A button “Verify now”.

4. Verify now

   * On click:

     * Compute the verification phrase for the current time window.
     * Display the 4 words for this device in large text.
     * Display a small button “Show full phrase” that reveals all 8 words for testing.
     * Include a small text hint explaining how two people use this in a call.

---

### 6. Implementation notes

1. IndexedDB helper

   * Implement a tiny wrapper that:

     * Opens a DB named `"hrfv-db"` with a store `"friends"` keyed by `id`.
     * Provides `getFriends`, `saveFriend`, `deleteFriend`.
   * Avoid large abstractions.

2. Word list

   * Hardcode a small array of 256 or 512 human friendly words.
   * Put it in a separate `words.js` file or at the top of `app.js`.

3. Service worker and manifest

   * Cache `index.html`, `app.js`, `styles.css`, `words.js`, `manifest.json`, and icons.
   * Fallback to network if not cached.
   * Keep both files very short.

4. Code organization

   * One `index.html` file that links `styles.css`, `app.js`, `manifest.json`.
   * One `app.js` with all logic.
   * One `service-worker.js`.
   * One small `icons` folder with a single PNG reused for different icon sizes.

---

### 7. Deliverables

Produce:

1. `index.html`
2. `styles.css`
3. `app.js`
4. `words.js` with a small word list
5. `service-worker.js`
6. `manifest.json`
7. A short “How to run” section at the bottom of the answer that explains:

   * How to serve the files locally using a simple static server.
   * How to install the PWA on a phone.

The final result should be a minimal but working PWA that can be opened on two phones, allows pairing via a human readable phrase, stores friends locally, and generates time based human readable verification phrases offline with no backend.