# Family Planner app

A small phone app for Rany & Sombo's family. It shows a calendar with Cambodian public holidays, and tracks spending, income and the monthly budget.

All the data stays in the **Family Planner 2027** Google Sheet. The app only reads from it and adds to it, so the sheet's Dashboard, 2027 Calendar and Month View keep working and update by themselves.

```
Phone (GitHub Pages website)  ──PIN──▶  Apps Script (inside your sheet)  ──▶  Google Sheet
```

## What's in this folder

| File | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The app |
| `config.js` | **The only file you edit.** Paste your Apps Script URL here |
| `manifest.json`, `icon*.png`, `icon.svg` | Lets you add the app to your phone's home screen |
| `Code.gs` | The small "server" that goes inside your Google Sheet |

---

## Step 1: Add the script to your Google Sheet (about 5 minutes)

1. Open **Family Planner 2027 - Rany & Sombo** in Google Sheets.
2. Click **Extensions → Apps Script**.
3. Delete everything in `Code.gs` and paste in the whole contents of `Code.gs` from this repository. Click **Save** (the disk icon).
4. Set your family PIN:
   - Click **Project Settings** (the gear icon, on the left).
   - Scroll down to **Script properties** and click **Add script property**.
   - Property: `FAMILY_PIN`. Value: a PIN of **at least 6 digits** that only you and Sombo know, for example `482915`. Don't use a birthday.
   - Click **Save script properties**.
5. Also in Project Settings, check that **Time zone** is `(GMT+07:00) Bangkok/Hanoi/Jakarta` or `Asia/Phnom_Penh`.

## Step 2: Publish the script as a web app

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Fill in:
   - Description: `Family Planner API`
   - Execute as: **Me** (rany.mom@…)
   - Who has access: **Anyone**
4. Click **Deploy**. Google asks you to **Authorize access**. Choose your account, then **Allow**. If you see "Google hasn't verified this app", click **Advanced → Go to (project name)**. It's your own script, so this is expected.
5. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.

> "Anyone" means anyone with the URL can *reach* the script. They still can't see or change anything without your PIN. After 10 wrong PINs the script refuses all requests for 10 minutes.

## Step 3: Put the URL in the app

Open `config.js` and paste the URL between the quotes:

```js
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfy.../exec",
  FAMILY_NAME: "Rany & Sombo",
};
```

## Step 4: Put the app on GitHub Pages

1. Go to [github.com/new](https://github.com/new) and create a repository, for example `family-planner`. You can make it **Private** if your GitHub plan allows Pages on private repos; a **Public** repo works too, because the code holds no data and no PIN.
2. On the new repository page, click **uploading an existing file**. Drag in **all the files** from this folder, then click **Commit changes**.
3. Go to **Settings → Pages**. Under "Build and deployment", set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, then click **Save**.
4. Wait 1–2 minutes. Your app's address appears at the top of the Pages screen, for example `https://YOUR-NAME.github.io/family-planner/`.

## Step 5: Install it on your phones

1. Open the github.io address on your phone.
2. Enter the family PIN and leave **Remember on this phone** ticked.
3. Add it to the home screen:
   - **iPhone (Safari):** Share button → **Add to Home Screen**
   - **Android (Chrome):** ⋮ menu → **Add to Home screen** or **Install app**
4. Send Sombo the address and the PIN (in person or by phone, not in a public chat).

---

## Using the app

- **Home**: this month's budget, spending and what's left, the next 3 weeks of plans and holidays, and the latest spending.
- **Calendar**: public holidays in red, plans coloured by category. Tap a day to see it or add a plan.
- **Spending / Income**: tap the red **+** to add. You can enter amounts in **USD or riel**; riel is converted at the rate on the **Lists** tab of the sheet (cell F2). **Tap any entry to change it** (amount, category, date, note), or tap ✕ to delete it. Plans are changed the same way from the Calendar: tap a day, then tap the plan.
- **Budget**: each category's spending against its monthly budget. Orange means 80% used; red means over budget.
- Use the arrows at the top to change month, and **↻** to reload after someone else adds something.

Budget amounts, categories, the exchange rate and holidays are changed **in the Google Sheet**; the app picks up the changes when you reload.

## When you change the script later

The app uses `Code.gs` from this repository. If you set up Apps Script before editing was added, paste the new `Code.gs` in again and deploy a new version (below), or saving changes will show "Unknown action: updateRow".


After editing `Code.gs`, click **Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy**. The URL stays the same, so the app keeps working.

## Try it without the sheet

If `API_URL` in `config.js` is empty, the app opens in **Demo mode** with sample data. Nothing is saved, so it's safe to click around.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Wrong PIN" | Check the `FAMILY_PIN` script property. Spaces count. |
| "Too many wrong PINs" | Wait 10 minutes. |
| "FAMILY_PIN is not set" | Do Step 1.4. |
| "Network error" or nothing loads | Check the URL in `config.js` ends in `/exec`, and that the deployment's access is **Anyone**. |
| Changes to `Code.gs` don't show up | Deploy a **New version** (see above). |
| A spending row doesn't show on the Dashboard | Check its date is in 2027 and its category matches a Budget category. |
| Error about a missing tab | Don't rename the Plans, Spending, Income, Budget, Lists or Public Holidays tabs, or move their columns. |
