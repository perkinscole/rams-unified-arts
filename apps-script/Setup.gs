/*
    File: Setup.gs
    Author: Cole Perkins
    Date Created: 2026-04-12
    Date Last Modified: 2026-04-12
    Description: One-time setup and utility functions for the RAMS Unified Arts
                 homework system. Creates required sheets, sets up the daily
                 trigger, and provides helper functions for managing courses.
*/

/**
 * Run this function FIRST after pasting the scripts into a new
 * Google Apps Script project. It will:
 *   1. Create the Config and Data sheets
 *   2. Set up a daily trigger to refresh homework at 6 AM
 *   3. Pre-populate the Config sheet with UA teacher info
 *
 * You will be prompted to authorize Google Classroom access.
 */
function initialSetup() {
  var ss = getSpreadsheet_();

  Logger.log('Using spreadsheet: ' + ss.getUrl());

  // Create Config sheet
  var configSheet = ss.getSheetByName('Config');
  if (!configSheet) {
    configSheet = createConfigSheet_(ss);
    Logger.log('Config sheet created.');
  } else {
    Logger.log('Config sheet already exists.');
  }

  // Create Data sheet
  var dataSheet = ss.getSheetByName('Data');
  if (!dataSheet) {
    dataSheet = ss.insertSheet('Data');
    dataSheet.getRange('A1').setValue('HomeworkJSON');
    Logger.log('Data sheet created.');
  } else {
    Logger.log('Data sheet already exists.');
  }

  // Set up daily trigger (6 AM)
  setupDailyTrigger_();

  Logger.log('Setup complete! Spreadsheet URL: ' + ss.getUrl());
}

/**
 * Creates the Config sheet with headers and optional pre-populated rows.
 */
function createConfigSheet_(ss) {
  var sheet = ss.insertSheet('Config');

  // Headers
  var headers = ['Email', 'Teacher', 'Subject', 'FilterKey', 'CourseIDs', 'Icon'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1B2A4A')
    .setFontColor('#FFFFFF');

  // Set column widths
  sheet.setColumnWidth(1, 250); // Email
  sheet.setColumnWidth(2, 180); // Teacher
  sheet.setColumnWidth(3, 180); // Subject
  sheet.setColumnWidth(4, 100); // FilterKey
  sheet.setColumnWidth(5, 300); // CourseIDs
  sheet.setColumnWidth(6, 60);  // Icon

  // Freeze header row
  sheet.setFrozenRows(1);

  return sheet;
}

/**
 * Sets up a daily trigger to run updateHomeworkData at 6 AM.
 * Removes any existing triggers for that function first.
 */
function setupDailyTrigger_() {
  // Remove existing triggers for updateHomeworkData
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'updateHomeworkData') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new daily trigger at 6 AM
  ScriptApp.newTrigger('updateHomeworkData')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log('Daily trigger set for 6 AM.');
}

/**
 * Utility: Lists all active Google Classroom courses visible to the
 * script owner. Run this to find course IDs.
 */
function listMyCourses() {
  var courses = [];

  try {
    var response = Classroom.Courses.list({
      pageSize: 100,
      courseStates: ['ACTIVE']
    });

    if (response.courses) {
      response.courses.forEach(function(course) {
        courses.push({
          id: course.id,
          name: course.name,
          section: course.section || '',
          ownerId: course.ownerId || ''
        });
      });
    }
  } catch (err) {
    Logger.log('Error: ' + err.toString());
    Logger.log('Make sure you have enabled the Google Classroom API in Services.');
    return;
  }

  Logger.log('Found ' + courses.length + ' active courses:');
  courses.forEach(function(c) {
    Logger.log('  ' + c.name + (c.section ? ' (' + c.section + ')' : '') + ' — ID: ' + c.id);
  });

  return courses;
}

/**
 * Utility: Manually triggers a homework data refresh.
 * Same as clicking "Refresh Homework Data Now" from the menu.
 */
function manualRefresh() {
  updateHomeworkData();
  SpreadsheetApp.getUi().alert('Homework data has been refreshed!');
}

/**
 * Utility: Removes all triggers associated with this project.
 * Use if you need to completely reset the trigger setup.
 */
function removeAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  Logger.log('All triggers removed.');
}
