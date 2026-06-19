// Grading Scale
const gradingScale = [
  { grade: "A+", min: 90, max: 100, gpa: 4.0 },
  { grade: "A", min: 85, max: 89, gpa: 3.75 },
  { grade: "A−", min: 80, max: 84, gpa: 3.5 },
  { grade: "B+", min: 75, max: 79, gpa: 3.25 },
  { grade: "B", min: 70, max: 74, gpa: 3.0 },
  { grade: "B−", min: 66, max: 69, gpa: 2.75 },
  { grade: "C+", min: 63, max: 65, gpa: 2.5 },
  { grade: "C", min: 60, max: 62, gpa: 2.0 },
  { grade: "C−", min: 55, max: 59, gpa: 1.5 },
  { grade: "F", min: 0, max: 54, gpa: 0.0 },
];

const gradeToGPA = {
  "A+": 4.0,
  A: 3.75,
  "A−": 3.5,
  "B+": 3.25,
  B: 3.0,
  "B−": 2.75,
  "C+": 2.5,
  C: 2.0,
  "C−": 1.5,
  F: 0.0,
};

// State
let semesterMode = "grade";
let cgpaMode = "grade";
let semesterCourses = [];
let semesters = [];

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadFromStorage();
  if (semesterCourses.length === 0) {
    addCourse("semester");
  } else {
    renderSemesterCourses();
  }
  if (semesters.length === 0) {
    addSemester();
  } else {
    renderSemesters();
  }
});

// Page Navigation
function showPage(page) {
  document.getElementById("homepage").classList.add("hidden");
  document.getElementById("semester-page").classList.add("hidden");
  document.getElementById("cgpa-page").classList.add("hidden");

  if (page === "home") {
    document.getElementById("homepage").classList.remove("hidden");
  } else if (page === "semester") {
    document.getElementById("semester-page").classList.remove("hidden");
  } else if (page === "cgpa") {
    document.getElementById("cgpa-page").classList.remove("hidden");
  }
}

// Toggle Mode
function toggleMode(type) {
  if (type === "semester") {
    semesterMode = semesterMode === "grade" ? "percentage" : "grade";
    updateToggleUI("semester", semesterMode);
    renderSemesterCourses();
  } else {
    cgpaMode = cgpaMode === "grade" ? "percentage" : "grade";
    updateToggleUI("cgpa", cgpaMode);
    renderSemesters();
  }
  saveToStorage();
}

function updateToggleUI(type, mode) {
  const toggle = document.getElementById(type + "Toggle");
  const gradeLabel = document.getElementById(type + "GradeLabel");
  const percentLabel = document.getElementById(type + "PercentLabel");
  const perfLabel = document.getElementById(type + "PerfLabel");

  if (mode === "percentage") {
    toggle.classList.add("percentage");
    gradeLabel.classList.remove("text-white");
    gradeLabel.classList.add("text-gray-400");
    percentLabel.classList.remove("text-gray-400");
    percentLabel.classList.add("text-white");
    if (perfLabel) perfLabel.textContent = "Percentage";
  } else {
    toggle.classList.remove("percentage");
    gradeLabel.classList.add("text-white");
    gradeLabel.classList.remove("text-gray-400");
    percentLabel.classList.add("text-gray-400");
    percentLabel.classList.remove("text-white");
    if (perfLabel) perfLabel.textContent = "Grade";
  }
}

// Semester GPA Functions
function addCourse(type, semesterId = null) {
  const course = {
    id: Date.now() + Math.random(),
    name: "",
    credits: "",
    grade: "A+",
    percentage: "",
  };

  if (type === "semester") {
    semesterCourses.push(course);
    renderSemesterCourses();
  } else {
    const semester = semesters.find((s) => s.id === semesterId);
    if (semester) {
      semester.courses.push(course);
      renderSemesters();
    }
  }
  saveToStorage();
}

function removeCourse(type, courseId, semesterId = null) {
  if (type === "semester") {
    semesterCourses = semesterCourses.filter((c) => c.id !== courseId);
    if (semesterCourses.length === 0) addCourse("semester");
    else renderSemesterCourses();
  } else {
    const semester = semesters.find((s) => s.id === semesterId);
    if (semester) {
      semester.courses = semester.courses.filter((c) => c.id !== courseId);
      if (semester.courses.length === 0) addCourse("cgpa", semesterId);
      else renderSemesters();
    }
  }
  saveToStorage();
}

function updateCourse(type, courseId, field, value, semesterId = null) {
  let course;
  if (type === "semester") {
    course = semesterCourses.find((c) => c.id === courseId);
  } else {
    const semester = semesters.find((s) => s.id === semesterId);
    if (semester) {
      course = semester.courses.find((c) => c.id === courseId);
    }
  }

  if (course) {
    if (field === "credits") {
      value = Math.max(0, parseInt(value) || 0);
    } else if (field === "percentage") {
      value = Math.min(100, Math.max(0, parseFloat(value) || 0));
    }
    course[field] = value;
    saveToStorage();
  }
}

function renderSemesterCourses() {
  const container = document.getElementById("semesterCourses");
  container.innerHTML = semesterCourses
    .map((course) => createCourseRow(course, "semester", semesterMode))
    .join("");
}

function createCourseRow(course, type, mode, semesterId = null) {
  const gradeOptions = Object.keys(gradeToGPA)
    .map(
      (g) =>
        `<option value="${g}" ${course.grade === g ? "selected" : ""}>${g}</option>`,
    )
    .join("");

  const performanceInput =
    mode === "grade"
      ? `<select onchange="updateCourse('${type}', ${course.id}, 'grade', this.value${semesterId ? ", " + semesterId : ""})" 
                    class="input-ledger w-full focus:outline-none">
                    ${gradeOptions}
                   </select>`
      : `<input type="number" min="0" max="100" value="${course.percentage}" placeholder="0-100"
                    onchange="updateCourse('${type}', ${course.id}, 'percentage', this.value${semesterId ? ", " + semesterId : ""})"
                    class="input-ledger w-full focus:outline-none text-center">`;

  return `
                <div class="course-row course-slip mb-3">
                    <div class="flex flex-col">
                        <label class="input-label md:hidden">Course Name</label>
                        <input type="text" value="${course.name}" placeholder="Enter Course Name"
                            onchange="updateCourse('${type}', ${course.id}, 'name', this.value${semesterId ? ", " + semesterId : ""})"
                            class="input-ledger w-full focus:outline-none">
                    </div>
                    <div class="flex flex-col">
                        <label class="input-label md:hidden">Credit Hours</label>
                        <input type="number" min="0" value="${course.credits}" placeholder="Credits"
                            onchange="updateCourse('${type}', ${course.id}, 'credits', this.value${semesterId ? ", " + semesterId : ""})"
                            class="input-ledger w-full focus:outline-none text-center">
                    </div>
                    <div class="flex flex-col">
                        <label class="input-label md:hidden">${mode === "grade" ? "Grade" : "Percentage"}</label>
                        ${performanceInput}
                    </div>
                    <div class="flex items-end md:items-center justify-end">
                        <button onclick="removeCourse('${type}', ${course.id}${semesterId ? ", " + semesterId : ""})" 
                            class="btn-delete" title="Delete Course">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
}

function percentageToGPA(percentage) {
  for (const scale of gradingScale) {
    if (percentage >= scale.min && percentage <= scale.max) {
      return { grade: scale.grade, gpa: scale.gpa };
    }
  }
  return { grade: "F", gpa: 0.0 };
}

function calculateSemesterGPA() {
  let totalPoints = 0;
  let totalCredits = 0;

  semesterCourses.forEach((course) => {
    const credits = parseInt(course.credits) || 0;
    if (credits > 0) {
      let gpa;
      if (semesterMode === "grade") {
        gpa = gradeToGPA[course.grade] || 0;
      } else {
        const percentage = parseFloat(course.percentage) || 0;
        gpa = percentageToGPA(percentage).gpa;
      }
      totalPoints += credits * gpa;
      totalCredits += credits;
    }
  });

  const gpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
  displayResult("semester", gpa, totalCredits);
}

function displayResult(type, gpa, credits, semesters = 0) {
  const resultDiv = document.getElementById(type + "Result");
  const gpaValue = document.getElementById(
    type === "semester" ? "semesterGPAValue" : "cgpaValue",
  );
  const creditsValue = document.getElementById(
    type === "semester" ? "semesterCreditsValue" : "cgpaCreditsValue",
  );
  const gradeLabel = document.getElementById(
    type === "semester" ? "semesterGradeLabel2" : "cgpaGradeLabel2",
  );

  gpaValue.textContent = gpa.toFixed(2);
  creditsValue.textContent = credits;

  if (type === "cgpa") {
    document.getElementById("cgpaSemestersValue").textContent = semesters;
  }

  // Determine grade classification
  let classification = "";
  let colorClass = "";
  if (gpa >= 3.75) {
    classification = "Dean's List";
    colorClass = "badge-dean";
  } else if (gpa >= 3.0) {
    classification = "Good Standing";
    colorClass = "badge-good";
  } else if (gpa >= 2.0) {
    classification = "Satisfactory";
    colorClass = "badge-satisfactory";
  } else if (gpa >= 1.0) {
    classification = "On Probation";
    colorClass = "badge-probation";
  } else {
    classification = "Academic Warning";
    colorClass = "badge-warning";
  }

  gradeLabel.textContent = classification;
  gradeLabel.className = `inline-block px-4 py-2 rounded-full text-sm font-semibold ${colorClass}`;

  resultDiv.classList.remove("hidden");
  resultDiv.scrollIntoView({ behavior: "smooth", block: "center" });
}

// CGPA Functions
function addSemester() {
  // Maximum 8 semesters allowed
  if (semesters.length >= 8) return;

  const semester = {
    id: Date.now(),
    name: "",
    courses: [
      {
        id: Date.now() + 1,
        name: "",
        credits: "",
        grade: "A+",
        percentage: "",
      },
    ],
  };
  semesters.push(semester);
  renderSemesters();
  saveToStorage();
}

function removeSemester(semesterId) {
  // Cannot delete if only 1 semester exists
  if (semesters.length <= 1) return;

  semesters = semesters.filter((s) => s.id !== semesterId);
  renderSemesters();
  saveToStorage();
}

function updateSemesterName(semesterId, name) {
  const semester = semesters.find((s) => s.id === semesterId);
  if (semester) {
    semester.name = name;
    saveToStorage();
  }
}

function renderSemesters() {
  const container = document.getElementById("semestersContainer");
  container.innerHTML = semesters
    .map((semester) => createSemesterCard(semester))
    .join("");

  // Update Add Semester button state (max 8 semesters)
  const addBtn = document.getElementById("addSemesterBtn");
  if (addBtn) {
    if (semesters.length >= 8) {
      addBtn.disabled = true;
      addBtn.classList.add("opacity-50", "cursor-not-allowed");
    } else {
      addBtn.disabled = false;
      addBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
  }
}

function createSemesterCard(semester) {
  const coursesHTML = semester.courses
    .map((course) => createCourseRow(course, "cgpa", cgpaMode, semester.id))
    .join("");

  // Only show delete button if there's more than 1 semester
  const deleteButtonHTML =
    semesters.length > 1
      ? `
                <button onclick="removeSemester(${semester.id})" 
                    class="btn-icon btn-icon-leather" title="Remove Semester">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            `
      : "";

  return `
                <div class="semester-card card-parchment rounded-xl p-4 md:p-6 mb-6">
                    <div class="flex items-center justify-between mb-4 border-b border-faded-gold pb-3">
                        <input type="text" value="${semester.name}" placeholder="Enter Semester No."
                            onchange="updateSemesterName(${semester.id}, this.value)"
                            class="semester-title-input">
                        <div class="flex items-center gap-2">
                            <button onclick="addCourse('cgpa', ${semester.id})" 
                                class="btn-icon btn-icon-brass" title="Add Course">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                                </svg>
                            </button>
                            ${deleteButtonHTML}
                        </div>
                    </div>
                    
                    <div class="course-slip-header">
                        <div>Course Name</div>
                        <div class="text-center">Credits</div>
                        <div class="text-center">${cgpaMode === "grade" ? "Grade" : "Percentage"}</div>
                        <div></div>
                    </div>
                    
                    <div class="space-y-3 max-h-64 overflow-y-auto scrollbar-scholarly pr-2">
                        ${coursesHTML}
                    </div>
                </div>
            `;
}

function calculateCGPA() {
  let totalPoints = 0;
  let totalCredits = 0;
  let semesterCount = 0;

  semesters.forEach((semester) => {
    let semesterHasCourse = false;
    semester.courses.forEach((course) => {
      const credits = parseInt(course.credits) || 0;
      if (credits > 0) {
        semesterHasCourse = true;
        let gpa;
        if (cgpaMode === "grade") {
          gpa = gradeToGPA[course.grade] || 0;
        } else {
          const percentage = parseFloat(course.percentage) || 0;
          gpa = percentageToGPA(percentage).gpa;
        }
        totalPoints += credits * gpa;
        totalCredits += credits;
      }
    });
    if (semesterHasCourse) semesterCount++;
  });

  const cgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
  displayResult("cgpa", cgpa, totalCredits, semesterCount);
}

// Storage Functions
function saveToStorage() {
  const data = {
    semesterMode,
    cgpaMode,
    semesterCourses,
    semesters,
  };
  localStorage.setItem("szabistGPA", JSON.stringify(data));
}

function loadFromStorage() {
  const data = localStorage.getItem("szabistGPA");
  if (data) {
    const parsed = JSON.parse(data);
    semesterMode = parsed.semesterMode || "grade";
    cgpaMode = parsed.cgpaMode || "grade";
    semesterCourses = parsed.semesterCourses || [];
    semesters = parsed.semesters || [];

    updateToggleUI("semester", semesterMode);
    updateToggleUI("cgpa", cgpaMode);
  }
}

function clearData(type) {
  if (
    confirm("Are you sure you want to clear all data? This cannot be undone.")
  ) {
    if (type === "semester") {
      semesterCourses = [];
      addCourse("semester");
      document.getElementById("semesterResult").classList.add("hidden");
    } else {
      semesters = [];
      addSemester();
      document.getElementById("cgpaResult").classList.add("hidden");
    }
    saveToStorage();
  }
}
