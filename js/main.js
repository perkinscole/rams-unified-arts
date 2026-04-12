/*
    File: js/main.js
    Author: Cole Perkins
    Date Created: 2026-04-12
    Date Last Modified: 2026-04-12
    Description: Main JavaScript for the RAMS Unified Arts website. Handles
                 navigation toggle, scroll effects, homework card expand/collapse,
                 subject filtering, dynamic homework loading from Google Classroom
                 via Apps Script API, and the homework posting helper for teachers.
*/

/* ===================== NAVBAR ===================== */

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
    });

    // Close nav when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
        });
    });
}

// Navbar scroll effect
const navbar = document.getElementById('navbar');
if (navbar) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

/* ===================== GOOGLE CLASSROOM INTEGRATION ===================== */

/*
 * Replace this URL with your deployed Google Apps Script web app URL.
 * See apps-script/SETUP_INSTRUCTIONS.md for deployment steps.
 */
var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxAUvxs8mRfCQ3_J42CQIk9bQVPDa9K7D00ZO-WZubCUYKWobf9IjxwBgJLSmOUA0Gh/exec';

/*
 * Fallback data used when the API is unavailable (not yet deployed,
 * network error, etc.). This keeps the page useful even without the
 * live Google Classroom connection.
 */
var FALLBACK_SUBJECTS = [
    { subject: 'Art', teacher: 'Mrs. Hebert', filterKey: 'art', icon: '\u{1F3A8}', assignments: [
        { grade: 'All Grades', title: 'Check Google Classroom for current assignments', description: '', dueDate: '' }
    ]},
    { subject: 'Band', teacher: 'Mr. Weithman', filterKey: 'band', icon: '\u{1F3BA}', assignments: [
        { grade: 'All Grades', title: 'Practice 15\u201320 min, 2 additional days at home', description: 'Warm up with long tones, practice scales, and work on concert music.', dueDate: '' }
    ]},
    { subject: 'Chorus', teacher: 'Teacher Campbell', filterKey: 'chorus', icon: '\u{1F3A4}', assignments: [
        { grade: 'All Grades', title: 'Check Google Classroom for practice assignments', description: '', dueDate: '' }
    ]},
    { subject: 'General Music', teacher: 'Teacher Campbell', filterKey: 'music', icon: '\u{1F3B5}', assignments: [
        { grade: 'All Grades', title: 'No homework this week', description: '', dueDate: '' }
    ]},
    { subject: 'Computer Science', teacher: 'Mr. Perkins', filterKey: 'cs', icon: '\u{1F4BB}', assignments: [
        { grade: 'All Grades', title: 'Check Google Classroom for current assignments', description: '', dueDate: '' }
    ]},
    { subject: 'Health', teacher: 'Mr. DeAngelis & Mr. Kwas', filterKey: 'health', icon: '\u{1FA79}', assignments: [
        { grade: 'All Grades', title: 'Check Google Classroom for current assignments', description: '', dueDate: '' }
    ]},
    { subject: 'Physical Education', teacher: 'Mr. DeAngelis & Mr. Kwas', filterKey: 'pe', icon: '\u{1F3C3}', assignments: [
        { grade: 'All Grades', title: 'No homework \u2014 wear sneakers and comfortable clothing!', description: '', dueDate: '' }
    ]},
    { subject: 'Wellness 2', teacher: 'Mrs. Boucher', filterKey: 'wellness', icon: '\u{1F9D8}', assignments: [
        { grade: 'All Grades', title: 'No homework \u2014 wear sneakers!', description: '', dueDate: '' }
    ]}
];

/**
 * Loads homework data from the Google Apps Script web app.
 * Falls back to static placeholder data if the API isn't available.
 * Called on DOMContentLoaded when the homework page is loaded.
 */
function loadHomework() {
    var grid = document.getElementById('hwGrid');
    var loading = document.getElementById('hwLoading');
    var lastUpdatedEl = document.getElementById('hwLastUpdated');

    if (!grid) return; // Not on the homework page

    // If the Apps Script URL hasn't been configured yet, use fallback immediately
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') {
        if (loading) loading.style.display = 'none';
        renderHomeworkCards(grid, { subjects: FALLBACK_SUBJECTS, weekOf: null }, lastUpdatedEl);
        return;
    }

    // Fetch live data from the Apps Script
    fetch(APPS_SCRIPT_URL)
        .then(function(response) {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(function(data) {
            if (loading) loading.style.display = 'none';
            renderHomeworkCards(grid, data, lastUpdatedEl);
        })
        .catch(function(err) {
            console.warn('Could not load homework from API, using fallback:', err);
            if (loading) loading.style.display = 'none';
            renderHomeworkCards(grid, { subjects: FALLBACK_SUBJECTS, weekOf: null }, lastUpdatedEl);
        });
}

/**
 * Renders homework cards into the grid from API data.
 * Groups assignments by grade within each subject.
 */
function renderHomeworkCards(grid, data, lastUpdatedEl) {
    var subjects = data.subjects || [];
    var html = '';

    // Show last updated timestamp if available
    if (lastUpdatedEl && data.lastUpdated) {
        var updated = new Date(data.lastUpdated);
        lastUpdatedEl.textContent = 'Last updated: ' + updated.toLocaleDateString('en-US', {
            weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
        lastUpdatedEl.style.display = 'block';
    }

    // Update the week label if provided by the API
    var hwDateEl = document.getElementById('hwDate');
    if (hwDateEl && data.weekOf) {
        hwDateEl.textContent = 'Week of ' + data.weekOf;
    }

    subjects.forEach(function(subj) {
        // Sort assignments by date first, then group by grade
        var sortedAssignments = (subj.assignments || []).slice().sort(function(a, b) {
            return (a.dueDateRaw || '9999') < (b.dueDateRaw || '9999') ? -1 : 1;
        });

        // Group by grade, preserving date sort within each grade
        var gradeMap = {};
        sortedAssignments.forEach(function(a) {
            var grade = a.grade || 'All Grades';
            if (!gradeMap[grade]) gradeMap[grade] = [];
            gradeMap[grade].push(a);
        });

        // Build the card HTML
        html += '<div class="hw-card open" data-subject="' + escapeHtml(subj.filterKey) + '">';
        html += '<div class="hw-card-header" onclick="toggleHwCard(this)">';
        html += '<span class="hw-card-icon">' + (subj.icon || '') + '</span>';
        html += '<h3>' + escapeHtml(subj.subject) + ' &mdash; ' + escapeHtml(subj.teacher) + '</h3>';
        html += '<span class="hw-card-toggle">&#9660;</span>';
        html += '</div>';
        html += '<div class="hw-card-body">';

        var grades = Object.keys(gradeMap);
        if (grades.length === 0) {
            html += '<div class="hw-grade-row">';
            html += '<span class="hw-grade-label">All Grades</span>';
            html += '<span class="hw-grade-content">No assignments posted this week.</span>';
            html += '</div>';
        } else {
            // Sort grades so they appear in order (Grade 6, Grade 7, Grade 8, All Grades)
            grades.sort();
            grades.forEach(function(grade) {
                html += '<div class="hw-grade-section">';
                html += '<div class="hw-grade-label-header">' + escapeHtml(grade) + '</div>';

                // Group this grade's assignments by day of week
                var dayMap = {};
                var noDayItems = [];
                gradeMap[grade].forEach(function(a) {
                    if (a.dueDay) {
                        if (!dayMap[a.dueDay]) dayMap[a.dueDay] = [];
                        dayMap[a.dueDay].push(a);
                    } else {
                        noDayItems.push(a);
                    }
                });

                // Roll Saturday/Sunday assignments into Friday
                if (dayMap['Saturday']) {
                    if (!dayMap['Friday']) dayMap['Friday'] = [];
                    dayMap['Saturday'].forEach(function(a) { dayMap['Friday'].push(a); });
                }
                if (dayMap['Sunday']) {
                    if (!dayMap['Friday']) dayMap['Friday'] = [];
                    dayMap['Sunday'].forEach(function(a) { dayMap['Friday'].push(a); });
                }

                // Always show all 5 weekdays, even if empty
                var dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
                var dayIndex = 0;

                dayOrder.forEach(function(day) {
                    var evenOdd = (dayIndex % 2 === 0) ? 'even' : 'odd';
                    html += '<div class="hw-day-group hw-day-' + evenOdd + '">';
                    html += '<span class="hw-day-label">' + day + '</span>';
                    html += '<div class="hw-day-items">';
                    if (dayMap[day] && dayMap[day].length > 0) {
                        dayMap[day].forEach(function(a) {
                            html += renderAssignment_(a);
                        });
                    } else {
                        html += '<span class="hw-no-hw">No homework</span>';
                    }
                    html += '</div></div>';
                    dayIndex++;
                });

                // Assignments with no specific due date
                if (noDayItems.length > 0) {
                    html += '<div class="hw-day-group hw-day-even">';
                    html += '<span class="hw-day-label">Ongoing</span>';
                    html += '<div class="hw-day-items">';
                    noDayItems.forEach(function(a) {
                        html += renderAssignment_(a);
                    });
                    html += '</div></div>';
                }

                html += '</div>';
            });
        }

        html += '</div></div>';
    });

    grid.innerHTML = html;

    // Re-bind filter buttons to the newly rendered cards
    bindFilterButtons();
}

/**
 * Renders a single assignment item as HTML.
 */
function renderAssignment_(a) {
    var h = '<div class="hw-assignment-item">';
    h += '<strong>' + escapeHtml(a.title) + '</strong>';
    if (a.dueDate && a.dueDate !== 'No due date') {
        h += ' <span class="hw-due-tag">Due ' + escapeHtml(a.dueDate) + '</span>';
    }
    if (a.description) {
        h += '<br><span class="hw-desc">' + escapeHtml(a.description) + '</span>';
    }
    if (a.link) {
        h += ' <a href="' + escapeHtml(a.link) + '" target="_blank" class="hw-link">View in Classroom</a>';
    }
    h += '</div>';
    return h;
}

/**
 * Escapes HTML special characters to prevent XSS.
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Load homework data when the page is ready
document.addEventListener('DOMContentLoaded', loadHomework);

/* ===================== HOMEWORK CARDS ===================== */

// Toggle expand/collapse on homework cards
function toggleHwCard(headerEl) {
    var card = headerEl.closest('.hw-card');
    card.classList.toggle('open');
}

// Set the current week date display
var hwDate = document.getElementById('hwDate');
if (hwDate) {
    var now = new Date();
    var monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    var friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    var opts = { month: 'short', day: 'numeric' };
    hwDate.textContent = 'Week of ' + monday.toLocaleDateString('en-US', opts) + ' \u2013 ' + friday.toLocaleDateString('en-US', opts) + ', ' + now.getFullYear();
}

/* ===================== HOMEWORK FILTERS ===================== */

/**
 * Binds click handlers to the filter buttons.
 * Called after homework cards are rendered so it picks up the new elements.
 */
function bindFilterButtons() {
    var filterBtns = document.querySelectorAll('.hw-filter-btn');
    var hwCards = document.querySelectorAll('.hw-card');

    filterBtns.forEach(function(btn) {
        // Remove old listeners by cloning
        var newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', function() {
            document.querySelectorAll('.hw-filter-btn').forEach(function(b) { b.classList.remove('active'); });
            newBtn.classList.add('active');

            var filter = newBtn.getAttribute('data-filter');
            document.querySelectorAll('.hw-card').forEach(function(card) {
                if (filter === 'all' || card.getAttribute('data-subject') === filter) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// Initial bind for filter buttons (in case page loads with static cards)
bindFilterButtons();

/* ===================== AI HOMEWORK GENERATOR ===================== */

/*
 * This function takes a teacher's quick notes and formats them into a clean,
 * structured homework posting. It works entirely client-side using template
 * logic — no API key required.
 *
 * For a future enhancement, this could be connected to an AI API (like Claude)
 * to do smarter parsing and formatting. For now, it provides a solid
 * template-based approach that cleans up and organizes rough teacher notes.
 */
function generateHwPosting() {
    const subject = document.getElementById('aiSubject').value;
    const weekInput = document.getElementById('aiWeek').value;
    const notes = document.getElementById('aiNotes').value.trim();
    const output = document.getElementById('aiOutput');
    const result = document.getElementById('aiResult');
    const btn = document.getElementById('aiGenerate');

    // Validation
    if (!subject) {
        alert('Please select a subject.');
        return;
    }
    if (!notes) {
        alert('Please enter your homework notes.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Generating...';

    // Format the week date
    let weekLabel = 'This Week';
    if (weekInput) {
        const d = new Date(weekInput + 'T00:00:00');
        const opts = { month: 'long', day: 'numeric', year: 'numeric' };
        weekLabel = `Week of ${d.toLocaleDateString('en-US', opts)}`;
    }

    // Parse the notes into grade-based sections
    const lines = notes.split('\n').filter(l => l.trim());
    const parsed = parseNotesIntoGrades(lines);

    // Build the formatted output
    let html = `<div style="margin-bottom: 12px;">`;
    html += `<strong style="font-size: 1.1rem;">${subject}</strong><br>`;
    html += `<span style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">${weekLabel}</span>`;
    html += `</div>`;
    html += `<hr style="border-color: rgba(255,255,255,0.15); margin: 12px 0;">`;

    if (parsed.length > 0) {
        parsed.forEach(section => {
            html += `<div style="margin-bottom: 14px;">`;
            html += `<strong style="color: var(--gold-light);">${section.grade}</strong><br>`;
            section.items.forEach(item => {
                html += `<span style="display: block; padding-left: 12px; margin-top: 4px;">• ${capitalizeFirst(item.trim())}</span>`;
            });
            html += `</div>`;
        });
    } else {
        // If no grades detected, just clean up the notes as bullet points
        html += `<div style="margin-bottom: 14px;">`;
        html += `<strong style="color: var(--gold-light);">All Grades</strong><br>`;
        lines.forEach(line => {
            html += `<span style="display: block; padding-left: 12px; margin-top: 4px;">• ${capitalizeFirst(line.trim())}</span>`;
        });
        html += `</div>`;
    }

    html += `<hr style="border-color: rgba(255,255,255,0.15); margin: 12px 0;">`;
    html += `<span style="font-size: 0.82rem; color: rgba(255,255,255,0.4);">Posted by RAMS Unified Arts</span>`;

    // Short delay for UX feel
    setTimeout(() => {
        result.innerHTML = html;
        output.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Generate Formatted Posting';
        output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 600);
}

/*
 * Parses rough teacher notes into grade-based sections.
 * Detects patterns like "gr6", "grade 6", "6th", "6th grade", "all grades", etc.
 */
function parseNotesIntoGrades(lines) {
    const sections = [];
    let currentSection = null;

    const gradePatterns = [
        { regex: /^(?:gr(?:ade)?\.?\s*)?6(?:th)?/i, label: 'Grade 6' },
        { regex: /^(?:gr(?:ade)?\.?\s*)?7(?:th)?/i, label: 'Grade 7' },
        { regex: /^(?:gr(?:ade)?\.?\s*)?8(?:th)?/i, label: 'Grade 8' },
        { regex: /^all\s*(?:grades?)?/i, label: 'All Grades' },
        { regex: /^6(?:th)?\s*(?:grade|gr)/i, label: 'Grade 6' },
        { regex: /^7(?:th)?\s*(?:grade|gr)/i, label: 'Grade 7' },
        { regex: /^8(?:th)?\s*(?:grade|gr)/i, label: 'Grade 8' },
    ];

    lines.forEach(line => {
        let matched = false;

        for (const pattern of gradePatterns) {
            if (pattern.regex.test(line.trim())) {
                // Extract the content after the grade label
                let content = line.trim().replace(pattern.regex, '').trim();
                // Remove leading separators like "- ", ": ", "– "
                content = content.replace(/^[\-–:]\s*/, '');

                currentSection = { grade: pattern.label, items: [] };
                sections.push(currentSection);

                if (content) {
                    // Split by commas or semicolons for multiple items
                    const items = content.split(/[;,]/).map(s => s.trim()).filter(Boolean);
                    currentSection.items.push(...items);
                }
                matched = true;
                break;
            }
        }

        if (!matched && currentSection) {
            // Continuation of previous grade section
            const cleaned = line.trim().replace(/^[\-•]\s*/, '');
            if (cleaned) {
                const items = cleaned.split(/[;,]/).map(s => s.trim()).filter(Boolean);
                currentSection.items.push(...items);
            }
        }
    });

    return sections;
}

/*
 * Capitalizes the first letter of a string.
 */
function capitalizeFirst(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/*
 * Copies the formatted homework output to the clipboard as plain text.
 */
function copyOutput() {
    const result = document.getElementById('aiResult');
    if (!result) return;

    const text = result.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const btn = result.parentElement.querySelector('.copy-btn');
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
    }).catch(() => {
        // Fallback: select text
        const range = document.createRange();
        range.selectNodeContents(result);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    });
}

/* ===================== HOMEWORK SEARCH PAGE ===================== */

/*
 * All search data is stored here after fetching from the API.
 * This is the flattened array of all assignments with subject/teacher
 * info attached to each one.
 */
var allSearchAssignments = [];

/**
 * Loads assignment data for the search page.
 * Fetches from the same API as the homework page, then flattens
 * all subjects' assignments into a single searchable array.
 */
function loadSearchData() {
    var searchResults = document.getElementById('searchResults');
    var searchLoading = document.getElementById('searchLoading');
    if (!searchResults) return; // Not on the search page

    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') {
        if (searchLoading) searchLoading.style.display = 'none';
        flattenAndRender({ subjects: FALLBACK_SUBJECTS });
        return;
    }

    fetch(APPS_SCRIPT_URL)
        .then(function(response) {
            if (!response.ok) throw new Error('Network error');
            return response.json();
        })
        .then(function(data) {
            if (searchLoading) searchLoading.style.display = 'none';
            flattenAndRender(data);
        })
        .catch(function(err) {
            console.warn('Search: could not load from API, using fallback:', err);
            if (searchLoading) searchLoading.style.display = 'none';
            flattenAndRender({ subjects: FALLBACK_SUBJECTS });
        });
}

/**
 * Flattens the API response into a single array of assignments,
 * attaching subject/teacher/icon to each one. Then populates
 * filter dropdowns and renders initial results.
 */
function flattenAndRender(data) {
    var subjects = data.subjects || [];
    allSearchAssignments = [];

    subjects.forEach(function(subj) {
        (subj.assignments || []).forEach(function(a) {
            allSearchAssignments.push({
                title: a.title || '',
                description: a.description || '',
                dueDate: a.dueDate || '',
                dueDateRaw: a.dueDateRaw || '',
                dueDay: a.dueDay || '',
                grade: a.grade || 'All Grades',
                courseTitle: a.courseTitle || '',
                link: a.link || '',
                subject: subj.subject,
                teacher: subj.teacher,
                filterKey: subj.filterKey,
                icon: subj.icon || ''
            });
        });
    });

    // Sort by due date (soonest first)
    allSearchAssignments.sort(function(a, b) {
        var da = a.dueDateRaw || '9999';
        var db = b.dueDateRaw || '9999';
        return da < db ? -1 : da > db ? 1 : 0;
    });

    populateSubjectDropdown(allSearchAssignments);
    populateSectionDropdown(allSearchAssignments);
    bindSearchEvents();
    runSearch();
}

/**
 * Populates the Subject dropdown from available data.
 */
function populateSubjectDropdown(assignments) {
    var select = document.getElementById('filterSubject');
    if (!select) return;

    var subjects = {};
    assignments.forEach(function(a) {
        if (a.subject && !subjects[a.subject]) {
            subjects[a.subject] = a.icon;
        }
    });

    Object.keys(subjects).sort().forEach(function(subj) {
        var opt = document.createElement('option');
        opt.value = subj;
        opt.textContent = (subjects[subj] || '') + ' ' + subj;
        select.appendChild(opt);
    });
}

/**
 * Populates the Section dropdown from available course titles.
 * Sections look like "Computer Science - 8T1" etc.
 */
function populateSectionDropdown(assignments) {
    var select = document.getElementById('filterSection');
    if (!select) return;

    var sections = {};
    assignments.forEach(function(a) {
        if (a.courseTitle) sections[a.courseTitle] = true;
    });

    Object.keys(sections).sort().forEach(function(section) {
        var opt = document.createElement('option');
        opt.value = section;
        opt.textContent = section;
        select.appendChild(opt);
    });
}

/**
 * Binds search input and filter change events.
 */
function bindSearchEvents() {
    var searchInput = document.getElementById('searchInput');
    var filterSubject = document.getElementById('filterSubject');
    var filterGrade = document.getElementById('filterGrade');
    var filterSection = document.getElementById('filterSection');

    if (searchInput) searchInput.addEventListener('input', runSearch);
    if (filterSubject) filterSubject.addEventListener('change', function() {
        // When subject changes, update section dropdown to show only matching sections
        updateSectionDropdown();
        runSearch();
    });
    if (filterGrade) filterGrade.addEventListener('change', function() {
        updateSectionDropdown();
        runSearch();
    });
    if (filterSection) filterSection.addEventListener('change', runSearch);
}

/**
 * Updates the section dropdown to only show sections matching
 * the current subject and grade filters.
 */
function updateSectionDropdown() {
    var select = document.getElementById('filterSection');
    if (!select) return;

    var subjectFilter = (document.getElementById('filterSubject') || {}).value || '';
    var gradeFilter = (document.getElementById('filterGrade') || {}).value || '';
    var currentValue = select.value;

    // Clear all options except "All Sections"
    while (select.options.length > 1) {
        select.remove(1);
    }

    var sections = {};
    allSearchAssignments.forEach(function(a) {
        if (subjectFilter && a.subject !== subjectFilter) return;
        if (gradeFilter && a.grade !== gradeFilter) return;
        if (a.courseTitle) sections[a.courseTitle] = true;
    });

    Object.keys(sections).sort().forEach(function(section) {
        var opt = document.createElement('option');
        opt.value = section;
        opt.textContent = section;
        select.appendChild(opt);
    });

    // Restore selection if it still exists
    if (sections[currentValue]) {
        select.value = currentValue;
    } else {
        select.value = '';
    }
}

/**
 * Runs the search/filter and renders results.
 */
function runSearch() {
    var query = ((document.getElementById('searchInput') || {}).value || '').toLowerCase().trim();
    var subjectFilter = (document.getElementById('filterSubject') || {}).value || '';
    var gradeFilter = (document.getElementById('filterGrade') || {}).value || '';
    var sectionFilter = (document.getElementById('filterSection') || {}).value || '';

    var filtered = allSearchAssignments.filter(function(a) {
        // Subject filter
        if (subjectFilter && a.subject !== subjectFilter) return false;
        // Grade filter
        if (gradeFilter && a.grade !== gradeFilter) return false;
        // Section filter
        if (sectionFilter && a.courseTitle !== sectionFilter) return false;
        // Keyword search
        if (query) {
            var searchable = (a.title + ' ' + a.description + ' ' + a.courseTitle + ' ' + a.teacher + ' ' + a.subject).toLowerCase();
            return searchable.indexOf(query) !== -1;
        }
        return true;
    });

    renderSearchResults(filtered);
}

/**
 * Renders the filtered search results.
 */
function renderSearchResults(assignments) {
    var container = document.getElementById('searchResults');
    var countEl = document.getElementById('searchCount');
    var emptyEl = document.getElementById('searchEmpty');
    if (!container) return;

    // Update count
    if (countEl) {
        countEl.textContent = 'Showing ' + assignments.length + ' of ' + allSearchAssignments.length + ' assignments';
    }

    // Empty state
    if (assignments.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    var html = '';
    assignments.forEach(function(a) {
        html += '<div class="search-result-card">';

        // Icon
        html += '<div class="search-result-icon">' + (a.icon || '') + '</div>';

        // Body
        html += '<div class="search-result-body">';
        html += '<h4>' + escapeHtml(a.title) + '</h4>';
        html += '<div class="search-result-meta">';
        html += '<span class="search-meta-tag">' + escapeHtml(a.subject) + '</span>';
        html += '<span class="search-meta-tag grade">' + escapeHtml(a.grade) + '</span>';
        if (a.courseTitle) {
            html += '<span class="search-meta-tag section">' + escapeHtml(a.courseTitle) + '</span>';
        }
        html += '</div>';
        if (a.description) {
            html += '<p class="search-result-desc">' + escapeHtml(a.description) + '</p>';
        }
        if (a.link) {
            html += '<a href="' + escapeHtml(a.link) + '" target="_blank" class="search-result-link">View in Classroom &rarr;</a>';
        }
        html += '</div>';

        // Right side - due date
        html += '<div class="search-result-right">';
        if (a.dueDate && a.dueDate !== 'No due date') {
            html += '<div class="search-result-due">Due ' + escapeHtml(a.dueDate) + '</div>';
        }
        if (a.dueDay) {
            html += '<div class="search-result-day">' + escapeHtml(a.dueDay) + '</div>';
        }
        html += '</div>';

        html += '</div>';
    });

    container.innerHTML = html;
}

// Load search data when page is ready
document.addEventListener('DOMContentLoaded', loadSearchData);

/* ===================== SMOOTH SCROLL FOR ANCHOR LINKS ===================== */

document.querySelectorAll('a[href*="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        // Only handle same-page anchors
        if (href.startsWith('#') || (href.includes('#') && href.split('#')[0] === '')) {
            const target = document.querySelector('#' + href.split('#')[1]);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
});
