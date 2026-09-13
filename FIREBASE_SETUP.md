# Put this site online with Firebase

This site uses a visible **user name** but Firebase needs an email internally. The site automatically changes a user name such as `sara` into `sara@platform.example`. Users never see that email.

## 1. Create the Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and choose **Add project**.
2. Name it, press **Continue**, and finish creating it. Google Analytics is optional.
3. On the project overview page, click the **Web** icon (`</>`).
4. Give the web app a name such as `Platform`, then click **Register app**.
5. Copy the configuration values that Firebase shows.
6. Open `firebase-config.js` in this folder and replace every `PASTE_YOUR_...` value. Do not change the field names.

## 2. Turn on login

1. In the left Firebase menu, open **Build > Authentication**.
2. Click **Get started**.
3. Open **Sign-in method**, choose **Email/Password**, turn on the first switch, and click **Save**.

## 3. Create the database and secure it

1. In the left menu, open **Build > Realtime Database**.
2. Click **Create database**, choose a location, and choose **Start in locked mode**.
3. Open the **Rules** tab.
4. Open this project's `firebase-rules.json`, copy all of it, replace the rules shown in Firebase, then click **Publish**.

Whenever this project changes its Firebase rules, copy this file again and click **Publish** before testing online.

## 4. Set up the private administrator account

1. Go to **Build > Authentication > Users**.
2. Click **Add user**.
3. Choose a private administrator user name. Create its matching Firebase email as `<that-user-name>@platform.example`, then choose a private password. Do not put any of those credentials in this website or share them publicly.
4. Click **Add user**, then copy the long value in the **User UID** column.
6. Go to **Build > Realtime Database > Data**.
7. Add a top-level item named `admins` if it does not exist.
8. Inside `admins`, add a child whose key is the copied UID and whose value is `true` (a Boolean, not the word in quotes).

Only the UID placed in `admins` receives the administrator pages.

## 5. Publish online with Firebase Hosting

1. Install [Node.js LTS](https://nodejs.org/) on your computer.
2. Open PowerShell in this folder (`Platform`).
3. Run `npm install -g firebase-tools`.
4. Run `firebase login` and complete the browser sign-in.
5. Run `firebase init` and select both **Hosting** and **Functions**.
   - Choose the Firebase project you made.
   - For **public directory**, enter `.` (one dot).
   - Choose **No** for single-page app.
   - Choose **No** if asked to overwrite `index.html`.
   - For Functions, choose **JavaScript**, then choose the existing `functions` folder if Firebase asks.
6. Run `cd functions`, then `npm install`, then run `cd ..` to return to the Platform folder.
7. Run `firebase deploy`. This also deploys the secure homework grading function. If Firebase asks you to enable billing for Functions, follow its prompt; the homework-grade feature needs Functions to run securely on Firebase.
7. Firebase prints a Hosting URL. Open it and test sign-up, a property request, and the admin login.

## Important final check

In Firebase Console go to **Authentication > Settings > Authorized domains**. Add the domain shown by Firebase Hosting if it is not already present. If you publish through GitHub Pages or another host instead, add that exact website domain there too.

Keep the administrator's Firebase credentials private. The setup above assigns that account's UID to the database `admins` list.
