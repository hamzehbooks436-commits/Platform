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

## 5. Publish online for free with GitHub Pages

1. Create a public GitHub repository and upload the website files from this folder. Do not upload private credentials or `node_modules` folders.
2. In the repository, open **Settings > Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select branch **main** and folder **/(root)**, then click **Save**.
5. GitHub Pages gives you a website address like `https://YOUR-USERNAME.github.io/Platform/`.
6. Homework grading is free and manual: students submit answers, and the admin reviews them and enters the grade. No Firebase Functions or billing upgrade is needed.

## Important final check

In Firebase Console go to **Authentication > Settings > Authorized domains**. Add your GitHub Pages domain, for example `YOUR-USERNAME.github.io`.

Keep the administrator's Firebase credentials private. The setup above assigns that account's UID to the database `admins` list.
