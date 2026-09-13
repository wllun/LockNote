# LockNote legal pages

The Premium screen renders the same Privacy Policy and Terms of Service inside
the app, so users can read them offline. These HTML files are public copies for
app-store metadata and can be hosted free with GitHub Pages.

## Publish with GitHub Pages

1. Review the text with a qualified adviser for the countries where LockNote
   will be distributed.
2. Add the final public developer or business name and a monitored support
   contact. The current wording points to the support contact in the app-store
   listing so no private email address is committed to the repository.
3. In the GitHub repository, open **Settings → Pages**.
4. Select **Deploy from a branch**, choose the release branch, and use `/docs`
   as the folder.
5. Use these public URLs in App Store Connect, Google Play Console, and
   RevenueCat:
   - `https://wllun.github.io/LockNote/legal/privacy-policy.html`
   - `https://wllun.github.io/LockNote/legal/terms-of-service.html`

When legal wording changes, update both `src/content/legalDocuments.js` and the
matching HTML file so the in-app and public copies remain identical.
