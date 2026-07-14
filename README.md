# CivicFix: Crowdsourced Civic Issue Reporting and Resolution System
**Smart India Hackathon (SIH25031) | Theme: Clean & Green Technology**

CivicFix is a complete client-side civic issue reporting web application. It runs directly in the browser without build tools or command line dependencies, loaded through CDN scripts. It features real-time Firebase bindings, Leaflet Map geographical clustering, and Gemini AI image classification.

---

## 🚀 Key System Features

1. **AI-Powered Photo Classification (Gemini API):** When a citizen captures/uploads an image, the Gemini API classifies it as a `Pothole`, `Garbage`, `Streetlight`, `Sewage/Water Leakage`, or `Other`. If the image is unrelated (such as a selfie or indoor photo), the system blocks submission.
2. **Simplified Proximity Duplicate Detection:** When a citizen files a new report, the browser searches active tickets of the same category. If a ticket exists within **50 meters** (calculated via the Haversine formula) submitted within the last **7 days**, the system increments the `duplicateCount` upvote rather than creating a new document.
3. **Pulsing Map Indicators:** Tickets represented on the map scale up in size and pulse in red if they gather **3 or more reports**, highlighting high-urgency zones.
4. **Department Auto-Routing:** Category selection automatically tags designated departments:
   - Pothole → `PWD`
   - Garbage → `Sanitation`
   - Streetlight → `Electricity`
   - Sewage/Water Leakage → `Water`
   - Other → `PWD`
5. **Real-time Synchronization:** Status transitions updated by department officers immediately push notifications and update timelines in the Citizen Tracking portal without needing page refreshes.

---

## 🛠️ Step-by-Step Setup Guide

To run CivicFix, configure a Firebase project and obtain a Gemini API key.

### Step 1: Firebase Project Configuration
1. Open the [Firebase Console](https://console.firebase.google.com/) and click **Add Project**. Name it `CivicFix`.
2. Navigate to **Authentication** under Build, click **Get Started**, enable the **Email/Password** provider, and save.
3. Navigate to **Firestore Database**, click **Create Database**, select a nearby location, and start in **Test Mode** (or update security rules).
4. Navigate to **Storage** and click **Get Started**. Choose starting rules (select Test Mode) and default location settings.

### Step 2: Firestore & Storage Security Rules
For testing and demonstration, use permissive rules. In production, configure stricter authorization rules.

**Firestore Security Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Storage Security Rules:**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

### Step 3: Google AI Studio Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Create an account, click **Get API Key**, and copy the string value.

---

## ⚙️ How to Load Credentials (Browser Settings Drawer)

We have built a developer configurations dashboard directly in the browser so you don't need to manually edit Javascript files to test.

1. Double-click [index.html](file:///c:/Users/ADMIN/OneDrive/Desktop/issue%20reporter/index.html) or run a local server (see execution section below) to open CivicFix.
2. If Firebase is not configured, the app will automatically open the **Developer Settings** modal. (Alternatively, click the **Gear Icon `⚙️`** in the navigation header).
3. Enter your **Gemini API Key**.
4. Copy-paste your Firebase Web SDK config JSON. It should look like this:
   ```json
   {
     "apiKey": "AIzaSy...",
     "authDomain": "yourproject.firebaseapp.com",
     "projectId": "yourproject",
     "storageBucket": "yourproject.appspot.com",
     "messagingSenderId": "12345678",
     "appId": "1:1234:web:abcd"
   }
   ```
5. Click **Save & Reload**. The settings are persisted in your local browser profile (`localStorage`), and the app will connect.

---

## 💻 Running the Application Locally

Since CivicFix is built with vanilla HTML5 and JS files, it requires no build compilations or installation commands.

### Option A: Static Browser Loading
Directly open the `index.html` file in any modern web browser.
*Note: Some browsers block geolocation features (`navigator.geolocation`) when running on the `file://` protocol. We recommend using a local web server (Option B or C).*

### Option B: VS Code Live Server (Recommended)
1. Open the project folder in VS Code.
2. Install the **Live Server** extension by Ritwick Dey.
3. Click the **Go Live** button in the bottom right corner.

### Option C: Quick Terminal Server
Open your terminal (PowerShell, Command Prompt, or Terminal) in the project directory and run one of the following commands:

Using Python (built into most environments):
```bash
python -m http.server 8000
```
Using Node.js:
```bash
npx serve .
```
Access the application by navigating to `http://localhost:8000` (Python) or the URL provided by Node.

---

## 👥 How to Test User Roles (Officer/Admin Promotion)

1. Register a new account on the [signup.html](file:///c:/Users/ADMIN/OneDrive/Desktop/issue%20reporter/signup.html) page. By default, every registration starts as a **Citizen**.
2. **To test the Admin Panel:** Log in with the account credentials you want to promote, open the **Developer Settings** modal, copy your UID from your profile details, and update the role in your Firestore `users` collection in the Firebase console:
   - Edit the document corresponding to your `uid` in the `users` collection.
   - Set `"role"` to `"admin"`.
3. Log out and log back in. The navigation will update and grant access to **Admin Control** (`admin-dashboard.html`).
4. **To promote Officers:** Navigate to the **User Roles Config** tab in the Admin Dashboard. Select a registered user, change their role to **Officer**, select a designated department (e.g. `Sanitation` or `PWD`), and click **Save**.
5. Log in with the newly promoted Officer account to view work orders routed to that specific department (`officer-dashboard.html`).
