/* ==========================================================================
   SZABIST GPA Calculator — Application Logic (Phase 1)
   Shared across all pages. Exposes window.szabist.initPage(pageType).
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Grading scale (SZABIST undergraduate — confirmed)                 */
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
    { min: 3.75, label: "Dean's List",   badge: 'badge-dean' },
    { min: 3.0,  label: 'Good Standing', badge: 'badge-good' },
    { min: 2.0,  label: 'Satisfactory',  badge: 'badge-satisfactory' },
    { min: 1.0,  label: 'On Probation',  badge: 'badge-probation' },
    { min: 0.0,  label: 'Academic Warning', badge: 'badge-warning' },
  ];

  const STORAGE_KEY = 'szabistGPA_v2';
  const CONSENT_KEY = 'szabistConsent_v2';

  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */
  let state = {
    semesterMode: 'grade',   // 'grade' | 'percentage'
    cgpaMode: 'grade',
    semesterCourses: [],
    semesters: [],
  };

  let debounceTimers = {};

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
        state.semesterMode = parsed.semesterMode || 'grade';
        state.cgpaMode = parsed.cgpaMode || 'grade';
        state.semesterCourses = Array.isArray(parsed.semesterCourses) ? parsed.semesterCourses : [];
        state.semesters = Array.isArray(parsed.semesters) ? parsed.semesters : [];
      }
    } catch (e) {
      // Corrupt storage — reset
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Analytics consent                                                 */
  /* ------------------------------------------------------------------ */
  function getConsent() {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (raw === null) return null; // not asked yet
      return JSON.parse(raw).tracking === true;
    } catch (e) {
      return null;
    }
  }

  function setConsent(granted) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ tracking: granted, at: Date.now() }));
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
    const consent = getConsent();
    if (consent === false) return; // user opted out

    const payload = { ...data };

    if (umamiReady()) {
      window.umami.track(eventName, payload);
      return;
    }

    // Queue until Umami loads
    window.szabistAnalyticsQueue = window.szabistAnalyticsQueue || [];
    window.szabistAnalyticsQueue.push({ eventName, payload });

    // Process queued events once Umami is ready (only once)
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
  function percentageToGPA(percentage) {
    const p = Math.min(100, Math.max(0, parseFloat(percentage) || 0));
    for (const scale of gradingScale) {
      if (p >= scale.min && p <= scale.max) {
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

  function calculateCourses(courses, mode) {
    let totalPoints = 0;
    let totalCredits = 0;

    for (const course of courses) {
      const credits = parseInt(course.credits, 10) || 0;
      if (credits <= 0) continue;

      let gpa;
      if (mode === 'grade') {
        gpa = gradeToGPA[course.grade] || 0;
      } else {
        gpa = percentageToGPA(course.percentage).gpa;
      }

      totalPoints += credits * gpa;
      totalCredits += credits;
    }

    return totalCredits > 0 ? totalPoints / totalCredits : 0;
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
    toast.setAttribute('role', 'alert');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /* ------------------------------------------------------------------ */
  /*  Ad slot helpers (reserved — inactive by default)                  */
  /* ------------------------------------------------------------------ */
  function activateAdSlot(slotId) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    slot.classList.remove('empty');
    slot.classList.add('ad-loaded');
    slot.innerHTML = '';
    // Future: inject ad network script here. Layout is already reserved.
  }

  function collapseEmptySlots() {
    document.querySelectorAll('.ad-slot.empty').forEach((slot) => {
      slot.style.height = '0';
      slot.style.minHeight = '0';
      slot.style.padding = '0';
      slot.style.margin = '0';
      slot.style.border = 'none';
      slot.style.opacity = '0';
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering — generic helpers                                       */
  /* ------------------------------------------------------------------ */
  const optionsMarkup = (selectedGrade) =>
    Object.keys(gradeToGPA)
      .map((g) => `<option value="${g}" ${g === selectedGrade ? 'selected' : ''}>${g}</option>`)
      .join('');

  function performanceInput(mode, value, onChange, placeholder = '') {
    if (mode === 'grade') {
      return `
        <select class="input-field" onchange="${onChange}" aria-label="Grade">
          ${optionsMarkup(value || 'A+')}
        </select>
      `;
    }
    return `
      <input type="number" min="0" max="100" value="${value || ''}"
             placeholder="0–100" class="input-field text-center"
             onchange="${onChange}" aria-label="Percentage">
    `;
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

    // Restore toggle UI
    if (state.semesterMode === 'percentage') {
      toggle.classList.add('percentage');
      modeInput.checked = true;
      gradeLabel.classList.remove('active');
      gradeLabel.classList.add('inactive');
      percentLabel.classList.remove('inactive');
      percentLabel.classList.add('active');
      perfLabel.textContent = 'Percentage';
    } else {
      modeInput.checked = false;
    }

    // Render
    function render() {
      if (!container) return;
      container.innerHTML = state.semesterCourses
        .map((c, i) => courseRowMarkup('semester', c.id, c, i))
        .join('');
      attachCourseListeners();
      updateEmptyState();
    }

    function updateEmptyState() {
      if (!emptyState) return;
      emptyState.classList.toggle('hidden', state.semesterCourses.length > 0);
    }

    function courseRowMarkup(type, id, course, index) {
      const isPercentage = state[type === 'cgpa' ? 'cgpaMode' : 'semesterMode'] === 'percentage';
      const onChange = `window.szabist.updateCourse('${type}', ${id}, 'percentage', this.value)`;
      const onSelect = `window.szabist.updateCourse('${type}', ${id}, 'grade', this.value)`;
      const perf = isPercentage
        ? performanceInput('percentage', course.percentage, onChange)
        : performanceInput('grade', course.grade, onSelect);

      return `
        <div class="course-row" data-id="${id}">
          <div class="flex flex-col">
            <label class="input-label md:hidden">Course Name</label>
            <input type="text" value="${escapeHtml(course.name || '')}"
                   placeholder="Course name"
                   onchange="window.szabist.updateCourse('${type}', ${id}, 'name', this.value)"
                   class="input-field">
          </div>
          <div class="flex flex-col">
            <label class="input-label md:hidden">Credit Hours</label>
            <input type="number" min="0" max="6" value="${escapeHtml(course.credits || '')}"
                   placeholder="Credits"
                   onchange="window.szabist.updateCourse('${type}', ${id}, 'credits', this.value)"
                   class="input-field text-center">
          </div>
          <div class="flex flex-col">
            <label class="input-label md:hidden">${isPercentage ? 'Percentage' : 'Grade'}</label>
            ${perf}
          </div>
          <div class="course-actions">
            <button type="button" class="btn-icon"
                    onclick="window.szabist.removeCourse('${type}', ${id})"
                    title="Remove course"
                    aria-label="Remove course ${index + 1}">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    function attachCourseListeners() {
      document.querySelectorAll('#semesterCourses .course-row').forEach((row) => {
        const id = Number(row.dataset.id);
        const inputs = row.querySelectorAll('input, select');
        inputs.forEach((input) => {
          input.addEventListener('input', () => {
            scheduleCalc('semester');
          });
          input.addEventListener('change', () => {
            saveToStorage();
          });
        });
      });
    }

    function scheduleCalc(type) {
      clearTimeout(debounceTimers[type]);
      debounceTimers[type] = setTimeout(() => {
        calculateAndShow(type);
      }, 300);
    }

    function calculateAndShow(type) {
      if (type === 'semester') {
        const gpa = calculateCourses(state.semesterCourses, state.semesterMode);
        const credits = state.semesterCourses.reduce(
          (sum, c) => sum + (parseInt(c.credits, 10) || 0), 0
        );
        showResult('semester', gpa, credits);
      }
    }

    function showResult(type, gpa, credits) {
      const wrap = document.getElementById(`${type}Result`);
      const valueEl = document.getElementById(`${type === 'semester' ? 'semesterGPAValue' : 'cgpaValue'}`);
      const badgeEl = document.getElementById(`${type === 'semester' ? 'semesterGradeBadge' : 'cgpaGradeBadge'}`);
      const creditsEl = document.getElementById(type === 'semester' ? 'semesterCreditsValue' : 'cgpaCreditsValue');

      if (!wrap || !valueEl) return;

      const wasHidden = wrap.classList.contains('hidden');
      const plaque = wrap.querySelector('.result-plaque');

      // Animate number
      valueEl.textContent = gpa.toFixed(2);
      valueEl.classList.remove('count-up');
      void valueEl.offsetWidth;
      valueEl.classList.add('count-up');

      const cls = gpaClassification(gpa);
      badgeEl.textContent = cls.label;
      badgeEl.className = `badge ${cls.badge}`;
      if (creditsEl) creditsEl.textContent = credits;

      wrap.classList.remove('hidden');

      // Restart plaque fade-in animation when result first becomes visible
      if (wasHidden && plaque) {
        plaque.style.animation = 'none';
        void plaque.offsetHeight; // force reflow
        plaque.style.animation = '';
      }

      // Scroll into view when the result first becomes visible (auto-calc or manual)
      if (wasHidden) {
        scrollToResult();
      }

      trackEvent('result_shown', { tool: type, gpa: gpa.toFixed(2) });
    }

    function scrollToResult() {
      const wrap = document.getElementById('semesterResult');
      if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Toggle mode
    toggle.addEventListener('click', () => {
      state.semesterMode = state.semesterMode === 'grade' ? 'percentage' : 'grade';
      modeInput.checked = state.semesterMode === 'percentage';

      if (state.semesterMode === 'percentage') {
        toggle.classList.add('percentage');
        gradeLabel.classList.remove('active'); gradeLabel.classList.add('inactive');
        percentLabel.classList.remove('inactive'); percentLabel.classList.add('active');
        perfLabel.textContent = 'Percentage';
      } else {
        toggle.classList.remove('percentage');
        gradeLabel.classList.remove('inactive'); gradeLabel.classList.add('active');
        percentLabel.classList.remove('active'); percentLabel.classList.add('inactive');
        perfLabel.textContent = 'Grade';
      }

      saveToStorage();
      render();
      scheduleCalc('semester');

      trackEvent('mode_toggled', { tool: 'semester_gpa', mode: state.semesterMode });
    });

    // Add course
    addBtn.addEventListener('click', () => {
      const course = {
        id: Date.now() + Math.random(),
        name: '',
        credits: '',
        grade: 'A+',
        percentage: '',
      };
      state.semesterCourses.push(course);
      saveToStorage();
      render();
      showToast('Course added');
      trackEvent('course_added', { tool: 'semester_gpa' });
    });

    window.szabist.updateCourse = (type, id, field, value) => {
      if (type !== 'semester') return;

      const course = state.semesterCourses.find((c) => c.id === id);
      if (!course) return;

        if (field === 'credits') {
          course.credits = Math.max(0, Math.min(6, parseInt(value, 10) || 0));
        } else if (field === 'percentage') {
          course.percentage = Math.min(100, Math.max(0, parseFloat(value) || 0));
        } else if (field === 'name') {
          course.name = value;
        } else if (field === 'grade') {
          course.grade = value;
        }
        saveToStorage();
        scheduleCalc('semester');
    };

    window.szabist.removeCourse = (type, id) => {
      if (type === 'semester') {
        state.semesterCourses = state.semesterCourses.filter((c) => c.id !== id);
        if (state.semesterCourses.length === 0) {
          state.semesterCourses.push({
            id: Date.now() + Math.random(), name: '', credits: '', grade: 'A+', percentage: '',
          });
        }
        saveToStorage();
        render();
        showToast('Course removed');
        trackEvent('course_removed', { tool: 'semester_gpa' });
      }
    };

    // Calculate button
    calcBtn.addEventListener('click', () => {
      calculateAndShow('semester');
      scrollToResult();
      const gpa = calculateCourses(state.semesterCourses, state.semesterMode);
      const credits = state.semesterCourses.reduce(
        (sum, c) => sum + (parseInt(c.credits, 10) || 0), 0
      );
      trackEvent('calculation_completed', {
        tool: 'semester_gpa',
        gpa,
        gpa_bucket: gpaBucket(gpa),
        credits,
        mode: state.semesterMode,
      });
    });

    // Clear all
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all course data? This cannot be undone.')) {
        state.semesterCourses = [];
        state.semesterCourses.push({
          id: Date.now() + Math.random(), name: '', credits: '', grade: 'A+', percentage: '',
        });
        saveToStorage();
        render();
        document.getElementById('semesterResult').classList.add('hidden');
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
          showToast('Result copied to clipboard');
          trackEvent('result_shared', { tool: 'semester_gpa', method: 'clipboard' });
        } catch (e) {
          showToast('Unable to copy result', 'error');
        }
      }
    });

    // Init
    loadFromStorage();
    render();
    calculateAndShow('semester');

    // Track page view (Umami auto-tracks, but fire custom)
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

    if (state.cgpaMode === 'percentage') {
      toggle.classList.add('percentage');
      modeInput.checked = true;
      gradeLabel.classList.remove('active'); gradeLabel.classList.add('inactive');
      percentLabel.classList.remove('inactive'); percentLabel.classList.add('active');
    } else {
      modeInput.checked = false;
    }

    function updateAddButton() {
      if (!addBtn) return;
      if (state.semesters.length >= 8) {
        addBtn.disabled = true;
        addBtn.classList.add('opacity-50', 'cursor-not-allowed');
      } else {
        addBtn.disabled = false;
        addBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }

    function render() {
      if (!container) return;
      container.innerHTML = state.semesters.map((s) => semesterCardMarkup(s)).join('');
      attachCgpaListeners();
      updateAddButton();
    }

    function semesterCardMarkup(semester) {
      const isPercentage = state.cgpaMode === 'percentage';
      const coursesHtml = semester.courses.map((c) => cgpaCourseRowMarkup(semester.id, c)).join('');
      const deleteBtn = state.semesters.length > 1
        ? `<button type="button" class="btn-icon btn-icon--danger"
                   onclick="window.szabist.removeSemester(${semester.id})"
                   title="Remove semester" aria-label="Remove semester ${escapeHtml(semester.name || 'Untitled')}">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                     d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
             </svg>
           </button>`
        : '';

      return `
        <div class="semester-card card card-lg" data-id="${semester.id}">
          <div class="semester-card-header">
            <input type="text" value="${escapeHtml(semester.name || '')}"
                   placeholder="Semester No."
                   onchange="window.szabist.updateSemesterName(${semester.id}, this.value)"
                   class="semester-title-input">
            <div class="semester-actions">
              <button type="button" class="btn-icon btn-icon--brass"
                      onclick="window.szabist.addCgpaCourse(${semester.id})"
                      title="Add course" aria-label="Add course to ${escapeHtml(semester.name || 'semester')}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      `;
    }

    function cgpaCourseRowMarkup(semesterId, course) {
      const isPercentage = state.cgpaMode === 'percentage';
      const onChange = `window.szabist.updateCgpaCourseValue(${semesterId}, ${course.id}, this.value)`;
      const onSelect = `window.szabist.updateCgpaCourseGrade(${semesterId}, ${course.id}, this.value)`;
      const perf = isPercentage
        ? `<input type="number" min="0" max="100" value="${escapeHtml(course.percentage || '')}"
                  placeholder="0–100" class="input-field text-center" onchange="${onChange}">`
        : `<select class="input-field" onchange="${onSelect}">${optionsMarkup(course.grade || 'A+')}</select>`;

      return `
        <div class="course-row" data-id="${course.id}">
          <div class="flex flex-col">
            <label class="input-label md:hidden">Course Name</label>
            <input type="text" value="${escapeHtml(course.name || '')}"
                   placeholder="Course name"
                   onchange="window.szabist.updateCgpaCourseName(${semesterId}, ${course.id}, this.value)"
                   class="input-field">
          </div>
          <div class="flex flex-col">
            <label class="input-label md:hidden">Credit Hours</label>
            <input type="number" min="0" max="6" value="${escapeHtml(course.credits || '')}"
                   placeholder="Credits"
                   onchange="window.szabist.updateCgpaCourseCredits(${semesterId}, ${course.id}, this.value)"
                   class="input-field text-center">
          </div>
          <div class="flex flex-col">
            <label class="input-label md:hidden">${isPercentage ? 'Percentage' : 'Grade'}</label>
            ${perf}
          </div>
          <div class="course-actions">
            <button type="button" class="btn-icon"
                    onclick="window.szabist.removeCgpaCourse(${semesterId}, ${course.id})"
                    title="Remove course" aria-label="Remove course">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    function attachCgpaListeners() {
      document.querySelectorAll('.semester-card').forEach((card) => {
        const semesterId = Number(card.dataset.id);
        card.querySelectorAll('input, select').forEach((input) => {
          input.addEventListener('input', () => {
            scheduleCalc('cgpa');
          });
          input.addEventListener('change', saveToStorage);
        });
      });
    }

    function scheduleCalc(type) {
      clearTimeout(debounceTimers[type]);
      debounceTimers[type] = setTimeout(() => {
        calculateAndShow(type);
      }, 300);
    }

    function calculateAndShow(type) {
      if (type === 'cgpa') {
        let totalPoints = 0;
        let totalCredits = 0;
        let semesterCount = 0;

        for (const semester of state.semesters) {
          let hasCourse = false;
          for (const course of semester.courses) {
            const credits = parseInt(course.credits, 10) || 0;
            if (credits <= 0) continue;
            hasCourse = true;
            let gpa;
            if (state.cgpaMode === 'grade') {
              gpa = gradeToGPA[course.grade] || 0;
            } else {
              gpa = percentageToGPA(course.percentage).gpa;
            }
            totalPoints += credits * gpa;
            totalCredits += credits;
          }
          if (hasCourse) semesterCount++;
        }

        const cgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
        showResult('cgpa', cgpa, totalCredits, semesterCount);
      }
    }

    function showResult(type, gpa, credits, semesters) {
      const wrap = document.getElementById(`${type}Result`);
      const valueEl = document.getElementById(`${type === 'semester' ? 'semesterGPAValue' : 'cgpaValue'}`);
      const badgeEl = document.getElementById(`${type === 'semester' ? 'semesterGradeBadge' : 'cgpaGradeBadge'}`);
      const creditsEl = document.getElementById(`${type === 'semester' ? 'semesterCreditsValue' : 'cgpaCreditsValue'}`);
      const semEl = document.getElementById('cgpaSemestersValue');

      if (!wrap || !valueEl) return;

      const wasHidden = wrap.classList.contains('hidden');
      const plaque = wrap.querySelector('.result-plaque');

      valueEl.textContent = gpa.toFixed(2);
      valueEl.classList.remove('count-up');
      void valueEl.offsetWidth;
      valueEl.classList.add('count-up');

      const cls = gpaClassification(gpa);
      badgeEl.textContent = cls.label;
      badgeEl.className = `badge ${cls.badge}`;
      if (creditsEl) creditsEl.textContent = credits;
      if (semEl) semEl.textContent = semesters;

      wrap.classList.remove('hidden');

      // Restart plaque fade-in animation when result first becomes visible
      if (wasHidden && plaque) {
        plaque.style.animation = 'none';
        void plaque.offsetHeight; // force reflow
        plaque.style.animation = '';
      }

      // Scroll into view when the result first becomes visible (auto-calc or manual)
      if (wasHidden) {
        scrollToCgpaResult();
      }

      trackEvent('result_shown', { tool: type, gpa: gpa.toFixed(2) });
    }

    function scrollToCgpaResult() {
      const wrap = document.getElementById('cgpaResult');
      if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Toggle mode
    toggle.addEventListener('click', () => {
      state.cgpaMode = state.cgpaMode === 'grade' ? 'percentage' : 'grade';
      modeInput.checked = state.cgpaMode === 'percentage';

      if (state.cgpaMode === 'percentage') {
        toggle.classList.add('percentage');
        gradeLabel.classList.remove('active'); gradeLabel.classList.add('inactive');
        percentLabel.classList.remove('inactive'); percentLabel.classList.add('active');
      } else {
        toggle.classList.remove('percentage');
        gradeLabel.classList.remove('inactive'); gradeLabel.classList.add('active');
        percentLabel.classList.remove('active'); percentLabel.classList.add('inactive');
      }

      saveToStorage();
      render();
      scheduleCalc('cgpa');

      trackEvent('mode_toggled', { tool: 'cgpa', mode: state.cgpaMode });
    });

    // Add semester
    addBtn.addEventListener('click', () => {
      if (state.semesters.length >= 8) return;
      const semester = {
        id: Date.now(),
        name: '',
        courses: [{ id: Date.now() + 1, name: '', credits: '', grade: 'A+', percentage: '' }],
      };
      state.semesters.push(semester);
      saveToStorage();
      render();
      showToast('Semester added');
      trackEvent('semester_added', { tool: 'cgpa' });
    });

    // Remove semester
    window.szabist.removeSemester = (semesterId) => {
      if (state.semesters.length <= 1) return;
      state.semesters = state.semesters.filter((s) => s.id !== semesterId);
      saveToStorage();
      render();
      showToast('Semester removed');
      trackEvent('semester_removed', { tool: 'cgpa' });
    };

    window.szabist.updateSemesterName = (id, name) => {
      const semester = state.semesters.find((s) => s.id === id);
      if (semester) semester.name = name;
      saveToStorage();
    };

    window.szabist.addCgpaCourse = (semesterId) => {
      const semester = state.semesters.find((s) => s.id === semesterId);
      if (!semester) return;
      semester.courses.push({
        id: Date.now() + Math.random(), name: '', credits: '', grade: 'A+', percentage: '',
      });
      saveToStorage();
      render();
    };

    window.szabist.removeCgpaCourse = (semesterId, courseId) => {
      const semester = state.semesters.find((s) => s.id === semesterId);
      if (!semester) return;
      semester.courses = semester.courses.filter((c) => c.id !== courseId);
      if (semester.courses.length === 0) {
        semester.courses.push({ id: Date.now() + 1, name: '', credits: '', grade: 'A+', percentage: '' });
      }
      saveToStorage();
      render();
    };

    window.szabist.updateCgpaCourseName = (sid, cid, value) => {
      const s = state.semesters.find((x) => x.id === sid);
      if (!s) return;
      const c = s.courses.find((x) => x.id === cid);
      if (c) c.name = value;
      saveToStorage();
    };

    window.szabist.updateCgpaCourseCredits = (sid, cid, value) => {
      const s = state.semesters.find((x) => x.id === sid);
      if (!s) return;
      const c = s.courses.find((x) => x.id === cid);
      if (c) c.credits = Math.max(0, Math.min(6, parseInt(value, 10) || 0));
      saveToStorage();
      scheduleCalc('cgpa');
    };

    window.szabist.updateCgpaCourseGrade = (sid, cid, value) => {
      const s = state.semesters.find((x) => x.id === sid);
      if (!s) return;
      const c = s.courses.find((x) => x.id === cid);
      if (c) c.grade = value;
      saveToStorage();
      scheduleCalc('cgpa');
    };

    window.szabist.updateCgpaCourseValue = (sid, cid, value) => {
      const s = state.semesters.find((x) => x.id === sid);
      if (!s) return;
      const c = s.courses.find((x) => x.id === cid);
      if (c) c.percentage = Math.min(100, Math.max(0, parseFloat(value) || 0));
      saveToStorage();
      scheduleCalc('cgpa');
    };

    // Calculate
    calcBtn.addEventListener('click', () => {
      calculateAndShow('cgpa');
      scrollToCgpaResult();
      let totalPoints = 0;
      let totalCredits = 0;
      let semesterCount = 0;
      for (const semester of state.semesters) {
        let hasCourse = false;
        for (const course of semester.courses) {
          const credits = parseInt(course.credits, 10) || 0;
          if (credits <= 0) continue;
          hasCourse = true;
          let gpa;
          if (state.cgpaMode === 'grade') {
            gpa = gradeToGPA[course.grade] || 0;
          } else {
            gpa = percentageToGPA(course.percentage).gpa;
          }
          totalPoints += credits * gpa;
          totalCredits += credits;
        }
        if (hasCourse) semesterCount++;
      }
      const cgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
      trackEvent('calculation_completed', {
        tool: 'cgpa',
        gpa: cgpa,
        gpa_bucket: gpaBucket(cgpa),
        credits: totalCredits,
        semesters: semesterCount,
        mode: state.cgpaMode,
      });
    });

    // Clear all
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all semester data? This cannot be undone.')) {
        state.semesters = [{
          id: Date.now(), name: '',
          courses: [{ id: Date.now() + 1, name: '', credits: '', grade: 'A+', percentage: '' }],
        }];
        saveToStorage();
        render();
        document.getElementById('cgpaResult').classList.add('hidden');
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
        } catch (e) { /* cancelled */ }
      } else {
        try {
          await navigator.clipboard.writeText(text);
          showToast('Result copied to clipboard');
          trackEvent('result_shared', { tool: 'cgpa', method: 'clipboard' });
        } catch (e) {
          showToast('Unable to copy result', 'error');
        }
      }
    });

    // Init
    loadFromStorage();
    if (state.semesters.length === 0) {
      state.semesters = [{
        id: Date.now(), name: '',
        courses: [{ id: Date.now() + 1, name: '', credits: '', grade: 'A+', percentage: '' }],
      }];
    }
    render();
    calculateAndShow('cgpa');

    trackEvent('calculator_started', { tool: 'cgpa' });
  }

  /* ------------------------------------------------------------------ */
  /*  Settings page                                                     */
  /* ------------------------------------------------------------------ */
  function initSettingsPage() {
    const consentCheckbox = document.getElementById('trackingConsent');
    const exportBtn = document.getElementById('exportDataBtn');
    const clearBtn = document.getElementById('clearAllDataBtn');

    const consent = getConsent();
    if (consentCheckbox) {
      consentCheckbox.checked = consent === true;
      consentCheckbox.addEventListener('change', (e) => {
        setConsent(e.target.checked);
        trackEvent('tracking_consent_changed', { granted: e.target.checked });
        showToast(e.target.checked ? 'Tracking enabled' : 'Tracking disabled');
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const data = JSON.stringify(state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'szabist-gpa-data.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported');
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
          // Redirect to home so user isn't stuck on empty settings
          setTimeout(() => { location.href = 'index.html'; }, 800);
        }
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Utilities                                                         */
  /* ------------------------------------------------------------------ */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
  const THEME_KEY = 'szabistTheme_v2';

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
    const icon = theme === 'dark' ? THEME_ICONS.dark : THEME_ICONS.light;
    btn.innerHTML = icon;
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function applyTheme(theme) {
    const body = document.body;
    const btn = document.getElementById('themeToggleBtn');

    if (theme === 'dark') {
      body.classList.remove('light-theme');
      body.classList.add('dark-theme');
      saveTheme('dark');
    } else {
      body.classList.remove('dark-theme');
      body.classList.add('light-theme');
      saveTheme('light');
    }

    setThemeIcon(btn, theme);
  }

  function initTheme() {
    const body = document.body;
    const btn = document.getElementById('themeToggleBtn');

    // Default to light theme
    let currentTheme = getSavedTheme();
    if (!currentTheme) {
      currentTheme = 'light';
      body.classList.add('light-theme');
    } else if (currentTheme === 'dark') {
      body.classList.remove('light-theme');
      body.classList.add('dark-theme');
    } else {
      body.classList.add('light-theme');
    }

    if (btn) {
      setThemeIcon(btn, currentTheme);
      btn.addEventListener('click', () => {
        const isDark = body.classList.contains('dark-theme');
        applyTheme(isDark ? 'light' : 'dark');
        trackEvent('theme_toggled', { theme: isDark ? 'light' : 'dark' });
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

    function toggle() {
      isOpen = !isOpen;
      btn.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        nav.classList.add('open');
      } else {
        nav.classList.remove('open');
      }
    }

    btn.addEventListener('click', toggle);

    // Close when a nav link is clicked
    nav.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        isOpen = false;
        btn.setAttribute('aria-expanded', 'false');
        nav.classList.remove('open');
      });
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        isOpen = false;
        btn.setAttribute('aria-expanded', 'false');
        nav.classList.remove('open');
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Page router                                                       */
  /* ------------------------------------------------------------------ */
  function initPage(pageType) {
    loadFromStorage();
    collapseEmptySlots();

    if (pageType === 'semester') initSemesterPage();
    else if (pageType === 'cgpa') initCgpaPage();
    else if (pageType === 'settings') initSettingsPage();

    // Global: share + track helper exposed
    window.szabist.trackEvent = trackEvent;
  }

  /* ------------------------------------------------------------------ */
  /*  Global DOM ready — theme, mobile nav + consent banner             */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNav();
  });

  /* ------------------------------------------------------------------ */
  /*  Expose public API                                                 */
  /* ------------------------------------------------------------------ */
  window.szabist = {
    initPage,
    updateCourse: () => {},
    removeCourse: () => {},
    removeSemester: () => {},
    updateSemesterName: () => {},
    addCgpaCourse: () => {},
    removeCgpaCourse: () => {},
    updateCgpaCourseName: () => {},
    updateCgpaCourseCredits: () => {},
    updateCgpaCourseGrade: () => {},
    updateCgpaCourseValue: () => {},
    trackEvent,
  };

})();
