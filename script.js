/* ==========================================================================
   SZABIST GPA Calculator — Application Logic
   Shared across all pages. Exposes window.szabist.initPage(pageType).
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Grading scale (SZABIST undergraduate — official)                  */
  /* ------------------------------------------------------------------ */
  const gradingScale = [
    { grade: 'A+', min: 90, max: 100, gpa: 4.0 },
    { grade: 'A',  min: 85, max: 89,  gpa: 3.75 },
    { grade: 'A−', min: 80, max: 84,  gpa: 3.5 },
    { grade: 'B+', min: 75, max: 79,  gpa: 3.25 },
    { grade: 'B',  min: 70, max: 74,  gpa: 3.0 },
    { grade: 'B−', min: 66, max: 69,  gpa: 2.75 },
    { grade: 'C+', min: 63, max: 65,  gpa: 2.5 },
    { grade: 'C',  min: 60, max: 62,  gpa: 2.0 },
    { grade: 'C−', min: 55, max: 59,  gpa: 1.5 },
    { grade: 'F',  min: 0,  max: 54,  gpa: 0.0 },
  ];

  const gradeToGPA = {
    'A+': 4.0, A: 3.75, 'A−': 3.5, 'B+': 3.25, B: 3.0,
    'B−': 2.75, 'C+': 2.5, C: 2.0, 'C−': 1.5, F: 0.0,
  };

  const classification = [
    { min: 3.75, label: "Dean's List",      badge: 'badge-dean' },
    { min: 3.0,  label: 'Good Standing',    badge: 'badge-good' },
    { min: 2.0,  label: 'Satisfactory',     badge: 'badge-satisfactory' },
    { min: 1.0,  label: 'On Probation',     badge: 'badge-probation' },
    { min: 0.0,  label: 'Academic Warning', badge: 'badge-warning' },
  ];

  const STORAGE_KEY = 'szabistGPA_v2';
  const CONSENT_KEY = 'szabistConsent_v2';
  const THEME_KEY = 'szabistTheme_v2';

  let uidCounter = 0;
  function uid() {
    uidCounter += 1;
    return `id_${Date.now().toString(36)}_${uidCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function createBlankCourse() {
    return {
      id: uid(),
      name: '',
      credits: '',
      grade: 'A+',
      percentage: '',
    };
  }

  function createBlankSemester() {
    return {
      id: uid(),
      name: '',
      courses: [createBlankCourse()],
    };
  }

  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */
  let state = {
    semesterMode: 'grade', // 'grade' | 'percentage'
    cgpaMode: 'grade',
    semesterCourses: [],
    semesters: [],
  };

  const debounceTimers = {};

  /* ------------------------------------------------------------------ */
  /*  Storage                                                           */
  /* ------------------------------------------------------------------ */
  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage disabled — silently ignore
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.semesterMode = parsed.semesterMode === 'percentage' ? 'percentage' : 'grade';
        state.cgpaMode = parsed.cgpaMode === 'percentage' ? 'percentage' : 'grade';
        state.semesterCourses = Array.isArray(parsed.semesterCourses) ? parsed.semesterCourses : [];
        state.semesters = Array.isArray(parsed.semesters) ? parsed.semesters : [];
      }
    } catch (e) {
      // Corrupt storage — reset safely
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Analytics consent                                                 */
  /* ------------------------------------------------------------------ */
  function getConsent() {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (raw === null) return true; // Cookieless anonymous tracking enabled unless opted out
      return JSON.parse(raw).tracking !== false;
    } catch (e) {
      return true;
    }
  }

  function setConsent(granted) {
    const allowed = Boolean(granted);
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ tracking: allowed, at: Date.now() }));
      if (allowed) {
        localStorage.removeItem('umami.disabled');
      } else {
        localStorage.setItem('umami.disabled', '1');
      }
    } catch (e) {
      // ignore
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Analytics events (Umami)                                          */
  /* ------------------------------------------------------------------ */
  const umamiReady = () =>
    typeof window.umami !== 'undefined' && typeof window.umami.track === 'function';

  function trackEvent(eventName, data = {}) {
    if (!getConsent()) return;

    const payload = { ...data };

    if (umamiReady()) {
      window.umami.track(eventName, payload);
      return;
    }

    window.szabistAnalyticsQueue = window.szabistAnalyticsQueue || [];
    window.szabistAnalyticsQueue.push({ eventName, payload });

    if (!window.szabistAnalyticsProcessing) {
      window.szabistAnalyticsProcessing = true;
      const wait = setInterval(() => {
        if (umamiReady()) {
          window.szabistAnalyticsQueue.forEach((q) =>
            window.umami.track(q.eventName, q.payload)
          );
          window.szabistAnalyticsQueue = [];
          clearInterval(wait);
          window.szabistAnalyticsProcessing = false;
        }
      }, 200);
      setTimeout(() => {
        clearInterval(wait);
        window.szabistAnalyticsProcessing = false;
      }, 5000);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Calculation helpers                                               */
  /* ------------------------------------------------------------------ */
  function hasNumericValue(val) {
    if (val === '' || val === null || val === undefined) return false;
    return !Number.isNaN(parseFloat(String(val).trim()));
  }

  function percentageToGPA(percentage) {
    const parsed = parseFloat(percentage);
    if (Number.isNaN(parsed)) return { grade: 'F', gpa: 0.0 };
    const clamped = Math.min(100, Math.max(0, parsed));
    const rounded = Math.round(clamped);
    for (const scale of gradingScale) {
      if (rounded >= scale.min) {
        return { grade: scale.grade, gpa: scale.gpa };
      }
    }
    return { grade: 'F', gpa: 0.0 };
  }

  function gpaClassification(gpa) {
    for (const c of classification) {
      if (gpa >= c.min) return c;
    }
    return classification[classification.length - 1];
  }

  function evaluateCourses(courses, mode) {
    let totalPoints = 0;
    let totalCredits = 0;
    let validCount = 0;

    for (const course of courses) {
      const credits = parseInt(course.credits, 10) || 0;
      if (credits <= 0) continue;

      let gpa;
      if (mode === 'grade') {
        gpa = Object.prototype.hasOwnProperty.call(gradeToGPA, course.grade)
          ? gradeToGPA[course.grade]
          : 0;
      } else {
        if (!hasNumericValue(course.percentage)) continue;
        gpa = percentageToGPA(course.percentage).gpa;
      }

      totalPoints += credits * gpa;
      totalCredits += credits;
      validCount += 1;
    }

    return {
      gpa: totalCredits > 0 ? totalPoints / totalCredits : 0,
      totalPoints,
      totalCredits,
      validCount,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Toast notifications                                               */
  /* ------------------------------------------------------------------ */
  let toastContainer;
  function ensureToastContainer() {
    if (toastContainer) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(message, type = 'info') {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  /* ------------------------------------------------------------------ */
  /*  Reserved placement slot helpers (prototype & live-swap ready)     */
  /* ------------------------------------------------------------------ */
  function syncDockBodyState() {
    const activeDock = document.querySelector('.dock-frame:not(.slot-frame--collapsed)');
    document.body.classList.toggle('has-dock', Boolean(activeDock));
  }

  function initPlacementSlots() {
    document.querySelectorAll('[data-dismiss-dock]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-dismiss-dock');
        const dock = targetId ? document.getElementById(targetId) : btn.closest('.dock-frame');
        if (dock) {
          dock.classList.add('slot-frame--collapsed');
          dock.classList.remove('slot-frame--active');
          syncDockBodyState();
          trackEvent('dock_dismissed', { slot: dock.id || 'dock' });
        }
      });
    });

    syncDockBodyState();
  }

  function activateSlot(slotId, contentHtml) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    slot.classList.remove('slot-frame--collapsed');
    slot.classList.add('slot-frame--active');
    if (typeof contentHtml === 'string') {
      const preview = slot.querySelector('.slot-preview');
      if (preview) {
        preview.outerHTML = contentHtml;
      } else {
        slot.insertAdjacentHTML('beforeend', contentHtml);
      }
    }
    syncDockBodyState();
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering — generic helpers                                       */
  /* ------------------------------------------------------------------ */
  const optionsMarkup = (selectedGrade) =>
    Object.keys(gradeToGPA)
      .map((g) => `<option value="${g}" ${g === selectedGrade ? 'selected' : ''}>${g} (${gradeToGPA[g].toFixed(2)})</option>`)
      .join('');

  function performanceInputMarkup(mode, course) {
    if (mode === 'grade') {
      return `
        <select class="input-field" data-field="grade" aria-label="Grade">
          ${optionsMarkup(course.grade || 'A+')}
        </select>
      `;
    }
    return `
      <input type="number" min="0" max="100" step="any"
             value="${escapeHtml(String(course.percentage ?? ''))}"
             placeholder="0–100" class="input-field text-center"
             data-field="percentage" aria-label="Percentage">
    `;
  }

  function clampFieldInput(field, rawValue) {
    const trimmed = String(rawValue ?? '').trim();
    if (trimmed === '') return '';
    if (field === 'credits') {
      const parsed = parseInt(trimmed, 10);
      if (Number.isNaN(parsed)) return '';
      return Math.max(0, Math.min(6, parsed));
    }
    if (field === 'percentage') {
      const parsed = parseFloat(trimmed);
      if (Number.isNaN(parsed)) return '';
      return Math.min(100, Math.max(0, parsed));
    }
    return rawValue;
  }

  /* ------------------------------------------------------------------ */
  /*  Semester GPA page                                                 */
  /* ------------------------------------------------------------------ */
  function initSemesterPage() {
    const container = document.getElementById('semesterCourses');
    const toggle = document.getElementById('semesterToggle');
    const gradeLabel = document.getElementById('semesterGradeLabel');
    const percentLabel = document.getElementById('semesterPercentLabel');
    const perfLabel = document.getElementById('semesterPerfLabel');
    const addBtn = document.getElementById('addCourseBtn');
    const calcBtn = document.getElementById('calcSemesterBtn');
    const clearBtn = document.getElementById('clearSemesterBtn');
    const shareBtn = document.getElementById('shareSemesterBtn');
    const resultWrap = document.getElementById('semesterResult');
    const emptyState = document.getElementById('semesterEmptyState');
    const modeInput = document.getElementById('semesterModeInput');

    function syncModeUI() {
      const isPercent = state.semesterMode === 'percentage';
      toggle.classList.toggle('percentage', isPercent);
      toggle.setAttribute('aria-checked', String(isPercent));
      if (modeInput) modeInput.checked = isPercent;
      gradeLabel.classList.toggle('active', !isPercent);
      gradeLabel.classList.toggle('inactive', isPercent);
      percentLabel.classList.toggle('active', isPercent);
      percentLabel.classList.toggle('inactive', !isPercent);
      if (perfLabel) perfLabel.textContent = isPercent ? 'Percentage' : 'Grade';
    }

    function courseRowMarkup(course, index) {
      const isPercentage = state.semesterMode === 'percentage';
      const idStr = escapeHtml(String(course.id));

      return `
        <div class="course-row" data-course-id="${idStr}">
          <div class="flex flex-col">
            <label class="input-label md:hidden">Course Name</label>
            <input type="text" value="${escapeHtml(course.name || '')}"
                   placeholder="e.g. Programming Fundamentals"
                   data-field="name" aria-label="Course name"
                   class="input-field">
          </div>
          <div class="flex flex-col">
            <label class="input-label md:hidden">Credit Hours</label>
            <input type="number" min="0" max="6" step="1"
                   value="${escapeHtml(String(course.credits ?? ''))}"
                   placeholder="1–6" data-field="credits" aria-label="Credit hours"
                   class="input-field text-center">
          </div>
          <div class="flex flex-col">
            <label class="input-label md:hidden">${isPercentage ? 'Percentage' : 'Grade'}</label>
            ${performanceInputMarkup(state.semesterMode, course)}
          </div>
          <div class="course-actions">
            <button type="button" class="btn-icon btn-icon--danger"
                    data-action="remove-course"
                    title="Remove course"
                    aria-label="Remove course ${index + 1}">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    function updateEmptyState() {
      if (!emptyState) return;
      emptyState.classList.toggle('hidden', state.semesterCourses.length > 0);
    }

    function render() {
      if (!container) return;
      container.innerHTML = state.semesterCourses
        .map((c, i) => courseRowMarkup(c, i))
        .join('');
      updateEmptyState();
    }

    function scrollToResult() {
      if (resultWrap) resultWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function showResult(gpa, credits, options = {}) {
      const valueEl = document.getElementById('semesterGPAValue');
      const badgeEl = document.getElementById('semesterGradeBadge');
      const creditsEl = document.getElementById('semesterCreditsValue');
      if (!resultWrap || !valueEl) return;

      const wasHidden = resultWrap.classList.contains('hidden');
      const plaque = resultWrap.querySelector('.result-plaque');

      valueEl.textContent = gpa.toFixed(2);
      valueEl.classList.remove('count-up');
      void valueEl.offsetWidth;
      valueEl.classList.add('count-up');

      const cls = gpaClassification(gpa);
      if (badgeEl) {
        badgeEl.textContent = cls.label;
        badgeEl.className = `badge ${cls.badge}`;
      }
      if (creditsEl) creditsEl.textContent = String(credits);

      resultWrap.classList.remove('hidden');

      if (wasHidden && plaque) {
        plaque.style.animation = 'none';
        void plaque.offsetHeight;
        plaque.style.animation = '';
      }

      if (wasHidden && !options.initialLoad) {
        scrollToResult();
      }

      if (!options.initialLoad) {
        trackEvent('result_shown', { tool: 'semester', gpa: gpa.toFixed(2) });
      }
    }

    function calculateAndShow(options = {}) {
      const { gpa, totalCredits } = evaluateCourses(state.semesterCourses, state.semesterMode);
      if (totalCredits <= 0) {
        if (resultWrap) resultWrap.classList.add('hidden');
        return { gpa: 0, totalCredits: 0 };
      }
      showResult(gpa, totalCredits, options);
      return { gpa, totalCredits };
    }

    function scheduleCalc() {
      clearTimeout(debounceTimers.semester);
      debounceTimers.semester = setTimeout(() => {
        calculateAndShow();
      }, 250);
    }

    // Event delegation for real-time input, clamping on blur, and course removal
    container.addEventListener('input', (e) => {
      const target = e.target;
      const field = target.getAttribute('data-field');
      if (!field) return;
      const row = target.closest('.course-row');
      if (!row) return;
      const id = row.getAttribute('data-course-id');
      const course = state.semesterCourses.find((c) => String(c.id) === String(id));
      if (!course) return;

      course[field] = target.value;
      saveToStorage();
      if (field !== 'name') {
        scheduleCalc();
      }
    });

    container.addEventListener('change', (e) => {
      const target = e.target;
      const field = target.getAttribute('data-field');
      if (!field) return;
      const row = target.closest('.course-row');
      if (!row) return;
      const id = row.getAttribute('data-course-id');
      const course = state.semesterCourses.find((c) => String(c.id) === String(id));
      if (!course) return;

      if (field === 'credits' || field === 'percentage') {
        const clamped = clampFieldInput(field, target.value);
        course[field] = clamped;
        target.value = clamped === '' ? '' : String(clamped);
      } else {
        course[field] = target.value;
      }
      saveToStorage();
      if (field !== 'name') {
        calculateAndShow();
      }
    });

    container.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-action="remove-course"]');
      if (!removeBtn) return;
      const row = removeBtn.closest('.course-row');
      if (!row) return;
      const id = row.getAttribute('data-course-id');

      state.semesterCourses = state.semesterCourses.filter((c) => String(c.id) !== String(id));
      if (state.semesterCourses.length === 0) {
        state.semesterCourses.push(createBlankCourse());
      }
      saveToStorage();
      render();
      calculateAndShow();
      showToast('Course removed');
      trackEvent('course_removed', { tool: 'semester_gpa' });
    });

    // Mode toggle
    toggle.addEventListener('click', (e) => {
      if (e.target !== modeInput) {
        e.preventDefault();
      }
      state.semesterMode = state.semesterMode === 'grade' ? 'percentage' : 'grade';
      syncModeUI();
      saveToStorage();
      render();
      calculateAndShow();
      trackEvent('mode_toggled', { tool: 'semester_gpa', mode: state.semesterMode });
    });

    // Add course (inserts at top under Add Course button)
    addBtn.addEventListener('click', () => {
      state.semesterCourses.unshift(createBlankCourse());
      saveToStorage();
      render();
      const firstInput = container.querySelector('.course-row input[data-field="name"]');
      if (firstInput) firstInput.focus({ preventScroll: false });
      showToast('Course added');
      trackEvent('course_added', { tool: 'semester_gpa' });
    });

    // Calculate button
    calcBtn.addEventListener('click', () => {
      const { gpa, totalCredits } = calculateAndShow();
      if (totalCredits <= 0) {
        showToast('Enter credit hours for at least one course first', 'error');
        return;
      }
      scrollToResult();
      trackEvent('calculation_completed', {
        tool: 'semester_gpa',
        gpa: Number(gpa.toFixed(2)),
        gpa_bucket: gpaBucket(gpa),
        credits: totalCredits,
        mode: state.semesterMode,
      });
    });

    // Clear all
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all course data? This cannot be undone.')) {
        state.semesterCourses = [createBlankCourse()];
        saveToStorage();
        render();
        if (resultWrap) resultWrap.classList.add('hidden');
        showToast('Data cleared');
        trackEvent('data_cleared', { tool: 'semester_gpa' });
      }
    });

    // Share
    shareBtn.addEventListener('click', async () => {
      const gpa = document.getElementById('semesterGPAValue').textContent;
      const text = `My SZABIST Semester GPA is ${gpa}. Calculated with SZABIST GPA Calculator.`;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'My Semester GPA', text, url: window.location.href });
          trackEvent('result_shared', { tool: 'semester_gpa', method: 'web_share' });
        } catch (e) {
          // user cancelled
        }
      } else {
        try {
          await navigator.clipboard.writeText(text);
          showToast('Result copied to clipboard', 'success');
          trackEvent('result_shared', { tool: 'semester_gpa', method: 'clipboard' });
        } catch (e) {
          showToast('Unable to copy result', 'error');
        }
      }
    });

    // Initial render
    if (state.semesterCourses.length === 0) {
      state.semesterCourses = [createBlankCourse()];
    }
    syncModeUI();
    render();
    calculateAndShow({ initialLoad: true });

    trackEvent('calculator_started', { tool: 'semester_gpa' });
  }

  /* ------------------------------------------------------------------ */
  /*  CGPA page                                                         */
  /* ------------------------------------------------------------------ */
  function initCgpaPage() {
    const container = document.getElementById('semestersContainer');
    const toggle = document.getElementById('cgpaToggle');
    const gradeLabel = document.getElementById('cgpaGradeLabel');
    const percentLabel = document.getElementById('cgpaPercentLabel');
    const addBtn = document.getElementById('addSemesterBtn');
    const calcBtn = document.getElementById('calcCGPABtn');
    const clearBtn = document.getElementById('clearCGPABtn');
    const shareBtn = document.getElementById('shareCGPABtn');
    const resultWrap = document.getElementById('cgpaResult');
    const modeInput = document.getElementById('cgpaModeInput');

    function syncModeUI() {
      const isPercent = state.cgpaMode === 'percentage';
      toggle.classList.toggle('percentage', isPercent);
      toggle.setAttribute('aria-checked', String(isPercent));
      if (modeInput) modeInput.checked = isPercent;
      gradeLabel.classList.toggle('active', !isPercent);
      gradeLabel.classList.toggle('inactive', isPercent);
      percentLabel.classList.toggle('active', isPercent);
      percentLabel.classList.toggle('inactive', !isPercent);
    }

    function updateAddButton() {
      if (!addBtn) return;
      const maxed = state.semesters.length >= 8;
      addBtn.disabled = maxed;
      addBtn.classList.toggle('opacity-50', maxed);
      addBtn.classList.toggle('cursor-not-allowed', maxed);
    }

    function cgpaCourseRowMarkup(course, index) {
      const isPercentage = state.cgpaMode === 'percentage';
      const cid = escapeHtml(String(course.id));

      return `
        <div class="course-row" data-course-id="${cid}">
          <div class="flex flex-col">
            <label class="input-label md:hidden">Course Name</label>
            <input type="text" value="${escapeHtml(course.name || '')}"
                   placeholder="Course name"
                   data-field="name" aria-label="Course name"
                   class="input-field">
          </div>
          <div class="flex flex-col">
            <label class="input-label md:hidden">Credit Hours</label>
            <input type="number" min="0" max="6" step="1"
                   value="${escapeHtml(String(course.credits ?? ''))}"
                   placeholder="1–6" data-field="credits" aria-label="Credit hours"
                   class="input-field text-center">
          </div>
          <div class="flex flex-col">
            <label class="input-label md:hidden">${isPercentage ? 'Percentage' : 'Grade'}</label>
            ${performanceInputMarkup(state.cgpaMode, course)}
          </div>
          <div class="course-actions">
            <button type="button" class="btn-icon btn-icon--danger"
                    data-action="remove-cgpa-course"
                    title="Remove course" aria-label="Remove course ${index + 1}">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    function semesterCardMarkup(semester, semIndex) {
      const isPercentage = state.cgpaMode === 'percentage';
      const sid = escapeHtml(String(semester.id));
      const coursesHtml = semester.courses
        .map((c, idx) => cgpaCourseRowMarkup(c, idx))
        .join('');
      const deleteBtn = state.semesters.length > 1
        ? `<button type="button" class="btn-icon btn-icon--danger"
                   data-action="remove-semester"
                   title="Remove semester"
                   aria-label="Remove ${escapeHtml(semester.name || `Semester ${semIndex + 1}`)}">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                     d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
             </svg>
           </button>`
        : '';

      return `
        <div class="semester-card card card-lg" data-semester-id="${sid}">
          <div class="card-body">
            <div class="semester-card-header">
              <input type="text" value="${escapeHtml(semester.name || '')}"
                     placeholder="Semester ${semIndex + 1} (e.g. Fall 2026)"
                     data-field="semester-name"
                     aria-label="Semester ${semIndex + 1} title"
                     class="semester-title-input">
              <div class="semester-actions">
                <button type="button" class="btn-icon btn-icon--brass"
                        data-action="add-cgpa-course"
                        title="Add course to semester"
                        aria-label="Add course to ${escapeHtml(semester.name || `Semester ${semIndex + 1}`)}">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                </button>
                ${deleteBtn}
              </div>
            </div>
            <div class="course-header">
              <div>Course Name</div>
              <div class="text-center">Credits</div>
              <div class="text-center">${isPercentage ? 'Percentage' : 'Grade'}</div>
              <div></div>
            </div>
            <div class="course-list space-y-sm max-h-64 overflow-y-auto scrollbar-scholarly pr-2">
              ${coursesHtml}
            </div>
          </div>
        </div>
      `;
    }

    function render() {
      if (!container) return;
      container.innerHTML = state.semesters
        .map((s, idx) => semesterCardMarkup(s, idx))
        .join('');
      updateAddButton();
    }

    function scrollToCgpaResult() {
      if (resultWrap) resultWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function evaluateAllSemesters() {
      let totalPoints = 0;
      let totalCredits = 0;
      let semesterCount = 0;

      for (const semester of state.semesters) {
        const res = evaluateCourses(semester.courses || [], state.cgpaMode);
        if (res.totalCredits > 0) {
          totalPoints += res.totalPoints;
          totalCredits += res.totalCredits;
          semesterCount += 1;
        }
      }

      return {
        cgpa: totalCredits > 0 ? totalPoints / totalCredits : 0,
        totalCredits,
        semesterCount,
      };
    }

    function showResult(cgpa, credits, semesters, options = {}) {
      const valueEl = document.getElementById('cgpaValue');
      const badgeEl = document.getElementById('cgpaGradeBadge');
      const creditsEl = document.getElementById('cgpaCreditsValue');
      const semEl = document.getElementById('cgpaSemestersValue');
      if (!resultWrap || !valueEl) return;

      const wasHidden = resultWrap.classList.contains('hidden');
      const plaque = resultWrap.querySelector('.result-plaque');

      valueEl.textContent = cgpa.toFixed(2);
      valueEl.classList.remove('count-up');
      void valueEl.offsetWidth;
      valueEl.classList.add('count-up');

      const cls = gpaClassification(cgpa);
      if (badgeEl) {
        badgeEl.textContent = cls.label;
        badgeEl.className = `badge ${cls.badge}`;
      }
      if (creditsEl) creditsEl.textContent = String(credits);
      if (semEl) semEl.textContent = String(semesters);

      resultWrap.classList.remove('hidden');

      if (wasHidden && plaque) {
        plaque.style.animation = 'none';
        void plaque.offsetHeight;
        plaque.style.animation = '';
      }

      if (wasHidden && !options.initialLoad) {
        scrollToCgpaResult();
      }

      if (!options.initialLoad) {
        trackEvent('result_shown', { tool: 'cgpa', gpa: cgpa.toFixed(2) });
      }
    }

    function calculateAndShow(options = {}) {
      const { cgpa, totalCredits, semesterCount } = evaluateAllSemesters();
      if (totalCredits <= 0) {
        if (resultWrap) resultWrap.classList.add('hidden');
        return { cgpa: 0, totalCredits: 0, semesterCount: 0 };
      }
      showResult(cgpa, totalCredits, semesterCount, options);
      return { cgpa, totalCredits, semesterCount };
    }

    function scheduleCalc() {
      clearTimeout(debounceTimers.cgpa);
      debounceTimers.cgpa = setTimeout(() => {
        calculateAndShow();
      }, 250);
    }

    // Event delegation for semester & course inputs
    container.addEventListener('input', (e) => {
      const target = e.target;
      const field = target.getAttribute('data-field');
      if (!field) return;
      const card = target.closest('.semester-card');
      if (!card) return;
      const sid = card.getAttribute('data-semester-id');
      const semester = state.semesters.find((s) => String(s.id) === String(sid));
      if (!semester) return;

      if (field === 'semester-name') {
        semester.name = target.value;
        saveToStorage();
        return;
      }

      const row = target.closest('.course-row');
      if (!row) return;
      const cid = row.getAttribute('data-course-id');
      const course = semester.courses.find((c) => String(c.id) === String(cid));
      if (!course) return;

      course[field] = target.value;
      saveToStorage();
      if (field !== 'name') {
        scheduleCalc();
      }
    });

    container.addEventListener('change', (e) => {
      const target = e.target;
      const field = target.getAttribute('data-field');
      if (!field) return;
      const card = target.closest('.semester-card');
      if (!card) return;
      const sid = card.getAttribute('data-semester-id');
      const semester = state.semesters.find((s) => String(s.id) === String(sid));
      if (!semester) return;

      if (field === 'semester-name') {
        semester.name = target.value;
        saveToStorage();
        return;
      }

      const row = target.closest('.course-row');
      if (!row) return;
      const cid = row.getAttribute('data-course-id');
      const course = semester.courses.find((c) => String(c.id) === String(cid));
      if (!course) return;

      if (field === 'credits' || field === 'percentage') {
        const clamped = clampFieldInput(field, target.value);
        course[field] = clamped;
        target.value = clamped === '' ? '' : String(clamped);
      } else {
        course[field] = target.value;
      }
      saveToStorage();
      if (field !== 'name') {
        calculateAndShow();
      }
    });

    container.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.getAttribute('data-action');
      const card = actionBtn.closest('.semester-card');
      if (!card) return;
      const sid = card.getAttribute('data-semester-id');
      const semester = state.semesters.find((s) => String(s.id) === String(sid));
      if (!semester) return;

      if (action === 'add-cgpa-course') {
        semester.courses.push(createBlankCourse());
        saveToStorage();
        render();
        const safeSid = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(String(sid))
          : String(sid).replace(/["\\]/g, '\\$&');
        const updatedCard = container.querySelector(`.semester-card[data-semester-id="${safeSid}"]`);
        if (updatedCard) {
          const lastRow = updatedCard.querySelector('.course-row:last-child');
          if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        showToast('Course added');
        trackEvent('course_added', { tool: 'cgpa' });
      } else if (action === 'remove-cgpa-course') {
        const row = actionBtn.closest('.course-row');
        if (!row) return;
        const cid = row.getAttribute('data-course-id');
        semester.courses = semester.courses.filter((c) => String(c.id) !== String(cid));
        if (semester.courses.length === 0) {
          semester.courses.push(createBlankCourse());
        }
        saveToStorage();
        render();
        calculateAndShow();
        showToast('Course removed');
      } else if (action === 'remove-semester') {
        if (state.semesters.length <= 1) return;
        state.semesters = state.semesters.filter((s) => String(s.id) !== String(sid));
        saveToStorage();
        render();
        calculateAndShow();
        showToast('Semester removed');
        trackEvent('semester_removed', { tool: 'cgpa' });
      }
    });

    // Mode toggle
    toggle.addEventListener('click', (e) => {
      if (e.target !== modeInput) {
        e.preventDefault();
      }
      state.cgpaMode = state.cgpaMode === 'grade' ? 'percentage' : 'grade';
      syncModeUI();
      saveToStorage();
      render();
      calculateAndShow();
      trackEvent('mode_toggled', { tool: 'cgpa', mode: state.cgpaMode });
    });

    // Add semester
    addBtn.addEventListener('click', () => {
      if (state.semesters.length >= 8) return;
      state.semesters.push(createBlankSemester());
      saveToStorage();
      render();
      const lastCard = container.querySelector('.semester-card:last-child');
      if (lastCard) lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('Semester added');
      trackEvent('semester_added', { tool: 'cgpa' });
    });

    // Calculate button
    calcBtn.addEventListener('click', () => {
      const { cgpa, totalCredits, semesterCount } = calculateAndShow();
      if (totalCredits <= 0) {
        showToast('Enter credit hours for at least one course first', 'error');
        return;
      }
      scrollToCgpaResult();
      trackEvent('calculation_completed', {
        tool: 'cgpa',
        gpa: Number(cgpa.toFixed(2)),
        gpa_bucket: gpaBucket(cgpa),
        credits: totalCredits,
        semesters: semesterCount,
        mode: state.cgpaMode,
      });
    });

    // Clear all
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all semester data? This cannot be undone.')) {
        state.semesters = [createBlankSemester()];
        saveToStorage();
        render();
        if (resultWrap) resultWrap.classList.add('hidden');
        showToast('Data cleared');
        trackEvent('data_cleared', { tool: 'cgpa' });
      }
    });

    // Share
    shareBtn.addEventListener('click', async () => {
      const gpa = document.getElementById('cgpaValue').textContent;
      const text = `My SZABIST CGPA is ${gpa}. Calculated with SZABIST GPA Calculator.`;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'My CGPA', text, url: window.location.href });
          trackEvent('result_shared', { tool: 'cgpa', method: 'web_share' });
        } catch (e) {
          // cancelled
        }
      } else {
        try {
          await navigator.clipboard.writeText(text);
          showToast('Result copied to clipboard', 'success');
          trackEvent('result_shared', { tool: 'cgpa', method: 'clipboard' });
        } catch (e) {
          showToast('Unable to copy result', 'error');
        }
      }
    });

    // Initial render
    if (state.semesters.length === 0) {
      state.semesters = [createBlankSemester()];
    }
    syncModeUI();
    render();
    calculateAndShow({ initialLoad: true });

    trackEvent('calculator_started', { tool: 'cgpa' });
  }

  /* ------------------------------------------------------------------ */
  /*  Settings page                                                     */
  /* ------------------------------------------------------------------ */
  function initSettingsPage() {
    const consentCheckbox = document.getElementById('trackingConsent');
    const exportBtn = document.getElementById('exportDataBtn');
    const clearBtn = document.getElementById('clearAllDataBtn');

    if (consentCheckbox) {
      consentCheckbox.checked = getConsent();
      consentCheckbox.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        if (enabled) {
          setConsent(true);
          trackEvent('tracking_consent_changed', { granted: true });
        } else {
          trackEvent('tracking_consent_changed', { granted: false });
          setConsent(false);
        }
        showToast(enabled ? 'Tracking enabled' : 'Tracking disabled');
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        loadFromStorage();
        const data = JSON.stringify(state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'szabist-gpa-data.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported', 'success');
        trackEvent('data_exported');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Delete all saved courses, semesters, and settings? This cannot be undone.')) {
          state = { semesterMode: 'grade', cgpaMode: 'grade', semesterCourses: [], semesters: [] };
          saveToStorage();
          showToast('All data deleted');
          trackEvent('data_cleared', { tool: 'all' });
          setTimeout(() => { location.href = 'index.html'; }, 800);
        }
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Utilities                                                         */
  /* ------------------------------------------------------------------ */
  function escapeHtml(text) {
    if (text === null || text === undefined || text === '') return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function gpaBucket(gpa) {
    if (gpa >= 3.75) return '3.75-4.00';
    if (gpa >= 3.0) return '3.00-3.74';
    if (gpa >= 2.0) return '2.00-2.99';
    if (gpa >= 1.0) return '1.00-1.99';
    return '0.00-0.99';
  }

  /* ------------------------------------------------------------------ */
  /*  Theme toggle (light / dark)                                       */
  /* ------------------------------------------------------------------ */
  function getSavedTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // ignore
    }
  }

  const THEME_ICONS = {
    light: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
    </svg>`,
    dark: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
    </svg>`,
  };

  function setThemeIcon(btn, theme) {
    if (!btn) return;
    btn.innerHTML = theme === 'dark' ? THEME_ICONS.dark : THEME_ICONS.light;
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function applyTheme(theme) {
    const body = document.body;
    const btn = document.getElementById('themeToggleBtn');
    const metaTheme = document.querySelector('meta[name="theme-color"]');

    if (theme === 'dark') {
      body.classList.remove('light-theme');
      body.classList.add('dark-theme');
      if (metaTheme) metaTheme.setAttribute('content', '#16110d');
      saveTheme('dark');
    } else {
      body.classList.remove('dark-theme');
      body.classList.add('light-theme');
      if (metaTheme) metaTheme.setAttribute('content', '#faf8f3');
      saveTheme('light');
    }

    setThemeIcon(btn, theme);
  }

  function initTheme() {
    const body = document.body;
    const btn = document.getElementById('themeToggleBtn');
    const currentTheme = getSavedTheme() === 'dark' ? 'dark' : 'light';

    applyTheme(currentTheme);

    if (btn) {
      btn.addEventListener('click', () => {
        const nextTheme = body.classList.contains('dark-theme') ? 'light' : 'dark';
        applyTheme(nextTheme);
        trackEvent('theme_toggled', { theme: nextTheme });
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Mobile navigation (all pages)                                     */
  /* ------------------------------------------------------------------ */
  function initMobileNav() {
    const btn = document.getElementById('mobileMenuBtn');
    const nav = document.getElementById('mobileNav');
    if (!btn || !nav) return;

    let isOpen = false;

    function setOpen(next) {
      isOpen = next;
      btn.setAttribute('aria-expanded', String(isOpen));
      nav.classList.toggle('open', isOpen);
    }

    btn.addEventListener('click', () => setOpen(!isOpen));

    nav.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) setOpen(false);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Page router                                                       */
  /* ------------------------------------------------------------------ */
  function initPage(pageType) {
    loadFromStorage();

    if (pageType === 'semester') initSemesterPage();
    else if (pageType === 'cgpa') initCgpaPage();
    else if (pageType === 'settings') initSettingsPage();
  }

  /* ------------------------------------------------------------------ */
  /*  Global DOM ready — theme, mobile nav & placement slots            */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNav();
    initPlacementSlots();
  });

  /* ------------------------------------------------------------------ */
  /*  Expose public API                                                 */
  /* ------------------------------------------------------------------ */
  window.szabist = {
    initPage,
    activateSlot,
    trackEvent,
  };
})();
