<!--
    File: SETUP_INSTRUCTIONS.md
    Author: Cole Perkins
    Date Created: 2026-04-12
    Date Last Modified: 2026-04-12
    Description: Step-by-step setup guide for deploying the Google Apps Script
                 that powers the RAMS UA homework auto-update system.
-->

# RAMS Unified Arts - Homework System Setup

## Overview

This system automatically pulls assignments from each teacher's Google Classroom
and displays them on the RAMS UA website homework page. It runs daily at 6 AM and
teachers can set up their own courses through a simple web form.

## Prerequisites

- A Google account with Google Classroom access (perkinsc@holliston.k12.ma.us)
- The script owner (Cole) needs to be added as a **co-teacher** on each teacher's
  Google Classroom courses that should appear on the homework page

## Step 1: Create the Google Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **New Project**
3. Rename it to "RAMS UA Homework System"
4. Delete the default `Code.gs` content

## Step 2: Add the Script Files

1. Paste the contents of `Code.gs` into the default `Code.gs` file
2. Click **+** next to Files > **Script** > name it `Setup`
3. Paste the contents of `Setup.gs` into the new file

## Step 3: Enable the Google Classroom API

1. In the script editor, click the **+** next to **Services** (left sidebar)
2. Scroll down and find **Google Classroom API**
3. Click **Add**
4. It should appear as `Classroom` in the services list

## Step 4: Connect to a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it "RAMS UA Homework Data"
3. Go back to the script editor
4. Click **Project Settings** (gear icon)
5. Under **Script Properties**, no changes needed — but note the sheet is where
   the script will store config and cached data
6. In `Code.gs`, the script uses `SpreadsheetApp.getActiveSpreadsheet()`, so you
   need to change the approach:
   - **Option A (Recommended):** Open your new Google Sheet, then go to
     **Extensions > Apps Script**. This opens a script editor bound to that sheet.
     Paste your code there instead of in a standalone script.
   - **Option B:** In the standalone script, replace
     `SpreadsheetApp.getActiveSpreadsheet()` with
     `SpreadsheetApp.openById('YOUR_SHEET_ID')` using your sheet's ID from its URL.

## Step 5: Run Initial Setup

1. In the script editor, select the `initialSetup` function from the dropdown
2. Click **Run**
3. You'll be prompted to authorize — click through the permissions:
   - View and manage your Google Classroom classes
   - View and manage your Google Sheets
4. The script will create the Config and Data sheets and set up the daily trigger

## Step 6: Deploy as Web App

1. Click **Deploy** > **New Deployment**
2. Click the gear icon next to "Select type" > choose **Web app**
3. Settings:
   - **Description:** "RAMS UA Homework Feed"
   - **Execute as:** Me (perkinsc@holliston.k12.ma.us)
   - **Who has access:** Anyone
4. Click **Deploy**
5. **Copy the web app URL** — you'll need this for the website

## Step 7: Update the Website

1. Open `js/main.js` in the website project
2. Find the line: `var APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';`
3. Replace the placeholder with your actual web app URL
4. Save the file

## Step 8: Teacher Setup

Share the teacher setup link with each UA teacher:

```
YOUR_WEB_APP_URL?action=authorize
```

Each teacher will:
1. Enter their school email
2. Enter their display name (e.g., "Mr. Perkins")
3. Select their subject
4. Click "Load My Courses" to see available courses
5. Check the courses they want on the homework page
6. Click "Save Configuration"

**Important:** For a teacher's courses to appear, the script owner (Cole) must be
added as a co-teacher on those Google Classroom courses. Ask each teacher to:
1. Open their Google Classroom
2. Go to the class > Settings (or People)
3. Invite perkinsc@holliston.k12.ma.us as a co-teacher

## How It Works

- **Daily at 6 AM:** The script automatically pulls recent assignments from all
  configured Google Classrooms
- **When someone visits the homework page:** The page fetches the cached data
  from the Apps Script web app and displays it
- **Manual refresh:** Open the Google Sheet > Menu > Unified Arts HW > Refresh

## Troubleshooting

**No courses showing up for a teacher:**
- Make sure Cole (perkinsc@) is a co-teacher on their courses
- The course must be in ACTIVE state (not archived)

**Homework page shows "Unable to load":**
- Check that the web app URL in `main.js` is correct
- Make sure the web app is deployed with "Anyone" access
- Check the Apps Script execution log for errors

**Assignments not appearing:**
- Only assignments posted or due within the current week are shown
- Check that the course IDs in the Config sheet are correct
- Run "Refresh Homework Data Now" from the spreadsheet menu

**Need to re-deploy after code changes:**
- Go to Deploy > Manage Deployments > Edit (pencil icon)
- Update the version to "New version"
- Click Deploy
