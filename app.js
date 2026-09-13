import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, remove, runTransaction, onValue } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const page = document.body.dataset.page;
const message = document.querySelector("#message");
const configured = !firebaseConfig.apiKey.startsWith("PASTE_");
if (!configured) setMessage("Firebase is not configured yet. Follow the setup instructions before testing.");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const h = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const setMessage = text => { if (message) message.textContent = text; };
const usernameKey = value => value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
const accountEmail = user => `${usernameKey(user)}@platform.example`;
const isAdmin = async uid => (await get(ref(db, `admins/${uid}`))).val() === true;
const redirect = url => { window.location.href = url; };
let creatingAccount = false;
const stemSubjects = ["Physics", "Biology", "Chemistry", "Mathematics", "Engineering", "Gardening", "Cooking"];
const literatureSubjects = ["English", "French", "History", "Art and design", "Detectivism and Mysteries"];
const allSubjects = [...stemSubjects, ...literatureSubjects];
const requiredSubjects = new Set(["Mathematics", "English", "French"]);
const examDates = ["November 2026", "January 2027", "June 2027"];

function logOutLink() {
  document.querySelector("#logout")?.addEventListener("click", async event => {
    event.preventDefault();
    try { await signOut(auth); } finally { window.location.replace("index.html"); }
  });
}

async function requireUser(user, adminOnly = false) {
  if (!user) { redirect("index.html"); return null; }
  const profile = (await get(ref(db, `users/${user.uid}/profile`))).val();
  const admin = await isAdmin(user.uid);
  if (adminOnly && !admin) { redirect("home.html"); return null; }
  return { user, profile, admin };
}

function authPage() {
  onAuthStateChanged(auth, user => { if (user && !creatingAccount) redirect("home.html"); });
  document.querySelector("#login-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const username = usernameKey(document.querySelector("#login-user").value);
    if (!username) return setMessage("Use letters, numbers, dots, dashes, or underscores in the user name.");
    try { await signInWithEmailAndPassword(auth, accountEmail(username), document.querySelector("#login-password").value); redirect("home.html"); }
    catch { setMessage("The user name or password is not correct."); }
  });
  document.querySelector("#signup-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const name = document.querySelector("#signup-name").value.trim();
    const username = usernameKey(document.querySelector("#signup-user").value);
    const password = document.querySelector("#signup-password").value;
    const age = Number(document.querySelector("#signup-age").value);
    if (!name || !username || !Number.isInteger(age)) return setMessage("Please enter a name, a valid user name, and age.");
    try {
      creatingAccount = true;
      const credential = await createUserWithEmailAndPassword(auth, accountEmail(username), password);
      const reservation = await runTransaction(ref(db, `usernames/${username}`), current => current === null ? credential.user.uid : undefined);
      if (!reservation.committed) { await credential.user.delete(); creatingAccount = false; return setMessage("That user name is already used."); }
      await set(ref(db, `users/${credential.user.uid}/profile`), { name, username, age, createdAt: Date.now() });
      await set(ref(db, `users/${credential.user.uid}/property`), { placeName: "Not set", rent: 0, address: "Not set", size: "Not set" });
      creatingAccount = false;
      redirect("home.html");
    } catch (error) { creatingAccount = false; setMessage(error.code === "auth/email-already-in-use" ? "That user name is already used." : "Could not create the account. Passwords need at least 6 characters."); }
  });
}

async function homePage(user) {
  const data = await requireUser(user); if (!data) return;
  document.querySelector("#welcome").textContent = `Welcome, ${data.profile?.name || "User"}`;
  if (Number(data.profile?.age) > 19) document.querySelector("#school-link").remove();
  else document.querySelector("#school-page-link").href = "school-register.html";
  if (data.admin) document.querySelector("#admin-link").innerHTML = '- <a href="admin.html">Administrator home</a>';
  const preferences = (await get(ref(db, `users/${user.uid}/preferences`))).val() || {};
  const color = /^#[0-9a-f]{6}$/i.test(preferences.backgroundColor || "") ? preferences.backgroundColor : "#ffffff";
  document.body.style.backgroundColor = color;
  const colourInput = document.querySelector("#background-color");
  colourInput.value = color;
  colourInput.addEventListener("input", () => { document.body.style.backgroundColor = colourInput.value; });
  document.querySelector("#background-form").addEventListener("submit", async event => {
    event.preventDefault(); const backgroundColor = colourInput.value;
    try {
      await set(ref(db, `users/${user.uid}/preferences/backgroundColor`), backgroundColor);
      document.body.style.backgroundColor = backgroundColor; setMessage("Your home-page background colour was saved.");
    } catch { setMessage("Could not save the colour. Please try again."); }
  });
  logOutLink();
}

async function propertyPage(user) {
  const data = await requireUser(user); if (!data) return;
  const property = (await get(ref(db, `users/${user.uid}/property`))).val() || {};
  document.querySelector("#property-details").innerHTML = `<b>Place name:</b> ${h(property.placeName || "Not set")}<br><b>Rent per month:</b> ${h(property.rent || 0)}<br><b>Address:</b> ${h(property.address || "Not set")}<br><b>Size:</b> ${h(property.size || "Not set")}`;
}

async function propertyRequestPage(user) {
  const data = await requireUser(user); if (!data) return;
  const property = (await get(ref(db, `users/${user.uid}/property`))).val() || {};
  for (const key of ["placeName", "rent", "address", "size"]) document.querySelector(`#${key}`).value = property[key] ?? "";
  document.querySelector("#property-request-form").addEventListener("submit", async event => {
    event.preventDefault();
    const requestedProperty = { placeName: document.querySelector("#placeName").value.trim(), rent: Number(document.querySelector("#rent").value), address: document.querySelector("#address").value.trim(), size: document.querySelector("#size").value.trim() };
    await set(push(ref(db, "propertyEditRequests")), { uid: user.uid, userName: data.profile?.name || data.profile?.username, property: requestedProperty, requestedAt: Date.now() });
    setMessage("Your edit request was sent to the admin.");
  });
}

async function taxesPage(user) {
  const data = await requireUser(user); if (!data) return;
  const taxes = (await get(ref(db, `users/${user.uid}/taxes`))).val() || { status: "unpaid", amount: 0 };
  document.querySelector("#tax-details").innerHTML = `<b>Status:</b> ${h(taxes.status)}<br><b>Amount:</b> ${h(taxes.amount)}`;
  const form = (await get(ref(db, `users/${user.uid}/taxForm`))).val();
  document.querySelector("#tax-form-link").innerHTML = form && taxes.status !== "paid" ? '- <a href="tax-form.html">Open your tax form and pay</a>' : "You must receive a tax form from the admin before you can pay.";
}

async function userTaxFormPage(user) {
  const data = await requireUser(user); if (!data) return;
  const form = (await get(ref(db, `users/${user.uid}/taxForm`))).val();
  const taxes = (await get(ref(db, `users/${user.uid}/taxes`))).val() || {};
  const details = document.querySelector("#tax-form-details");
  if (!form || taxes.status === "paid") { details.textContent = "There is no unpaid tax form for you."; return; }
  details.innerHTML = `<b>Tax amount to pay:</b> ${h(form.amount)}`;
  const payForm = document.querySelector("#pay-tax-form"); payForm.hidden = false;
  payForm.addEventListener("submit", async event => {
    event.preventDefault();
    await set(ref(db, `taxPaymentRequests/${user.uid}`), { uid: user.uid, userName: data.profile?.name || data.profile?.username || "User", amount: form.amount, requestedAt: Date.now() });
    setMessage("Your payment request was sent to the admin.");
  });
}

async function schoolPage(user) {
  const data = await requireUser(user); if (!data) return;
  if (Number(data.profile?.age) > 19) return redirect("home.html");
  const school = (await get(ref(db, `users/${user.uid}/school`))).val();
  if (![...requiredSubjects].every(subject => school?.subjects?.[subject]?.taken)) return redirect("school-register.html");
  document.querySelector("#school-details").textContent = "Your subjects are saved.";
  document.querySelector("#school-links").hidden = false;
}

async function schoolRegisterPage(user) {
  const data = await requireUser(user); if (!data) return;
  if (Number(data.profile?.age) > 19) return redirect("home.html");
}

async function subjectsPage(user, subjects) {
  const data = await requireUser(user); if (!data) return;
  if (Number(data.profile?.age) > 19) return redirect("home.html");
  const saved = ((await get(ref(db, `users/${user.uid}/school/subjects`))).val()) || {};
  const rows = document.querySelector("#subject-rows");
  rows.innerHTML = subjects.map(subject => {
    const item = saved[subject] || {}; const required = requiredSubjects.has(subject);
    const options = examDates.map(date => `<option${item.examDate === date ? " selected" : ""}>${date}</option>`).join("");
    return `<tr><td>${h(subject)}</td><td><input type="checkbox" data-subject="${h(subject)}"${item.taken || required ? " checked" : ""}${required ? " disabled" : ""}></td><td><select data-date="${h(subject)}" required><option value="">Choose an exam date</option>${options}</select></td></tr>`;
  }).join("");
  document.querySelector("#subjects-form").addEventListener("submit", async event => {
    event.preventDefault(); const changes = {};
    subjects.forEach(subject => {
      const taken = requiredSubjects.has(subject) || rows.querySelector(`[data-subject="${subject}"]`).checked;
      changes[subject] = taken ? { taken: true, examDate: rows.querySelector(`[data-date="${subject}"]`).value } : null;
    });
    if (Object.values(changes).some(item => item?.taken && !item.examDate)) return setMessage("Choose one of the three exam dates for every selected subject.");
    await update(ref(db, `users/${user.uid}/school/subjects`), changes);
    await set(ref(db, `users/${user.uid}/school/registeredAt`), Date.now());
    setMessage("Your subjects were saved.");
  });
}

function selectedSubjects(school) {
  return Object.entries(school?.subjects || {}).filter(([, value]) => value?.taken).map(([subject]) => subject);
}

async function homeworksPage(user) {
  const data = await requireUser(user); if (!data) return;
  const school = (await get(ref(db, `users/${user.uid}/school`))).val(); const taken = new Set(selectedSubjects(school));
  if (!taken.size) return redirect("school-register.html");
  const homework = (await get(ref(db, "homeworks"))).val() || {}; const area = document.querySelector("#homework-list"); area.innerHTML = "";
  const assignments = Object.entries(homework).filter(([, item]) => taken.has(item.subject));
  if (!assignments.length) area.textContent = "There are no homeworks for your selected subjects.";
  assignments.forEach(([id, item]) => {
    const box = document.createElement("div"); const questions = Object.values(item.questions || {});
    box.innerHTML = `<hr><b>${h(item.subject)}: ${h(item.title)}</b><form id="work-${id}">${questions.map((question, index) => `<p>${index + 1}. ${h(question.text)}<br><select name="q${index}" required><option value="">Choose an answer</option>${Object.values(question.choices || {}).map(choice => `<option value="${h(choice)}">${h(choice)}</option>`).join("")}</select></p>`).join("")}<button>Submit homework</button></form><div id="result-${id}"></div>`;
    area.append(box);
    const result = box.querySelector(`#result-${id}`);
    onValue(ref(db, `homeworkSubmissions/${id}/${user.uid}`), snap => {
      const submission = snap.val();
      if (!submission) return;
      result.innerHTML = submission.grade === undefined ? "Homework submitted. Waiting for the admin to review and grade it." : `<p><b>Overall grade: ${h(submission.grade)}%</b><br>Correct answers: ${h(Object.values(submission.correctAnswers || {}).join(", "))}</p>`;
    });
    box.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault(); const answers = {};
      questions.forEach((question, index) => { answers[index] = box.querySelector(`[name="q${index}"]`).value; });
      await set(ref(db, `homeworkSubmissions/${id}/${user.uid}`), { answers, submittedAt: Date.now() });
    });
  });
}

async function gradesPage(user) {
  const data = await requireUser(user); if (!data) return;
  const school = (await get(ref(db, `users/${user.uid}/school`))).val() || {}; const grades = school.grades || {}; const taken = selectedSubjects(school);
  document.querySelector("#grades-table").innerHTML = taken.length ? taken.map(subject => `<tr><td>${h(subject)}</td><td>${h(grades[subject] ?? "Not graded")}</td></tr>`).join("") : "<tr><td colspan=\"2\">Choose your subjects first.</td></tr>";
}

async function upcomingExamsPage(user) {
  const data = await requireUser(user); if (!data) return;
  const school = (await get(ref(db, `users/${user.uid}/school`))).val(); const taken = new Set(selectedSubjects(school));
  const exams = (await get(ref(db, "upcomingExams"))).val() || {}; const list = Object.values(exams).filter(exam => taken.has(exam.subject));
  document.querySelector("#exam-list").innerHTML = list.length ? list.map(exam => `<hr><b>${h(exam.subject)}</b><br>${h(exam.date)}<br>${h(exam.details)}`).join("") : "There are no upcoming exams for your selected subjects.";
}

async function propertyRequestsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const requests = (await get(ref(db, "propertyEditRequests"))).val() || {};
  const area = document.querySelector("#requests"); area.innerHTML = "";
  if (!Object.keys(requests).length) area.textContent = "There are no property edit requests.";
  Object.entries(requests).forEach(([id, request]) => {
    const p = request.property || {}; const box = document.createElement("div");
    box.innerHTML = `<hr><b>${h(request.userName)}</b><br>Place: ${h(p.placeName)}<br>Rent: ${h(p.rent)}<br>Address: ${h(p.address)}<br>Size: ${h(p.size)}<br>`;
    const accept = document.createElement("button"); accept.textContent = "Accept and edit property"; accept.onclick = async () => { await set(ref(db, `users/${request.uid}/property`), p); await remove(ref(db, `propertyEditRequests/${id}`)); location.reload(); };
    const deny = document.createElement("button"); deny.textContent = "Deny"; deny.onclick = async () => { await remove(ref(db, `propertyEditRequests/${id}`)); location.reload(); };
    box.append(accept, document.createTextNode(" "), deny); area.append(box);
  });
}

async function taxFormsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const requests = (await get(ref(db, "taxPaymentRequests"))).val() || {}; const area = document.querySelector("#requests"); area.innerHTML = "";
  if (!Object.keys(requests).length) area.textContent = "There are no tax forms.";
  Object.entries(requests).forEach(([id, request]) => {
    const box = document.createElement("div"); box.innerHTML = `<hr><b>${h(request.userName)}</b> sent a tax payment request for ${h(request.amount)}.<br>`;
    const accept = document.createElement("button"); accept.textContent = "Accept: mark paid"; accept.onclick = async () => { await update(ref(db, `users/${request.uid}/taxes`), { status: "paid" }); await remove(ref(db, `users/${request.uid}/taxForm`)); await remove(ref(db, `taxPaymentRequests/${id}`)); location.reload(); };
    const deny = document.createElement("button"); deny.textContent = "Deny"; deny.onclick = async () => { await remove(ref(db, `taxPaymentRequests/${id}`)); location.reload(); };
    box.append(accept, document.createTextNode(" "), deny); area.append(box);
  });
}

async function taxSettingsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#users"); area.innerHTML = "";
  Object.entries(users).forEach(([uid, record]) => {
    const box = document.createElement("div"); const tax = record.taxes || { status: "unpaid", amount: 0 };
    box.innerHTML = `<hr><b>${h(record.profile?.name || record.profile?.username || "User")}</b><br>Amount: <input type="number" min="0" value="${h(tax.amount)}"> Status: <select><option value="unpaid">unpaid</option><option value="paid">paid</option></select> `;
    box.querySelector("select").value = tax.status;
    const save = document.createElement("button"); save.textContent = "Save"; save.onclick = async () => { await set(ref(db, `users/${uid}/taxes`), { amount: Number(box.querySelector("input").value), status: box.querySelector("select").value }); setMessage("Tax settings saved."); };
    const issue = document.createElement("button"); issue.textContent = "Issue tax form"; issue.onclick = async () => { const amount = Number(box.querySelector("input").value); await update(ref(db), { [`users/${uid}/taxes`]: { amount, status: "unpaid" }, [`users/${uid}/taxForm`]: { amount, issuedAt: Date.now() } }); setMessage("Tax form issued."); };
    box.append(save, document.createTextNode(" "), issue); area.append(box);
  });
}

async function schoolRecordsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#records"); area.innerHTML = "";
  const registered = Object.values(users).filter(record => record.school?.registeredAt);
  area.innerHTML = registered.length ? registered.map(record => `<hr><b>${h(record.profile?.name || record.profile?.username)}</b><br>Age: ${h(record.profile?.age)}<br>Subjects: ${h(selectedSubjects(record.school).join(", ") || "None yet")}`).join("") : "There are no school registrations.";
}

function addSubjectOptions(element) {
  element.innerHTML = allSubjects.map(subject => `<option>${h(subject)}</option>`).join("");
}

async function adminHomeworksPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  addSubjectOptions(document.querySelector("#homework-subject"));
  const questions = document.querySelector("#question-fields");
  questions.innerHTML = [1, 2, 3].map(number => `<hr><b>Question ${number}${number === 1 ? " (required)" : " (optional)"}</b><br>Question: <input id="question-${number}"${number === 1 ? " required" : ""}><br>Choices (one per line):<br><textarea id="choices-${number}" rows="4" cols="35"${number === 1 ? " required" : ""}></textarea><br>Correct answer: <input id="answer-${number}">`).join("");
  document.querySelector("#homework-form").addEventListener("submit", async event => {
    event.preventDefault(); const savedQuestions = []; const answers = [];
    for (let number = 1; number <= 3; number++) {
      const text = document.querySelector(`#question-${number}`).value.trim(); if (!text) continue;
      const choices = document.querySelector(`#choices-${number}`).value.split("\n").map(value => value.trim()).filter(Boolean);
      const answer = document.querySelector(`#answer-${number}`).value.trim();
      if (choices.length < 2 || !choices.includes(answer)) return setMessage(`Question ${number} needs at least two choices, and its correct answer must exactly match one choice.`);
      savedQuestions.push({ text, choices }); answers.push(answer);
    }
    const id = push(ref(db, "homeworks")).key;
    await update(ref(db), { [`homeworks/${id}`]: { subject: document.querySelector("#homework-subject").value, title: document.querySelector("#homework-title").value.trim(), questions: savedQuestions, createdAt: Date.now() }, [`homeworkAnswerKeys/${id}`]: { answers } });
    setMessage("Homework was created."); document.querySelector("#homework-form").reset(); location.reload();
  });
  const items = (await get(ref(db, "homeworks"))).val() || {}; const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#admin-homework-list"); area.innerHTML = "";
  if (!Object.keys(items).length) area.textContent = "No homeworks yet.";
  for (const [id, item] of Object.entries(items)) {
    const submissions = (await get(ref(db, `homeworkSubmissions/${id}`))).val() || {}; const answerKey = (await get(ref(db, `homeworkAnswerKeys/${id}`))).val() || {}; const box = document.createElement("div");
    box.innerHTML = `<hr><b>${h(item.subject)}: ${h(item.title)}</b><br>Submissions: ${h(Object.keys(submissions).length)}`;
    Object.entries(submissions).forEach(([uid, submission]) => {
      const review = document.createElement("div"); const studentName = users[uid]?.profile?.name || users[uid]?.profile?.username || "Student";
      review.innerHTML = `<br><b>${h(studentName)}</b><br>Student answers: ${h(Object.values(submission.answers || {}).join(", "))}<br>Correct answers: ${h(Object.values(answerKey.answers || {}).join(", "))}<br>Overall grade (0-100): <input type="number" min="0" max="100" value="${h(submission.grade ?? "")}"> `;
      const saveGrade = document.createElement("button"); saveGrade.textContent = "Save grade"; saveGrade.onclick = async () => {
        const grade = Number(review.querySelector("input").value);
        if (!Number.isFinite(grade) || grade < 0 || grade > 100) return setMessage("Enter a grade from 0 to 100.");
        await update(ref(db, `homeworkSubmissions/${id}/${uid}`), { grade, correctAnswers: answerKey.answers || [], gradedAt: Date.now() });
        setMessage(`Saved ${studentName}'s homework grade.`);
      };
      review.append(saveGrade); box.append(review);
    });
    const removeButton = document.createElement("button"); removeButton.textContent = "Remove homework"; removeButton.onclick = async () => { await remove(ref(db, `homeworks/${id}`)); await remove(ref(db, `homeworkAnswerKeys/${id}`)); location.reload(); }; box.append(document.createTextNode(" "), removeButton); area.append(box);
  }
}

async function adminGradesPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#student-grades"); area.innerHTML = "";
  Object.entries(users).forEach(([uid, record]) => {
    const subjects = selectedSubjects(record.school); if (!subjects.length) return;
    const box = document.createElement("div"); box.innerHTML = `<hr><b>${h(record.profile?.name || record.profile?.username || "Student")}</b><br>`;
    subjects.forEach(subject => {
      const row = document.createElement("div"); row.innerHTML = `${h(subject)}: <input type="text" value="${h(record.school?.grades?.[subject] ?? "")}" placeholder="Grade"> `;
      const save = document.createElement("button"); save.textContent = "Save"; save.onclick = async () => { await set(ref(db, `users/${uid}/school/grades/${subject}`), row.querySelector("input").value.trim()); setMessage("Grade saved."); }; row.append(save); box.append(row);
    }); area.append(box);
  });
  if (!area.children.length) area.textContent = "No students have chosen subjects yet.";
}

async function adminExamsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  addSubjectOptions(document.querySelector("#exam-subject"));
  document.querySelector("#exam-form").addEventListener("submit", async event => {
    event.preventDefault(); await set(push(ref(db, "upcomingExams")), { subject: document.querySelector("#exam-subject").value, date: document.querySelector("#exam-date").value, details: document.querySelector("#exam-details").value.trim() }); setMessage("Upcoming exam added."); event.target.reset(); location.reload();
  });
  const exams = (await get(ref(db, "upcomingExams"))).val() || {}; const area = document.querySelector("#admin-exam-list"); area.innerHTML = "";
  if (!Object.keys(exams).length) area.textContent = "No upcoming exams yet.";
  Object.entries(exams).forEach(([id, exam]) => { const row = document.createElement("div"); row.innerHTML = `<hr><b>${h(exam.subject)}</b>: ${h(exam.date)} - ${h(exam.details)} `; const removeButton = document.createElement("button"); removeButton.textContent = "Remove"; removeButton.onclick = async () => { await remove(ref(db, `upcomingExams/${id}`)); location.reload(); }; row.append(removeButton); area.append(row); });
}

if (page === "auth") {
  authPage();
} else onAuthStateChanged(auth, async user => {
  if (!user) return redirect("index.html");
  try {
    if (page === "home") await homePage(user);
    if (page === "property") await propertyPage(user);
    if (page === "property-request") await propertyRequestPage(user);
    if (page === "taxes") await taxesPage(user);
    if (page === "user-tax-form") await userTaxFormPage(user);
    if (page === "school") await schoolPage(user);
    if (page === "school-register") await schoolRegisterPage(user);
    if (page === "stem-subjects") await subjectsPage(user, stemSubjects);
    if (page === "literature-subjects") await subjectsPage(user, literatureSubjects);
    if (page === "homeworks") await homeworksPage(user);
    if (page === "grades") await gradesPage(user);
    if (page === "upcoming-exams") await upcomingExamsPage(user);
    if (page === "admin") { const data = await requireUser(user, true); if (data) logOutLink(); }
    if (page === "property-requests") await propertyRequestsPage(user);
    if (page === "tax-forms") await taxFormsPage(user);
    if (page === "tax-settings") await taxSettingsPage(user);
    if (page === "school-records") await schoolRecordsPage(user);
    if (page === "admin-homeworks") await adminHomeworksPage(user);
    if (page === "admin-grades") await adminGradesPage(user);
    if (page === "admin-exams") await adminExamsPage(user);
  } catch (error) { console.error(error); setMessage("There was a Firebase error. Check setup and permissions."); }
});
