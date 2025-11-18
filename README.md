# PWA Human-to-Human Authenticator

Protect against deepfake calls or high-stakes impersonation (think grandparents, executives, or your partner) by requiring a shared human-friendly challenge before trusting the voice on the other end.

Minimal offline-first PWA (Progressive Web App) for pairing with friends via human-readable phrases and verifying them later with color-coded MadLib sentences. Everything runs entirely in the browser with IndexedDB storage, Web Crypto, and a lightweight service worker cache.

## Getting Started
1. Visit the provided github pages URL: https://crazedbyserenity.github.io/human-readable-OTP-authentication/
2. Pair with a friend and start verifying!
3. Alternatively install the app as PWA:
   - Chrome / Edge (desktop & Android): open the menu ⋮ and choose “Install app”.
   - Firefox (Android): open the menu ⋮ → “Install” or “Add to Home screen”.
   - iOS Safari: tap the share icon → “Add to Home Screen”.

## PWA & Offline
- `manifest.json` and `service-worker.js` make the app installable and cache app-shell assets (`index.html`, `app.js`, `words.js`, `madlibs.js`, etc.).
- After the first load you can go offline; data stays on-device in IndexedDB.

## Project Structure
- `index.html` – layout and semantic structure.
- `styles.css` – visual design and component styling.
- `app.js` – IndexedDB wrapper, phrase pairing, time-based verification logic, and UI wiring.
- `words.js` – deterministic word list for original pairing secrets.
- `madlibs.js` – templates and word pools for red/blue verification sentences.
- `service-worker.js` / `manifest.json` – installability + caching.

## Notes
- Uses Web Crypto PBKDF2 + HMAC to derive deterministic verification material per friend.
- Red/blue verification sentences refresh every 30 seconds.