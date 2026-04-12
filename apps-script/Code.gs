/*
    File: Code.gs
    Author: Cole Perkins
    Date Created: 2026-04-12
    Date Last Modified: 2026-04-12
    Description: Main Google Apps Script for the RAMS Unified Arts homework system.
                 Serves as a web app that pulls assignments from Google Classroom
                 and returns them as JSON for the website. Runs on a daily trigger
                 and caches results in a Google Sheet for fast serving.
*/

/* ===================== SPREADSHEET ACCESS ===================== */

/**
 * Gets or creates the spreadsheet used to store config and homework data.
 * Uses PropertiesService to remember the sheet ID so this works as a
 * standalone script (not bound to a specific Google Sheet).
 */
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');

  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (e) {
      Logger.log('Stored sheet ID invalid, creating new sheet.');
    }
  }

  // Create a new spreadsheet and store its ID
  var ss = SpreadsheetApp.create('RAMS UA Homework Data');
  props.setProperty('SHEET_ID', ss.getId());
  Logger.log('Created new spreadsheet: ' + ss.getUrl());
  return ss;
}

/* ===================== WEB APP ENDPOINTS ===================== */

/**
 * Handles GET requests to the web app.
 * Returns cached homework data as JSON, or the teacher authorization page.
 *
 * Query params:
 *   ?action=authorize  — shows the teacher auth/config page
 *   ?action=courses&email=...  — lists courses for a teacher
 *   (default)          — returns homework JSON for the website
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'homework';

  if (action === 'authorize') {
    return serveAuthPage_();
  }

  if (action === 'courses') {
    return serveCourseList_(e.parameter.email || '');
  }

  // Default: serve homework data
  return serveHomeworkJson_();
}

/**
 * Handles POST requests for teacher configuration.
 * Teachers submit their email + selected course IDs.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.action === 'saveConfig') {
      saveTeacherConfig_(data);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Configuration saved!' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'removeConfig') {
      removeTeacherConfig_(data.email);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Configuration removed.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: 'Unknown action.' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ===================== HOMEWORK DATA ===================== */

/**
 * Serves the cached homework JSON from the Data sheet.
 */
function serveHomeworkJson_() {
  var ss = getSpreadsheet_();
  var dataSheet = ss.getSheetByName('Data');

  if (!dataSheet || dataSheet.getLastRow() < 2) {
    // No cached data — try a live fetch
    updateHomeworkData();
    dataSheet = ss.getSheetByName('Data');
  }

  var jsonStr = '';
  if (dataSheet && dataSheet.getRange('A1').getValue() === 'HomeworkJSON') {
    jsonStr = dataSheet.getRange('A2').getValue();
  }

  if (!jsonStr) {
    jsonStr = JSON.stringify({
      lastUpdated: new Date().toISOString(),
      weekOf: getCurrentWeekLabel_(),
      subjects: [],
      message: 'No homework data available yet. Teachers need to configure their classrooms.'
    });
  }

  return ContentService
    .createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Main function that fetches assignments from all configured teachers'
 * Google Classrooms and caches the result in the Data sheet.
 * Called by the daily trigger and can be run manually.
 */
function updateHomeworkData() {
  var ss = getSpreadsheet_();
  var configSheet = ss.getSheetByName('Config');

  if (!configSheet || configSheet.getLastRow() < 2) {
    Logger.log('No teacher configurations found.');
    return;
  }

  var configs = getTeacherConfigs_(configSheet);
  var subjects = [];

  configs.forEach(function(config) {
    var assignments = fetchAssignmentsForTeacher_(config);
    subjects.push({
      subject: config.subject,
      teacher: config.teacher,
      filterKey: config.filterKey,
      icon: config.icon,
      assignments: assignments
    });
  });

  var result = {
    lastUpdated: new Date().toISOString(),
    weekOf: getCurrentWeekLabel_(),
    subjects: subjects
  };

  // Cache in the Data sheet
  var dataSheet = ss.getSheetByName('Data');
  if (!dataSheet) {
    dataSheet = ss.insertSheet('Data');
  }
  dataSheet.clear();
  dataSheet.getRange('A1').setValue('HomeworkJSON');
  dataSheet.getRange('A2').setValue(JSON.stringify(result));

  Logger.log('Homework data updated successfully. ' + subjects.length + ' subjects processed.');
}

/**
 * Fetches recent assignments from Google Classroom for a single teacher config.
 * Pulls coursework that was posted or is due within the current week.
 */
function fetchAssignmentsForTeacher_(config) {
  var assignments = [];
  var courseIds = config.courseIds;

  if (!courseIds || courseIds.length === 0) {
    return assignments;
  }

  // Get the current week boundaries (Monday to Friday)
  var now = new Date();
  var monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  var friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  // Also look ahead to next Monday for weekend-due items
  var nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  courseIds.forEach(function(courseId) {
    courseId = courseId.trim();
    if (!courseId) return;

    try {
      // Get course info for the grade/title
      var course = Classroom.Courses.get(courseId);
      var courseTitle = course.name || '';
      var grade = extractGrade_(courseTitle);

      // Fetch recent coursework
      var response = Classroom.Courses.CourseWork.list(courseId, {
        pageSize: 20,
        orderBy: 'updateTime desc'
      });

      if (response.courseWork) {
        response.courseWork.forEach(function(work) {
          // Check if this assignment is relevant to the current week
          var isRelevant = false;
          var dueDate = null;

          if (work.dueDate) {
            dueDate = new Date(
              work.dueDate.year,
              work.dueDate.month - 1,
              work.dueDate.day
            );
            // Due this week or next few days
            isRelevant = (dueDate >= monday && dueDate <= nextMonday);
          }

          // Also check if it was recently posted (within last 7 days)
          if (!isRelevant && work.updateTime) {
            var updated = new Date(work.updateTime);
            var sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 7);
            isRelevant = (updated >= sevenDaysAgo);
          }

          if (isRelevant) {
            assignments.push({
              title: work.title || 'Untitled',
              description: truncateDescription_(work.description || ''),
              dueDate: dueDate ? formatDate_(dueDate) : 'No due date',
              dueDateRaw: dueDate ? dueDate.toISOString().split('T')[0] : '',
              dueDay: dueDate ? getDayName_(dueDate) : '',
              courseTitle: courseTitle,
              grade: grade,
              state: work.state || 'PUBLISHED',
              link: work.alternateLink || ''
            });
          }
        });
      }
    } catch (err) {
      Logger.log('Error fetching course ' + courseId + ': ' + err.toString());
      // Don't fail the whole update for one bad course
    }
  });

  return assignments;
}

/* ===================== TEACHER AUTH PAGE ===================== */

/**
 * Serves an HTML page where teachers can authorize and configure
 * their Google Classroom courses for the homework feed.
 */
function serveAuthPage_() {
  var html = HtmlService.createHtmlOutput(getAuthPageHtml_())
    .setTitle('RAMS UA - Teacher Setup')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

/**
 * Returns course list. Called by google.script.run from the auth page.
 * Public (no underscore) so the client-side code can call it.
 */
function getCoursesForAuthPage() {
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
          section: course.section || ''
        });
      });
    }
  } catch (err) {
    Logger.log('Error listing courses: ' + err.toString());
    return { courses: [], error: err.toString() };
  }

  return { courses: courses };
}

/**
 * Saves teacher config. Called by google.script.run from the auth page.
 * Public (no underscore) so the client-side code can call it.
 */
function saveTeacherConfigFromAuthPage(data) {
  saveTeacherConfig_(data);
  return { success: true, message: 'Configuration saved!' };
}

/**
 * Saves a teacher's configuration to the Config sheet.
 */
function saveTeacherConfig_(data) {
  var ss = getSpreadsheet_();
  var configSheet = ss.getSheetByName('Config');

  if (!configSheet) {
    configSheet = createConfigSheet_(ss);
  }

  // Check if teacher already has a row — update it
  var lastRow = configSheet.getLastRow();
  var existingRow = -1;

  if (lastRow >= 2) {
    var emails = configSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < emails.length; i++) {
      if (emails[i][0] === data.email) {
        existingRow = i + 2;
        break;
      }
    }
  }

  var rowData = [
    data.email,
    data.teacher,
    data.subject,
    data.filterKey,
    (data.courseIds || []).join(','),
    data.icon || ''
  ];

  if (existingRow > 0) {
    configSheet.getRange(existingRow, 1, 1, 6).setValues([rowData]);
  } else {
    configSheet.appendRow(rowData);
  }
}

/**
 * Removes a teacher's configuration from the Config sheet.
 */
function removeTeacherConfig_(email) {
  var ss = getSpreadsheet_();
  var configSheet = ss.getSheetByName('Config');
  if (!configSheet) return;

  var lastRow = configSheet.getLastRow();
  if (lastRow < 2) return;

  var emails = configSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = emails.length - 1; i >= 0; i--) {
    if (emails[i][0] === email) {
      configSheet.deleteRow(i + 2);
    }
  }
}

/* ===================== HELPER FUNCTIONS ===================== */

/**
 * Reads teacher configs from the Config sheet.
 */
function getTeacherConfigs_(configSheet) {
  var lastRow = configSheet.getLastRow();
  if (lastRow < 2) return [];

  var data = configSheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var configs = [];

  data.forEach(function(row) {
    if (row[0]) { // has email
      configs.push({
        email: row[0],
        teacher: row[1],
        subject: row[2],
        filterKey: row[3],
        courseIds: row[4] ? row[4].toString().split(',').map(function(s) { return s.trim(); }) : [],
        icon: row[5]
      });
    }
  });

  return configs;
}

/**
 * Tries to extract a grade level (6, 7, 8) from a course title.
 */
function extractGrade_(title) {
  if (!title) return 'All Grades';

  // Match patterns like "Grade 6", "Gr 7", "6th", "Period 3" (less useful)
  var match = title.match(/(?:grade|gr\.?)\s*(\d)/i) ||
              title.match(/(\d)(?:th|st|nd|rd)\s*(?:grade)?/i);

  if (match) {
    var num = parseInt(match[1]);
    if (num >= 6 && num <= 8) return 'Grade ' + num;
  }

  return 'All Grades';
}

/**
 * Truncates assignment descriptions to a reasonable length.
 */
function truncateDescription_(desc) {
  if (!desc) return '';
  // Remove HTML tags if present
  desc = desc.replace(/<[^>]*>/g, '').trim();
  if (desc.length > 200) {
    return desc.substring(0, 200) + '...';
  }
  return desc;
}

/**
 * Formats a date as "Mon DD" (e.g., "Apr 14").
 */
function formatDate_(date) {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[date.getMonth()] + ' ' + date.getDate();
}

/**
 * Returns the day of the week name for a date (e.g., "Monday").
 */
function getDayName_(date) {
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[date.getDay()];
}

/**
 * Returns a label like "Apr 7 – Apr 11, 2026" for the current week.
 */
function getCurrentWeekLabel_() {
  var now = new Date();
  var monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  var friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[monday.getMonth()] + ' ' + monday.getDate() + ' – ' +
         months[friday.getMonth()] + ' ' + friday.getDate() + ', ' + now.getFullYear();
}

/**
 * Custom menu for the spreadsheet.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Unified Arts HW')
    .addItem('Refresh Homework Data Now', 'updateHomeworkData')
    .addItem('List My Courses', 'listMyCoursesDialog')
    .addItem('Open Teacher Setup Page', 'openSetupPage')
    .addToUi();
}

/**
 * Shows a dialog with the teacher setup page URL.
 */
function openSetupPage() {
  var url = ScriptApp.getService().getUrl() + '?action=authorize';
  var html = HtmlService.createHtmlOutput(
    '<p>Share this link with teachers to set up their Classroom connection:</p>' +
    '<p><a href="' + url + '" target="_blank">' + url + '</a></p>' +
    '<p>Teachers will be able to select which of their courses to include in the homework feed.</p>'
  ).setWidth(500).setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'Teacher Setup Link');
}

/**
 * Shows a dialog listing the current user's Google Classroom courses.
 */
function listMyCoursesDialog() {
  var courses = [];
  try {
    var response = Classroom.Courses.list({ pageSize: 100, courseStates: ['ACTIVE'] });
    if (response.courses) {
      response.courses.forEach(function(c) {
        courses.push(c.name + ' (ID: ' + c.id + ')');
      });
    }
  } catch (err) {
    courses.push('Error: ' + err.toString());
  }

  var html = HtmlService.createHtmlOutput(
    '<h3>Your Active Courses</h3>' +
    '<ul>' + courses.map(function(c) { return '<li>' + c + '</li>'; }).join('') + '</ul>' +
    '<p>Copy the course IDs you want to include.</p>'
  ).setWidth(500).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, 'My Google Classroom Courses');
}

/* ===================== AUTH PAGE HTML ===================== */

/**
 * Returns the HTML for the teacher authorization/config page.
 * This is a self-contained page that teachers visit to link their courses.
 */
function getAuthPageHtml_() {
  // Get the actual web app URL server-side (can't rely on window.location in the sandbox)
  var actualScriptUrl = ScriptApp.getService().getUrl();

  return '<!DOCTYPE html>' +
  '<html><head>' +
  '<meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<title>RAMS UA Teacher Setup</title>' +
  '<style>' +
    '* { margin: 0; padding: 0; box-sizing: border-box; }' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f8fa; color: #1f2937; padding: 40px 20px; }' +
    '.container { max-width: 700px; margin: 0 auto; }' +
    'h1 { font-size: 1.8rem; color: #1B2A4A; margin-bottom: 8px; }' +
    '.subtitle { color: #6b7280; margin-bottom: 32px; }' +
    '.card { background: white; border-radius: 12px; padding: 28px; margin-bottom: 20px; border: 1px solid #e5e7eb; }' +
    'label { display: block; font-size: 0.88rem; font-weight: 600; color: #374151; margin-bottom: 6px; }' +
    'input, select { width: 100%; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; margin-bottom: 16px; }' +
    'input:focus, select:focus { outline: none; border-color: #C41E3A; }' +
    '.btn { padding: 12px 24px; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: 0.2s; }' +
    '.btn-primary { background: #C41E3A; color: white; }' +
    '.btn-primary:hover { background: #9B1B30; }' +
    '.btn-secondary { background: #1B2A4A; color: white; margin-left: 8px; }' +
    '.btn-secondary:hover { background: #0F1C33; }' +
    '.course-list { margin: 12px 0; }' +
    '.course-item { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; }' +
    '.course-item input[type="checkbox"] { width: auto; margin: 0; }' +
    '.course-item label { margin: 0; font-weight: 400; }' +
    '.status { padding: 12px; border-radius: 8px; margin-top: 16px; display: none; }' +
    '.status.success { display: block; background: #d1fae5; color: #065f46; }' +
    '.status.error { display: block; background: #fee2e2; color: #991b1b; }' +
    '.step { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }' +
    '.step-num { width: 32px; height: 32px; border-radius: 50%; background: #C41E3A; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }' +
    '.step-text { font-size: 0.95rem; }' +
    '.info { padding: 16px; background: #eff6ff; border-radius: 8px; margin-bottom: 20px; font-size: 0.9rem; color: #1e40af; }' +
  '</style>' +
  '</head><body>' +
  '<div class="container">' +
    '<h1>RAMS Unified Arts</h1>' +
    '<p class="subtitle">Teacher Homework Setup</p>' +

    '<div class="card">' +
      '<div class="info">This tool connects your Google Classroom courses to the RAMS UA homework page. Parents and students will see your posted assignments automatically.</div>' +
      '<div class="step"><span class="step-num">1</span><span class="step-text">Enter your school email and display info below</span></div>' +
      '<div class="step"><span class="step-num">2</span><span class="step-text">Click "Load My Courses" to see your Classroom courses</span></div>' +
      '<div class="step"><span class="step-num">3</span><span class="step-text">Check the courses you want on the homework page</span></div>' +
      '<div class="step"><span class="step-num">4</span><span class="step-text">Click "Save Configuration" &mdash; done!</span></div>' +
    '</div>' +

    '<div class="card">' +
      '<label for="email">Your School Email</label>' +
      '<input type="email" id="email" placeholder="perkinsc@holliston.k12.ma.us">' +

      '<label for="teacher">Display Name (how it shows on the website)</label>' +
      '<input type="text" id="teacher" placeholder="Mr. Perkins">' +

      '<label for="subject">Subject</label>' +
      '<select id="subject">' +
        '<option value="">Select your subject...</option>' +
        '<option value="Art" data-key="art" data-icon="🎨">Art</option>' +
        '<option value="Band" data-key="band" data-icon="🎺">Band</option>' +
        '<option value="Chorus" data-key="chorus" data-icon="🎤">Chorus</option>' +
        '<option value="General Music" data-key="music" data-icon="🎵">General Music</option>' +
        '<option value="Computer Science" data-key="cs" data-icon="💻">Computer Science</option>' +
        '<option value="Health" data-key="health" data-icon="🩹">Health</option>' +
        '<option value="Physical Education" data-key="pe" data-icon="🏃">Physical Education</option>' +
        '<option value="Wellness 2" data-key="wellness" data-icon="🧘">Wellness 2</option>' +
      '</select>' +

      '<button class="btn btn-secondary" onclick="loadCourses()">Load My Courses</button>' +

      '<div class="course-list" id="courseList"></div>' +

      '<button class="btn btn-primary" onclick="saveConfig()" style="margin-top: 12px;">Save Configuration</button>' +

      '<div class="status" id="status"></div>' +
    '</div>' +
  '</div>' +

  '<script>' +
    'function loadCourses() {' +
      'var email = document.getElementById("email").value;' +
      'if (!email) { alert("Please enter your email first."); return; }' +
      'var list = document.getElementById("courseList");' +
      'list.innerHTML = "<p>Loading courses...</p>";' +
      'google.script.run' +
        '.withSuccessHandler(function(data) {' +
          'if (data.error) {' +
            'list.innerHTML = "<p>API Error: " + data.error + "</p><p>Make sure the Google Classroom API is enabled in Services and that initialSetup() has been run.</p>";' +
            'return;' +
          '}' +
          'if (!data.courses || data.courses.length === 0) {' +
            'list.innerHTML = "<p>No active courses found. Make sure the script owner (Cole) has been added as a co-teacher to your courses.</p>";' +
            'return;' +
          '}' +
          'var html = "<p style=\\"font-size:0.88rem; color:#6b7280; margin-bottom:12px;\\">Select the courses to include on the homework page:</p>";' +
          'data.courses.forEach(function(c) {' +
            'html += "<div class=\\"course-item\\">" +' +
              '"<input type=\\"checkbox\\" id=\\"course_" + c.id + "\\" value=\\"" + c.id + "\\">" +' +
              '"<label for=\\"course_" + c.id + "\\">" + c.name + (c.section ? " (" + c.section + ")" : "") + "</label>" +' +
            '"</div>";' +
          '});' +
          'list.innerHTML = html;' +
        '})' +
        '.withFailureHandler(function(err) {' +
          'list.innerHTML = "<p>Error: " + err.message + "</p>";' +
        '})' +
        '.getCoursesForAuthPage();' +
    '}' +

    'function saveConfig() {' +
      'var email = document.getElementById("email").value;' +
      'var teacher = document.getElementById("teacher").value;' +
      'var subjectSelect = document.getElementById("subject");' +
      'var subject = subjectSelect.value;' +
      'var selected = subjectSelect.options[subjectSelect.selectedIndex];' +
      'var filterKey = selected ? selected.getAttribute("data-key") || "" : "";' +
      'var icon = selected ? selected.getAttribute("data-icon") || "" : "";' +

      'if (!email || !teacher || !subject) {' +
        'alert("Please fill in all fields.");' +
        'return;' +
      '}' +

      'var checkboxes = document.querySelectorAll("#courseList input[type=checkbox]:checked");' +
      'var courseIds = [];' +
      'checkboxes.forEach(function(cb) { courseIds.push(cb.value); });' +

      'if (courseIds.length === 0) {' +
        'alert("Please select at least one course.");' +
        'return;' +
      '}' +

      'var status = document.getElementById("status");' +
      'status.className = "status";' +
      'status.style.display = "none";' +

      'google.script.run' +
        '.withSuccessHandler(function(data) {' +
          'if (data.success) {' +
            'status.className = "status success";' +
            'status.textContent = "Configuration saved! Your assignments will appear on the homework page after the next daily update (6 AM), or when an admin clicks Refresh.";' +
          '} else {' +
            'status.className = "status error";' +
            'status.textContent = "Error: " + data.message;' +
          '}' +
        '})' +
        '.withFailureHandler(function(err) {' +
          'status.className = "status error";' +
          'status.textContent = "Error saving: " + err.message;' +
        '})' +
        '.saveTeacherConfigFromAuthPage({' +
          'email: email,' +
          'teacher: teacher,' +
          'subject: subject,' +
          'filterKey: filterKey,' +
          'icon: icon,' +
          'courseIds: courseIds' +
        '});' +
    '}' +
  '</script>' +
  '</body></html>';
}
