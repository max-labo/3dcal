# Firebase Setup Guide

This guide will help you set up Firebase to enable Google login and settings synchronization.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard to create your project

## Step 2: Enable Google Authentication

1. In your Firebase project, go to **Authentication** > **Sign-in method**
2. Click on **Google** in the providers list
3. Toggle **Enable** to ON
4. Set a project support email (required)
5. Click **Save**

## Step 3: Create Firestore Database

1. In your Firebase project, go to **Firestore Database**
2. Click **Create database**
3. Choose your security mode:
   - **Production mode** (Recommended for production): Starts with strict security rules (deny all access). You'll need to set up rules immediately.
   - **Test mode** (For development only): Allows read/write access for 30 days, then locks down. Good for quick testing but not secure for production.
4. Choose a location for your database (choose the closest to your users)
5. Click **Enable**

### Firestore Security Rules (Required!)

After creating the database, go to **Rules** tab and update them to allow authenticated users to read/write their own data:

**Important:** If you chose "Production mode", you MUST set these rules immediately or the app won't work. Production mode starts with all access denied.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own settings
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Click **Publish** to save the rules.

## Step 4: Get Your Firebase Config

1. In your Firebase project, click the gear icon ⚙️ next to "Project Overview"
2. Select **Project settings**
3. Scroll down to **Your apps** section
4. Click the web icon `</>` to add a web app (if you haven't already)
5. Register your app with a nickname (e.g., "3D Print Calculator")
6. Copy the `firebaseConfig` object that appears

## Step 5: Update Your Code

1. Open `src/firebase.js`
2. Replace the placeholder values with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## Step 6: Test Your Setup

1. Run `npm run dev` to start the development server
2. Open your app in the browser
3. Click the "Sign in" button in the header
4. Complete the Google sign-in process
5. Make some changes to your settings (e.g., change currency, edit material rates)
6. Wait a few seconds - you should see "Saving..." appear
7. Refresh the page - your settings should be restored!

## Troubleshooting

### "Firebase is not configured" error
- Make sure you've updated `src/firebase.js` with your actual Firebase config
- Check that all values in `firebaseConfig` are correct

### "Permission denied" error
- Check your Firestore security rules (Step 3)
- Make sure the rules allow authenticated users to read/write their own data

### Google sign-in popup blocked
- Allow popups in your browser
- Check if you have popup blockers enabled

### Settings not saving
- Check the browser console for errors
- Verify that Firestore is enabled and rules are published
- Make sure you're signed in with Google

## Production Mode vs Test Mode

### Production Mode (Recommended)
- ✅ **More secure**: Starts with deny-all access, forces you to set proper rules
- ✅ **No time limit**: Rules don't expire
- ✅ **Best for production**: Ideal for apps in production
- ⚠️ **Requires rules immediately**: You must set security rules right away or the app won't work

### Test Mode
- ⚠️ **Less secure**: Allows open read/write access for 30 days
- ⚠️ **Time-limited**: Rules expire after 30 days and lock down
- ✅ **Quick testing**: Good for rapid development and testing
- ❌ **Not for production**: Should never be used in production

### Recommendation
- Use **Production mode** if you're deploying to production or want proper security from the start
- Use **Test mode** only for quick local development/testing

### Already created in Test Mode?
If you already created your database in test mode and want to switch to production mode:
1. Go to **Firestore Database** > **Rules** tab
2. Replace the test mode rules with the production rules shown above
3. Click **Publish**
4. Your database is now secured with production rules (same as production mode)

## Security Notes

- The Firestore rules above allow users to only access their own data (secure)
- Production mode is recommended for any app that will be used by others
- Never commit your Firebase config with production credentials to public repositories
- Consider using environment variables for sensitive config in production
- The rules ensure users can only read/write their own settings (by user ID)

