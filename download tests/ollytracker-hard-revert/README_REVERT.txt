OLLYTRACKER HARD REVERT
=======================

What this does
--------------
- Restores your ORIGINAL working Tracker page (verify colors, OllyLocker button behavior, Other Boards logic).
- Overwrites: views/tracker.ejs only. No server routes or endpoints are changed.

Install (no code editing)
-------------------------
1) Unzip at the ROOT of your project (same folder as package.json).
2) It will place: views/tracker.ejs (overwrite your current file).
3) Restart the server.
4) Visit: http://localhost:3000/tracker

Quick check
-----------
- Company card shows market cap, shares out, website
- Board list appears with lite risk colors on load
- Verify keeps text colors and recolors buttons; detailed scores appear
- "Verify Other Boards" returns current board and hides the rest (Carol L. Roberts appears correctly)
- OllyLocker button opens Locker (not search).
